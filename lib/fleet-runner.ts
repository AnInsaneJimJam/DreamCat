"use client";

import { watchBook, watchFills, type BookSnapshot, type Fill, type LiveMarketRow } from "./dreamdex";
import { dedupeAccents, tickFleet, type FleetCat, type FleetSlotData } from "./fleet";
import { acquireAsset, buildMarketContext } from "./market-context";
import { SDK_GAS_LIMIT } from "./burner";
import { TEMPLATES, flattenForReconfigure, stepSim, type Archetype, type MarketContext, type StrategyParams } from "./strategy";
import { gasHeadroom, type BurnerWallet, type GasHeadroom } from "./burner";
import {
  canTradeLive,
  deriveIntent,
  executeIntent,
  initialLiveCatState,
  realizedFromClose,
  type LiveCatState,
  type LiveIntent,
} from "./live-fleet";

const STORAGE_KEY = "dreamcat-fleet-v1";
const KNOWN_ARCHETYPES = new Set<Archetype>(TEMPLATES.map((template) => template.archetype));
const TICK_MS = 1000;
const PERSIST_MS = 5000;

export const EMPTY_BOOK: BookSnapshot = {
  bids: [],
  asks: [],
  bidDepth: 0,
  askDepth: 0,
  mid: null,
  spread: null,
  imbalance: null,
};

export interface FleetLive extends FleetSlotData {
  book: BookSnapshot;
  fills: Fill[];
  ctx?: MarketContext;
}

export type FleetMode = "dry" | "live";

export interface FleetRunnerState {
  cats: FleetCat[];
  running: boolean;
  mode: FleetMode;
  bankroll: number;
  live: Record<number, FleetLive>;
  hydrated: boolean;
  storageError: boolean;
  droppedPositions: number;
  burnerReady: boolean;
}

const INITIAL_STATE: FleetRunnerState = {
  cats: [],
  running: false,
  mode: "dry",
  bankroll: 1000,
  live: {},
  hydrated: false,
  storageError: false,
  droppedPositions: 0,
  burnerReady: false,
};

interface MarketWatch {
  stop: () => void;
  book: BookSnapshot;
  fills: Fill[];
}

let state: FleetRunnerState = INITIAL_STATE;
let markets: LiveMarketRow[] = [];
let tickTimer: ReturnType<typeof setInterval> | null = null;
let lastPersistAt = 0;

const listeners = new Set<() => void>();
const watches = new Map<string, MarketWatch>();
const assetRefs = new Map<string, () => void>();

function emit() {
  for (const listener of listeners) listener();
}

function commit(patch: Partial<FleetRunnerState>) {
  state = { ...state, ...patch };
  emit();
}

function persist(immediate: boolean) {
  if (!state.hydrated || typeof window === "undefined") return;
  const now = Date.now();
  if (!immediate && now - lastPersistAt < PERSIST_MS) return;
  lastPersistAt = now;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ cats: state.cats, running: state.running, mode: state.mode, bankroll: state.bankroll })
    );
  } catch {
    if (!state.storageError) commit({ storageError: true });
  }
}

function tradableMarket(marketId: string | undefined): LiveMarketRow | undefined {
  if (!marketId) return undefined;
  const market = markets.find((row) => row.id === marketId);
  if (!market || market.expiry <= Date.now()) return undefined;
  return market;
}

function slotDataFor(cats: FleetCat[]): Map<number, FleetLive> {
  const live = new Map<number, FleetLive>();
  for (const cat of cats) {
    const watch = watches.get(cat.marketId);
    if (!watch) continue;
    const market = tradableMarket(cat.marketId);
    live.set(cat.slot, {
      book: watch.book,
      fills: watch.fills,
      ctx: market ? buildMarketContext(market) : undefined,
    });
  }
  return live;
}

function publishLive() {
  const live: Record<number, FleetLive> = {};
  for (const [slot, data] of slotDataFor(state.cats)) live[slot] = data;
  commit({ live });
}

function syncAssets(desiredMarkets: Set<string>) {
  const desiredAssets = new Set<string>();
  for (const marketId of desiredMarkets) {
    const market = tradableMarket(marketId);
    if (market?.asset) desiredAssets.add(market.asset.trim().toUpperCase());
  }
  for (const [asset, release] of [...assetRefs]) {
    if (desiredAssets.has(asset)) continue;
    release();
    assetRefs.delete(asset);
  }
  for (const asset of desiredAssets) {
    if (assetRefs.has(asset)) continue;
    assetRefs.set(asset, acquireAsset(asset));
  }
}

function syncWatches() {
  const desired = new Set<string>();
  if (state.running) {
    for (const cat of state.cats) {
      if (tradableMarket(cat.marketId)) desired.add(cat.marketId);
    }
  }
  syncAssets(desired);
  for (const [marketId, watch] of [...watches]) {
    if (desired.has(marketId)) continue;
    watch.stop();
    watches.delete(marketId);
  }
  for (const marketId of desired) {
    if (watches.has(marketId)) continue;
    const market = tradableMarket(marketId);
    if (!market) continue;
    const entry: MarketWatch = { stop: () => {}, book: EMPTY_BOOK, fills: [] };
    watches.set(marketId, entry);
    const stopBook = watchBook(market.yesSymbol, (book) => {
      entry.book = book;
      publishLive();
    }, market);
    const stopFills = watchFills(market.yesSymbol, (fills) => {
      entry.fills = fills;
      publishLive();
    });
    entry.stop = () => {
      stopBook();
      stopFills();
    };
  }
  publishLive();
}

let burner: BurnerWallet | null = null;
const inFlight = new Set<number>();
const errorCooldown = new Map<number, number>();
const ERROR_COOLDOWN_MS = 15000;
const GAS_CHECK_MS = 10000;

let gasStatus: GasHeadroom | null = null;
let gasCheckedAt = 0;
let gasChecking = false;

function refreshGasHeadroom(address: `0x${string}`, now: number): void {
  if (gasChecking || now - gasCheckedAt < GAS_CHECK_MS) return;
  gasChecking = true;
  void gasHeadroom(address)
    .then((next) => {
      gasStatus = next;
      gasCheckedAt = Date.now();
    })
    .catch(() => {
      gasCheckedAt = Date.now();
    })
    .finally(() => {
      gasChecking = false;
    });
}

function gasShortfallMessage(status: GasHeadroom): string {
  const required = Number(status.required) / 1e18;
  const balance = Number(status.balance) / 1e18;
  return `Not enough gas to submit. The SDK reserves ${SDK_GAS_LIMIT.toLocaleString()} gas per transaction, so this wallet needs at least ${required.toFixed(3)} STT and holds ${balance.toFixed(3)}. Send more gas from the cat wallet panel.`;
}

export function setFleetBurner(next: BurnerWallet | null): void {
  burner = next;
  if (!next && state.mode === "live") {
    commit({ burnerReady: false, mode: "dry" });
    persist(true);
    syncRun();
    return;
  }
  commit({ burnerReady: next !== null });
}

export function fleetBurnerAddress(): string | null {
  return burner?.address ?? null;
}

function patchCat(slot: number, patch: (cat: FleetCat) => FleetCat): void {
  commit({ cats: state.cats.map((cat) => (cat.slot === slot ? patch(cat) : cat)) });
}

function liveOf(cat: FleetCat): LiveCatState {
  return cat.live ?? initialLiveCatState;
}

function appendLiveNote(sim: FleetCat["sim"], ts: number, detail: string): FleetCat["sim"] {
  return { ...sim, log: [{ ts, action: "hold" as const, detail }, ...sim.log].slice(0, 60) };
}

function catToken(cat: FleetCat): string {
  return `${cat.slot}:${cat.marketId}:${cat.archetype}`;
}

function liveEquity(cat: FleetCat, book: BookSnapshot | null): number {
  const live = liveOf(cat);
  const position = cat.sim.position;
  if (!position || !book) return live.realizedPnl;
  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  if (bestBid == null || bestAsk == null) return live.realizedPnl;
  const mark = position.side === "YES" ? bestBid : 1 - bestAsk;
  const entry = live.entryPrice ?? position.entryPrice;
  return live.realizedPnl + (mark - entry) * position.size;
}

export function liveOpenPositions(): FleetCat[] {
  return state.cats.filter((cat) => cat.live != null && cat.sim.position != null);
}

function releaseSlots(kept: FleetCat[]): void {
  const alive = new Set(kept.map((cat) => cat.slot));
  for (const slot of [...inFlight]) if (!alive.has(slot)) inFlight.delete(slot);
  for (const slot of [...errorCooldown.keys()]) if (!alive.has(slot)) errorCooldown.delete(slot);
}

function liveTick(now: number): void {
  const active = burner;
  if (!active) return;
  refreshGasHeadroom(active.address, now);
  const shortOfGas = gasStatus != null && !gasStatus.ok ? gasShortfallMessage(gasStatus) : null;
  const data = slotDataFor(state.cats);
  const pending: Array<{ cat: FleetCat; market: LiveMarketRow; intent: LiveIntent; proposed: FleetCat["sim"] }> = [];

  const cats = state.cats.map((cat) => {
    const slotData = data.get(cat.slot);
    const book = slotData?.book ?? null;
    const withEquity = (next: FleetCat): FleetCat => ({
      ...next,
      equityHist: [...next.equityHist, liveEquity(next, book)].slice(-80),
    });

    if (!canTradeLive(cat.archetype)) return withEquity(cat);
    if (inFlight.has(cat.slot)) return withEquity(cat);
    const cooldown = errorCooldown.get(cat.slot);
    if (cooldown != null && now < cooldown) return withEquity(cat);
    if (!slotData || !slotData.book.bids.length) return withEquity(cat);
    const market = tradableMarket(cat.marketId);
    if (!market) {
      if (cat.sim.position == null) return withEquity(cat);
      const stranded = "This window expired while the position was open. The tokens are still in the cat wallet and settle by claiming, not by selling.";
      if (liveOf(cat).lastError === stranded) return withEquity(cat);
      return withEquity({ ...cat, live: { ...liveOf(cat), status: "error", lastError: stranded } });
    }

    const proposed = stepSim(
      { archetype: cat.archetype, params: cat.params },
      cat.sim,
      slotData.book,
      slotData.fills,
      now,
      slotData.ctx
    );
    const intent = deriveIntent(cat.sim, proposed, slotData.book);

    if (!intent) return withEquity(proposed === cat.sim ? cat : { ...cat, sim: proposed });

    if (shortOfGas) {
      const live = liveOf(cat);
      if (live.lastError === shortOfGas) return withEquity(cat);
      return withEquity({ ...cat, live: { ...live, status: "error", lastError: shortOfGas } });
    }

    pending.push({ cat, market, intent, proposed });
    return withEquity({ ...cat, live: { ...liveOf(cat), status: "submitting", lastError: undefined } });
  });

  commit({ cats });

  for (const { cat, market, intent, proposed } of pending) {
    const slot = cat.slot;
    const token = catToken(cat);
    const entryBefore = liveOf(cat).entryPrice;
    inFlight.add(slot);

    const guard = (patch: (current: FleetCat) => FleetCat) => {
      if (state.mode !== "live") return;
      const current = state.cats.find((item) => item.slot === slot);
      if (!current || catToken(current) !== token) return;
      patchCat(slot, patch);
    };

    void executeIntent(active.privateKey, market, intent)
      .then((result) => {
        errorCooldown.delete(slot);
        guard((current) => {
          const live = liveOf(current);
          const orders = live.orders + 1;

          if (result.dust) {
            return {
              ...current,
              sim: appendLiveNote(
                { ...current.sim, position: null },
                now,
                `Closed ${intent.outcome} dust of ${intent.size.toFixed(4)} · below one lot, nothing left to sell`
              ),
              live: { ...live, status: "idle", orders: live.orders, entryPrice: null, lastError: undefined },
            };
          }

          if (result.filled <= 0) {
            return {
              ...current,
              live: { ...live, status: "idle", orders, lastHash: result.hash, lastError: undefined },
              sim: appendLiveNote(
                current.sim,
                now,
                `${intent.kind === "open" ? "BUY" : "SELL"} ${intent.size} ${intent.outcome} did not fill · order ${result.status ?? "closed"} · position unchanged`
              ),
            };
          }

          if (intent.kind === "open") {
            return {
              ...current,
              sim: {
                ...proposed,
                position: proposed.position
                  ? { ...proposed.position, entryPrice: result.avgPrice, size: result.filled }
                  : null,
              },
              live: {
                ...live,
                status: "idle",
                orders,
                fills: live.fills + 1,
                entryPrice: result.avgPrice,
                lastHash: result.hash,
                lastError: undefined,
              },
            };
          }

          const entry = entryBefore ?? intent.price;
          const realized = realizedFromClose(entry, result.avgPrice, result.filled);
          const remaining = intent.size - result.filled;
          const held = current.sim.position;
          const partial = remaining > 1e-9 && held != null;

          return {
            ...current,
            sim: partial
              ? appendLiveNote(
                  { ...current.sim, position: { ...held, size: remaining } },
                  now,
                  `SELL ${result.filled} ${intent.outcome} filled @ ${(result.avgPrice * 100).toFixed(1)}% · ${remaining.toFixed(2)} still held`
                )
              : proposed,
            live: {
              ...live,
              status: "idle",
              orders,
              fills: live.fills + 1,
              realizedPnl: live.realizedPnl + realized,
              entryPrice: partial ? entry : null,
              lastHash: result.hash,
              lastError: undefined,
            },
          };
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "The order was rejected.";
        errorCooldown.set(slot, Date.now() + ERROR_COOLDOWN_MS);
        guard((current) => ({
          ...current,
          live: { ...liveOf(current), status: "error", lastError: message },
          sim: appendLiveNote(current.sim, now, `${intent.kind === "open" ? "BUY" : "SELL"} ${intent.size} ${intent.outcome} rejected · ${message}`),
        }));
      })
      .finally(() => {
        inFlight.delete(slot);
        persist(false);
      });
  }
}

function tick() {
  syncWatches();
  const now = Date.now();
  if (state.mode === "live") {
    liveTick(now);
    persist(false);
    return;
  }
  const data = slotDataFor(state.cats);
  const cats = tickFleet({ cats: state.cats, data, bankroll: state.bankroll, now });
  commit({ cats });
  persist(false);
}

function syncRun() {
  const shouldTick = state.running && state.cats.length > 0 && typeof window !== "undefined";
  if (shouldTick && !tickTimer) {
    tickTimer = setInterval(tick, TICK_MS);
  } else if (!shouldTick && tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  syncWatches();
}

export function subscribeFleet(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFleetState(): FleetRunnerState {
  return state;
}

export function getFleetServerState(): FleetRunnerState {
  return INITIAL_STATE;
}

export function hydrateFleet(): void {
  if (state.hydrated || typeof window === "undefined") return;
  let cats: FleetCat[] = [];
  let running = false;
  let mode: FleetMode = INITIAL_STATE.mode;
  let bankroll = INITIAL_STATE.bankroll;
  let storageError = false;
  let droppedPositions = 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { cats?: FleetCat[]; running?: boolean; mode?: FleetMode; bankroll?: number };
      if (Array.isArray(parsed.cats)) {
        const supported = parsed.cats.filter((cat) => KNOWN_ARCHETYPES.has(cat.archetype));
        droppedPositions = supported.filter((cat) => cat.sim?.position != null).length;
        cats = dedupeAccents(supported.map((cat) => ({ ...cat, sim: { ...cat.sim, position: null, quotes: undefined, log: [] } })));
      }
      running = parsed.running === true && cats.length > 0;
      if (parsed.mode === "live" || parsed.mode === "dry") mode = parsed.mode;
      if (typeof parsed.bankroll === "number" && Number.isFinite(parsed.bankroll) && parsed.bankroll >= 100) {
        bankroll = parsed.bankroll;
      }
    }
  } catch {
    storageError = true;
  }
  state = { ...state, cats, running, mode, bankroll, hydrated: true, storageError, droppedPositions };
  emit();
  syncRun();
}

export function setFleetMarkets(rows: LiveMarketRow[]): void {
  markets = rows;
  syncWatches();
}

export function setFleetRunning(running: boolean): void {
  if (running === state.running) return;
  commit({ running });
  persist(true);
  syncRun();
}

export function setFleetMode(mode: FleetMode): string | null {
  if (mode === state.mode) return null;
  if (mode === "live" && !burner) return "Create the cat wallet before switching to live run.";
  if (mode === "dry") {
    const open = liveOpenPositions();
    if (open.length > 0) {
      return `${open.map((cat) => cat.name).join(", ")} still hold real positions on chain. Let them close, or close those positions yourself, before returning to dry run.`;
    }
  }
  const data = slotDataFor(state.cats);
  const now = Date.now();
  const cats = state.cats.map((cat) => ({
    ...cat,
    sim: flattenForReconfigure(cat.sim, data.get(cat.slot)?.book ?? null, now),
    live: mode === "live" ? cat.live ?? initialLiveCatState : cat.live,
  }));
  commit({ mode, cats });
  persist(true);
  syncRun();
  return null;
}

export function setFleetBankroll(bankroll: number): void {
  if (bankroll === state.bankroll) return;
  commit({ bankroll });
  persist(true);
}

export function updateFleetCats(updater: (cats: FleetCat[]) => FleetCat[]): void {
  const cats = updater(state.cats);
  if (cats === state.cats) return;
  releaseSlots(cats);
  commit({ cats: dedupeAccents(cats), running: cats.length === 0 ? false : state.running });
  persist(true);
  syncRun();
}

export function updateFleetCatConfig(slot: number, params: StrategyParams, allocPct: number): void {
  const target = state.cats.find((cat) => cat.slot === slot);
  if (!target) return;
  const data = state.running ? slotDataFor(state.cats) : null;
  const now = Date.now();
  const cats = state.cats.map((cat) => {
    if (cat.slot !== slot) return cat;
    const next = { ...cat, params, allocPct };
    if (!state.running) return next;
    return { ...next, sim: flattenForReconfigure(cat.sim, data?.get(slot)?.book ?? null, now) };
  });
  commit({ cats });
  persist(true);
  syncRun();
}

export function removeFleetCat(slot: number): void {
  updateFleetCats((cats) => cats.filter((cat) => cat.slot !== slot));
}

export function acknowledgeDroppedPositions(): void {
  if (state.droppedPositions === 0) return;
  commit({ droppedPositions: 0 });
}
