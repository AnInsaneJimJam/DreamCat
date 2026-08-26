"use client";

import { watchBook, watchFills, type BookSnapshot, type Fill, type LiveMarketRow } from "./dreamdex";
import { tickFleet, type FleetCat, type FleetSlotData } from "./fleet";
import { acquireAsset, buildMarketContext } from "./market-context";
import { TEMPLATES, type Archetype, type MarketContext } from "./strategy";

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

export interface FleetRunnerState {
  cats: FleetCat[];
  running: boolean;
  bankroll: number;
  live: Record<number, FleetLive>;
  hydrated: boolean;
  storageError: boolean;
  droppedPositions: number;
}

const INITIAL_STATE: FleetRunnerState = {
  cats: [],
  running: false,
  bankroll: 1000,
  live: {},
  hydrated: false,
  storageError: false,
  droppedPositions: 0,
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
      JSON.stringify({ cats: state.cats, running: state.running, bankroll: state.bankroll })
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

function tick() {
  syncWatches();
  const data = slotDataFor(state.cats);
  const cats = tickFleet({ cats: state.cats, data, bankroll: state.bankroll, now: Date.now() });
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
  let bankroll = INITIAL_STATE.bankroll;
  let storageError = false;
  let droppedPositions = 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { cats?: FleetCat[]; running?: boolean; bankroll?: number };
      if (Array.isArray(parsed.cats)) {
        const supported = parsed.cats.filter((cat) => KNOWN_ARCHETYPES.has(cat.archetype));
        droppedPositions = supported.filter((cat) => cat.sim?.position != null).length;
        cats = supported.map((cat) => ({ ...cat, sim: { ...cat.sim, position: null, quotes: undefined, log: [] } }));
      }
      running = parsed.running === true && cats.length > 0;
      if (typeof parsed.bankroll === "number" && Number.isFinite(parsed.bankroll) && parsed.bankroll >= 100) {
        bankroll = parsed.bankroll;
      }
    }
  } catch {
    storageError = true;
  }
  state = { ...state, cats, running, bankroll, hydrated: true, storageError, droppedPositions };
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

export function setFleetBankroll(bankroll: number): void {
  if (bankroll === state.bankroll) return;
  commit({ bankroll });
  persist(true);
}

export function updateFleetCats(updater: (cats: FleetCat[]) => FleetCat[]): void {
  const cats = updater(state.cats);
  if (cats === state.cats) return;
  commit({ cats, running: cats.length === 0 ? false : state.running });
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
