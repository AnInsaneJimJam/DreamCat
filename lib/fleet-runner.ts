"use client";

import { watchBook, watchFills, type BookSnapshot, type Fill, type LiveMarketRow } from "./dreamdex";
import { dedupeAccents, tickFleet, type FleetCat, type FleetSlotData } from "./fleet";
import { acquireAsset, buildMarketContext } from "./market-context";
import { SDK_GAS_LIMIT } from "./burner";
import {
  TEMPLATES,
  applyConfirmedQuoteFill,
  flattenForReconfigure,
  stepSim,
  type Archetype,
  type MarketContext,
  type StrategyParams,
} from "./strategy";
import { gasHeadroom, type BurnerWallet, type GasHeadroom } from "./burner";
import {
  canTradeLive,
  deriveIntent,
  executeIntent,
  initialLiveCatState,
  isQuotingArchetype,
  realizedFromClose,
  type LiveCatState,
  type LiveIntent,
} from "./live-fleet";
import {
  cancelQuote,
  deriveQuoteActions,
  describeQuoteAction,
  emptyLiveQuotes,
  fetchOpenQuoteOrders,
  foldQuoteOrder,
  forgetQuoteSymbol,
  placeQuote,
  quoteSymbolFor,
  resolveFinalOrder,
  sweepRestingOrders,
  type LiveQuoteBook,
  type QuoteAction,
  type QuotePolicy,
  type RestingOrderRef,
} from "./live-quotes";

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
  quotePolicy: QuotePolicy;
  orphanQuotes: number;
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
  quotePolicy: "dual",
  orphanQuotes: 0,
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
      JSON.stringify({
        cats: state.cats,
        running: state.running,
        mode: state.mode,
        bankroll: state.bankroll,
        quotePolicy: state.quotePolicy,
      })
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
/**
 * Slots whose params changed while they held a real on-chain position. The position
 * cannot simply be dropped from sim state — the tokens are real — so the next live tick
 * turns the request into an actual close before the new params take over.
 */
const flattenRequests = new Set<number>();
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
  // Pull resting orders while the old key can still sign the cancels.
  if (!next && burner) releaseAllQuotes();
  burner = next;
  quoteSweeps.clear();
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
  for (const slot of [...quoteInFlight]) if (!alive.has(slot)) quoteInFlight.delete(slot);
  for (const slot of [...flattenRequests]) if (!alive.has(slot)) flattenRequests.delete(slot);
  for (const map of [quoteSubmitAt, quoteSyncAt, quoteLogAt]) {
    for (const slot of [...map.keys()]) if (!alive.has(slot)) map.delete(slot);
  }
}

const QUOTE_SYNC_MS = 3000;
const QUOTE_LOG_MS = 10000;
/**
 * Every requote is a cancel plus a place — two transactions. The strategy's requote
 * threshold was tuned against a free simulator, so the runner puts a floor under how
 * often a cat may re-price. Pure withdrawals bypass it: taking risk off is never delayed.
 */
export const QUOTE_MIN_INTERVAL_MS = 5000;

const quoteInFlight = new Set<number>();
const quoteSubmitAt = new Map<number, number>();
const quoteSyncAt = new Map<number, number>();
const quoteLogAt = new Map<number, number>();
const quoteSweeps = new Map<string, "pending" | "done">();

function guardSlot(slot: number, token: string, patch: (cat: FleetCat) => FleetCat): void {
  if (state.mode !== "live") return;
  const current = state.cats.find((item) => item.slot === slot);
  if (!current || catToken(current) !== token) return;
  patchCat(slot, patch);
}

function restingRefs(live: LiveCatState): RestingOrderRef[] {
  const quotes = live.quotes ?? emptyLiveQuotes;
  return [quotes.bid, quotes.ask].filter((ref): ref is RestingOrderRef => ref != null);
}

function withQuotes(live: LiveCatState, quotes: LiveQuoteBook): LiveCatState {
  return { ...live, quotes: quotes.bid || quotes.ask ? quotes : undefined };
}

/**
 * Fold the chain's view of this cat's resting orders back into its sim state. Fills are
 * never inferred from the public tape in live mode — a quote counts as filled only when
 * the indexer says this wallet's own order filled.
 */
function syncQuoteOrders(cat: FleetCat, now: number): void {
  const active = burner;
  if (!active) return;
  const refs = restingRefs(liveOf(cat));
  if (!refs.length) return;
  const last = quoteSyncAt.get(cat.slot) ?? 0;
  if (now - last < QUOTE_SYNC_MS) return;
  quoteSyncAt.set(cat.slot, now);

  const slot = cat.slot;
  const token = catToken(cat);
  const symbol = refs[0].symbol;

  void (async () => {
    const updates: Array<{ ref: RestingOrderRef; row: Awaited<ReturnType<typeof resolveFinalOrder>> }> = [];
    try {
      const open = await fetchOpenQuoteOrders(active.privateKey, symbol);
      const byId = new Map(open.map((row) => [row.id, row]));
      for (const ref of refs) {
        const row = byId.get(ref.id);
        if (row) {
          updates.push({ ref, row });
          continue;
        }
        updates.push({ ref, row: await resolveFinalOrder(active.privateKey, symbol, ref.id) });
      }
    } catch {
      return;
    }

    const at = Date.now();
    guardSlot(slot, token, (current) => {
      let sim = current.sim;
      const live = liveOf(current);
      const quotes: LiveQuoteBook = { ...(live.quotes ?? emptyLiveQuotes) };
      let fills = live.fills;
      let realized = live.realizedPnl;

      for (const { ref, row } of updates) {
        if (quotes[ref.side]?.id !== ref.id) continue;
        const update = foldQuoteOrder(ref, row);
        if (!update.resolved) continue;
        if (update.event) {
          const before = sim.realizedPnl;
          sim = applyConfirmedQuoteFill(sim, update.event.side, update.event.price, update.event.size, at);
          realized += sim.realizedPnl - before;
          fills += 1;
        }
        quotes[ref.side] = update.ref;
      }

      return {
        ...current,
        sim,
        live: withQuotes(
          { ...live, fills, realizedPnl: realized, entryPrice: sim.position?.entryPrice ?? null },
          quotes
        ),
      };
    });
  })();
}

function runQuoteActions(cat: FleetCat, market: LiveMarketRow, actions: QuoteAction[], now: number): void {
  const active = burner;
  if (!active || !actions.length) return;
  const slot = cat.slot;
  const token = catToken(cat);
  quoteInFlight.add(slot);

  void (async () => {
    for (const action of actions) {
      try {
        if (action.kind === "cancel") {
          await cancelQuote(active.privateKey, action.order);
          guardSlot(slot, token, (current) => {
            const live = liveOf(current);
            const quotes = { ...(live.quotes ?? emptyLiveQuotes) };
            if (quotes[action.side]?.id === action.order.id) quotes[action.side] = null;
            return {
              ...current,
              live: withQuotes(
                { ...live, status: "idle", cancels: (live.cancels ?? 0) + 1, lastError: undefined },
                quotes
              ),
            };
          });
          continue;
        }

        const placed = await placeQuote(active.privateKey, market, action.side, action.price, action.size);
        guardSlot(slot, token, (current) => {
          let sim = current.sim;
          const live = liveOf(current);
          const quotes = { ...(live.quotes ?? emptyLiveQuotes) };
          let fills = live.fills;
          let realized = live.realizedPnl;

          if (placed.filled > 0) {
            const before = sim.realizedPnl;
            sim = applyConfirmedQuoteFill(sim, action.side, placed.avgPrice, placed.filled, now);
            realized += sim.realizedPnl - before;
            fills += 1;
          }
          quotes[action.side] = placed.ref;

          return {
            ...current,
            sim: placed.ref || placed.filled > 0
              ? sim
              : appendLiveNote(sim, now, `QUOTE ${action.side} ${action.size} @ ${(action.price * 100).toFixed(1)}% did not rest · ${placed.status}`),
            live: withQuotes(
              {
                ...live,
                status: "idle",
                orders: live.orders + 1,
                fills,
                realizedPnl: realized,
                entryPrice: sim.position?.entryPrice ?? null,
                lastHash: placed.hash ?? live.lastHash,
                lastError: undefined,
              },
              quotes
            ),
          };
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "The quote was rejected.";
        errorCooldown.set(slot, Date.now() + ERROR_COOLDOWN_MS);
        forgetQuoteSymbol(market.id);
        guardSlot(slot, token, (current) => ({
          ...current,
          live: { ...liveOf(current), status: "error", lastError: message },
          sim: appendLiveNote(current.sim, now, `${describeQuoteAction(action)} rejected · ${message}`),
        }));
        break;
      }
    }
    quoteInFlight.delete(slot);
    quoteSyncAt.delete(slot);
    persist(false);
  })();
}

/** Best-effort teardown: pull every order this cat has resting and forget the refs. */
function cancelCatQuotes(cat: FleetCat): void {
  const active = burner;
  const refs = restingRefs(liveOf(cat));
  if (!refs.length) return;
  const slot = cat.slot;
  const token = catToken(cat);
  if (active) {
    void (async () => {
      for (const ref of refs) {
        try {
          await cancelQuote(active.privateKey, ref);
        } catch {
          continue;
        }
      }
    })();
  }
  guardSlot(slot, token, (current) => ({
    ...current,
    live: withQuotes({ ...liveOf(current), status: "idle" }, emptyLiveQuotes),
  }));
}

function releaseAllQuotes(cats: FleetCat[] = state.cats): void {
  for (const cat of cats) {
    if (!isQuotingArchetype(cat.archetype)) continue;
    cancelCatQuotes(cat);
  }
}

/**
 * Resting orders survive a page reload; the refs pointing at them do not. Sweep the burner's
 * open orders on every watched window once per session so a refresh cannot strand a quote.
 */
function sweepOrphanQuotes(): void {
  const active = burner;
  if (!active || state.mode !== "live") return;
  const quoting = state.cats.filter((cat) => isQuotingArchetype(cat.archetype));
  if (!quoting.length) return;

  for (const cat of quoting) {
    const market = tradableMarket(cat.marketId);
    if (!market) continue;
    if (quoteSweeps.has(market.id)) continue;
    quoteSweeps.set(market.id, "pending");
    void (async () => {
      try {
        const symbol = await quoteSymbolFor(market);
        const cancelled = await sweepRestingOrders(active.privateKey, symbol);
        quoteSweeps.set(market.id, "done");
        if (cancelled > 0) commit({ orphanQuotes: state.orphanQuotes + cancelled });
      } catch {
        quoteSweeps.delete(market.id);
      }
    })();
  }
}

function liveTick(now: number): void {
  const active = burner;
  if (!active) return;
  refreshGasHeadroom(active.address, now);
  const shortOfGas = gasStatus != null && !gasStatus.ok ? gasShortfallMessage(gasStatus) : null;
  const data = slotDataFor(state.cats);
  const pending: Array<{ cat: FleetCat; market: LiveMarketRow; intent: LiveIntent; proposed: FleetCat["sim"] }> = [];
  const quotePending: Array<{ cat: FleetCat; market: LiveMarketRow; actions: QuoteAction[] }> = [];
  const quoteTeardown: FleetCat[] = [];

  sweepOrphanQuotes();

  const cats = state.cats.map((cat) => {
    const slotData = data.get(cat.slot);
    const book = slotData?.book ?? null;
    const quoting = isQuotingArchetype(cat.archetype);
    const withEquity = (next: FleetCat): FleetCat => ({
      ...next,
      equityHist: [...next.equityHist, liveEquity(next, book)].slice(-80),
    });

    if (!canTradeLive(cat.archetype)) return withEquity(cat);
    if (inFlight.has(cat.slot)) return withEquity(cat);
    if (quoting && quoteInFlight.has(cat.slot)) {
      syncQuoteOrders(cat, now);
      return withEquity(cat);
    }
    const cooldown = errorCooldown.get(cat.slot);
    if (cooldown != null && now < cooldown) return withEquity(cat);
    if (quoting) syncQuoteOrders(cat, now);
    if (!slotData || !slotData.book.bids.length) return withEquity(cat);
    const market = tradableMarket(cat.marketId);
    if (!market) {
      if (quoting && restingRefs(liveOf(cat)).length) quoteTeardown.push(cat);
      if (cat.sim.position == null) return withEquity(cat);
      const stranded = "This window expired while the position was open. The tokens are still in the cat wallet and settle by claiming, not by selling.";
      if (liveOf(cat).lastError === stranded) return withEquity(cat);
      return withEquity({ ...cat, live: { ...liveOf(cat), status: "error", lastError: stranded } });
    }

    const flattening = flattenRequests.has(cat.slot);
    const proposed = flattening
      ? flattenForReconfigure(cat.sim, slotData.book, now)
      : stepSim(
          { archetype: cat.archetype, params: cat.params, inferQuoteFills: quoting ? false : undefined },
          cat.sim,
          slotData.book,
          slotData.fills,
          now,
          slotData.ctx
        );
    const intent = deriveIntent(cat.sim, proposed, slotData.book);

    if (intent) {
      if (shortOfGas) {
        const live = liveOf(cat);
        if (live.lastError === shortOfGas) return withEquity(cat);
        return withEquity({ ...cat, live: { ...live, status: "error", lastError: shortOfGas } });
      }
      // A quoting cat only ever produces a taker intent to force-flatten (stop-loss,
      // time-stop, flatten-into-expiry). Pull its resting orders before crossing.
      if (quoting && restingRefs(liveOf(cat)).length) quoteTeardown.push(cat);
      flattenRequests.delete(cat.slot);
      pending.push({ cat, market, intent, proposed });
      return withEquity({ ...cat, live: { ...liveOf(cat), status: "submitting", lastError: undefined } });
    }

    // Nothing was open, so the reconfigure needed no close.
    if (flattening) flattenRequests.delete(cat.slot);

    if (!quoting) return withEquity(proposed === cat.sim ? cat : { ...cat, sim: proposed });

    const live = liveOf(cat);
    const actions = deriveQuoteActions(proposed.quotes, live.quotes ?? emptyLiveQuotes, {
      singleSided: state.quotePolicy === "single",
    });
    const stepped = proposed === cat.sim ? cat : { ...cat, sim: proposed };
    if (!actions.length) return withEquity(stepped);

    if (state.quotePolicy === "shadow") {
      const lastLog = quoteLogAt.get(cat.slot) ?? 0;
      const shadow = { ...liveOf(stepped), shadowActions: (live.shadowActions ?? 0) + actions.length };
      if (now - lastLog < QUOTE_LOG_MS) return withEquity({ ...stepped, live: shadow });
      quoteLogAt.set(cat.slot, now);
      return withEquity({
        ...stepped,
        sim: appendLiveNote(stepped.sim, now, `SHADOW · ${actions.map(describeQuoteAction).join(" · ")}`),
        live: shadow,
      });
    }

    if (shortOfGas) {
      if (live.lastError === shortOfGas) return withEquity(stepped);
      return withEquity({ ...stepped, live: { ...live, status: "error", lastError: shortOfGas } });
    }

    // Hold placement until the orphan sweep on this window has finished, or the sweep
    // would cancel the quote this tick is about to rest.
    if (quoteSweeps.get(market.id) !== "done") return withEquity(stepped);

    // Only re-pricing is churn. Resting a fresh quote, and pulling one, go straight out.
    const requoting = actions.some((action) => action.kind === "cancel" && action.reason === "requote");
    if (requoting && now - (quoteSubmitAt.get(cat.slot) ?? 0) < QUOTE_MIN_INTERVAL_MS) {
      return withEquity(stepped);
    }
    quoteSubmitAt.set(cat.slot, now);

    quotePending.push({ cat, market, actions });
    return withEquity({ ...stepped, live: { ...live, status: "submitting", lastError: undefined } });
  });

  commit({ cats });

  for (const cat of quoteTeardown) cancelCatQuotes(cat);
  for (const { cat, market, actions } of quotePending) runQuoteActions(cat, market, actions, now);

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
  let quotePolicy = INITIAL_STATE.quotePolicy;
  let storageError = false;
  let droppedPositions = 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        cats?: FleetCat[];
        running?: boolean;
        mode?: FleetMode;
        bankroll?: number;
        quotePolicy?: QuotePolicy;
      };
      if (Array.isArray(parsed.cats)) {
        const supported = parsed.cats.filter((cat) => KNOWN_ARCHETYPES.has(cat.archetype));
        droppedPositions = supported.filter((cat) => cat.sim?.position != null).length;
        // Order refs cannot outlive the session that placed them; the orphan sweep pulls
        // whatever they pointed at once the burner is back.
        cats = dedupeAccents(
          supported.map((cat) => ({
            ...cat,
            sim: { ...cat.sim, position: null, quotes: undefined, log: [] },
            live: cat.live ? { ...cat.live, status: "idle" as const, quotes: undefined, lastError: undefined } : undefined,
          }))
        );
      }
      running = parsed.running === true && cats.length > 0;
      if (parsed.mode === "live" || parsed.mode === "dry") mode = parsed.mode;
      if (typeof parsed.bankroll === "number" && Number.isFinite(parsed.bankroll) && parsed.bankroll >= 100) {
        bankroll = parsed.bankroll;
      }
      if (parsed.quotePolicy === "shadow" || parsed.quotePolicy === "single" || parsed.quotePolicy === "dual") {
        quotePolicy = parsed.quotePolicy;
      }
    }
  } catch {
    storageError = true;
  }
  state = { ...state, cats, running, mode, bankroll, quotePolicy, hydrated: true, storageError, droppedPositions };
  emit();
  syncRun();
}

export function setFleetMarkets(rows: LiveMarketRow[]): void {
  markets = rows;
  syncWatches();
}

export function setFleetRunning(running: boolean): void {
  if (running === state.running) return;
  if (!running) releaseAllQuotes();
  commit({ running });
  persist(true);
  syncRun();
}

export function setQuotePolicy(policy: QuotePolicy): void {
  if (policy === state.quotePolicy) return;
  // "single" narrows the desired book, which the reconciler cancels down to on its own.
  if (policy === "shadow") releaseAllQuotes();
  commit({ quotePolicy: policy });
  persist(true);
}

export function acknowledgeOrphanQuotes(): void {
  if (state.orphanQuotes === 0) return;
  commit({ orphanQuotes: 0 });
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
  releaseAllQuotes();
  quoteSweeps.clear();
  flattenRequests.clear();
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
  const alive = new Set(cats.map((cat) => cat.slot));
  releaseAllQuotes(state.cats.filter((cat) => !alive.has(cat.slot)));
  releaseSlots(cats);
  commit({ cats: dedupeAccents(cats), running: cats.length === 0 ? false : state.running });
  persist(true);
  syncRun();
}

export function updateFleetCatConfig(slot: number, params: StrategyParams, allocPct: number): void {
  const target = state.cats.find((cat) => cat.slot === slot);
  if (!target) return;
  if (isQuotingArchetype(target.archetype)) cancelCatQuotes(target);
  const data = state.running ? slotDataFor(state.cats) : null;
  const now = Date.now();
  // A live position is real tokens in the cat wallet. Dropping it from sim state would
  // leave nothing to sell it, so ask the runner to close it on chain instead and let the
  // new params take over once the close lands.
  const deferFlatten = state.mode === "live" && state.running && target.sim.position != null;
  if (deferFlatten) flattenRequests.add(slot);

  const cats = state.cats.map((cat) => {
    if (cat.slot !== slot) return cat;
    const next = { ...cat, params, allocPct };
    if (!state.running || deferFlatten) return next;
    return { ...next, sim: flattenForReconfigure(cat.sim, data?.get(slot)?.book ?? null, now) };
  });
  commit({ cats });
  persist(true);
  syncRun();
}

export function removeFleetCat(slot: number): string | null {
  const target = state.cats.find((cat) => cat.slot === slot);
  if (!target) return null;
  // Dropping the cat drops the only thing that knows how to sell its tokens.
  if (state.mode === "live" && target.sim.position != null) {
    return `${target.name} still holds a real position on chain. Let it close, or close that position yourself, before dropping the cat.`;
  }
  updateFleetCats((cats) => cats.filter((cat) => cat.slot !== slot));
  return null;
}

export function acknowledgeDroppedPositions(): void {
  if (state.droppedPositions === 0) return;
  commit({ droppedPositions: 0 });
}
