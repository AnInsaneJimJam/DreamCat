import type { Hex } from "viem";
import {
  saveFleetState,
  loadFleetState,
  addActiveFleet,
  removeActiveFleet,
  listActiveFleets,
} from "./redis.js";
import { subscribeMarket, unsubscribeMarket, getMarketData } from "./market-data.js";
import { acquireServerAsset, buildServerMarketContext } from "./spot-data.js";
import { listServerMarkets } from "./sdk.js";
import { ensureSharedLoaded, stepSim, equityCurve, tickFleet } from "./shared-loader.js";
import { deriveIntent, initialLiveCatState, type LiveCatState, type LiveIntent } from "./live-intent.js";
import { emitToUser, listenerCount } from "./sse.js";
import type {
  FleetCat,
  FleetCatInput,
  FleetSlotData,
  LiveMarketRow,
  PersistedFleetState,
  QuotePolicy,
  StrategyParams,
} from "./types.js";

const TICK_MS = 1000;
const PERSIST_THROTTLE_MS = 5000;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const _mutexes = new Map<string, Promise<void>>();

async function withMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = _mutexes.get(key) ?? Promise.resolve();
  let resolve: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  _mutexes.set(key, next);
  await prev;
  try {
    return await fn();
  } finally {
    resolve!();
  }
}

export class UserFleet {
  address: string;
  cats: FleetCat[];
  running: boolean;
  mode: "dry" | "live";
  bankroll: number;
  quotePolicy: QuotePolicy;
  burnerKey: Hex | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastPersistAt = 0;
  private listeners = new Set<() => void>();
  private marketIndex = new Map<string, LiveMarketRow>();
  private assetReleasers = new Map<string, () => void>();
  private lastActivityAt = Date.now();

  constructor(address: string, state: PersistedFleetState) {
    this.address = address.toLowerCase();
    this.cats = state.cats.map((c) => ({
      ...c,
      sim: { ...c.sim, position: null },
    }));
    this.running = state.running;
    this.mode = state.mode;
    this.bankroll = state.bankroll;
    this.quotePolicy = state.quotePolicy;
  }

  start(): void {
    if (this.tickTimer) return;
    this.running = true;
    this.lastActivityAt = Date.now();
    this.syncSubscriptions();
    this.tickTimer = setInterval(() => void this.safeTick(), TICK_MS);
    void addActiveFleet(this.address);
    this.emitConfig();
    this.notifyListeners();
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.running = false;
    for (const cat of this.cats) {
      unsubscribeMarket(cat.marketId, this.address);
    }
    for (const release of this.assetReleasers.values()) release();
    this.assetReleasers.clear();
    void removeActiveFleet(this.address);
    void this.persist(true);
    this.emitConfig();
    this.notifyListeners();
  }

  private async safeTick(): Promise<void> {
    try {
      await withMutex(this.address, () => this.tick());
    } catch (err) {
      console.error(`[fleet:${this.address.slice(0, 10)}] tick error:`, err);
    }
  }

  private async tick(): Promise<void> {
    this.syncSubscriptions();
    if (this.mode === "dry") {
      this.dryTick();
    } else {
      await this.liveTick();
    }
    void this.persist();
    this.notifyListeners();
  }

  private dryTick(): void {
    const now = Date.now();
    const data = new Map<number, FleetSlotData>();
    for (const cat of this.cats) {
      const md = getMarketData(cat.marketId);
      if (!md) continue;
      const row = this.marketIndex.get(cat.marketId);
      const ctx = row ? buildServerMarketContext(row) : undefined;
      data.set(cat.slot, { book: md.book, fills: md.fills, ctx });
    }
    this.cats = tickFleet({ cats: this.cats, data, bankroll: this.bankroll, now });
  }

  private async liveTick(): Promise<void> {
    const now = Date.now();
    for (let i = 0; i < this.cats.length; i++) {
      const cat = this.cats[i];
      const md = getMarketData(cat.marketId);
      if (!md || !md.book.bids.length) continue;
      const row = this.marketIndex.get(cat.marketId);
      const ctx = row ? buildServerMarketContext(row) : undefined;
      const cfg = { archetype: cat.archetype, params: cat.params };
      const before = cat.sim;
      const after = stepSim(cfg, before, md.book, md.fills, now, ctx);
      const eq = equityCurve(after, md.book) * (cat.allocPct / 100) * (this.bankroll / 1000);
      const equityHist = [...cat.equityHist, eq].slice(-80);
      const intent = deriveIntent(before, after, md.book);
      if (intent && this.burnerKey) {
        await this.executeServerIntent(intent, cat);
      }
      this.cats[i] = { ...cat, sim: after, equityHist };
    }
  }

  private async executeServerIntent(intent: LiveIntent, cat: FleetCat): Promise<void> {
    const live: LiveCatState = cat.live ?? { ...initialLiveCatState };
    live.status = "submitting";
    live.orders += 1;
    try {
      live.status = "idle";
      live.fills += 1;
      live.shadowActions = (live.shadowActions ?? 0) + 1;
    } catch (err) {
      live.status = "error";
      live.lastError = String(err);
    }
    cat.live = live;
  }

  addCat(input: FleetCatInput): FleetCat {
    const sim = { position: null, realizedPnl: 0, trades: 0, wins: 0, log: [] };
    const cat: FleetCat = { ...input, sim, equityHist: [] };
    this.cats.push(cat);
    if (this.running) this.syncSubscriptions();
    void this.persist(true);
    this.notifyListeners();
    return cat;
  }

  removeCat(slot: number): string | null {
    const target = this.cats.find((c) => c.slot === slot);
    if (!target) return "Cat not found";
    if (this.mode === "live" && target.sim.position != null) {
      return `${target.name} still holds a real position on chain. Let it close before dropping the cat.`;
    }
    if (this.running) unsubscribeMarket(target.marketId, this.address);
    this.cats = this.cats.filter((c) => c.slot !== slot);
    if (this.cats.length === 0 && this.running) this.stop();
    void this.persist(true);
    this.notifyListeners();
    return null;
  }

  updateCatConfig(slot: number, params: StrategyParams, allocPct: number): string | null {
    const idx = this.cats.findIndex((c) => c.slot === slot);
    if (idx === -1) return "Cat not found";
    this.cats[idx] = { ...this.cats[idx], params, allocPct };
    void this.persist(true);
    this.notifyListeners();
    return null;
  }

  setMode(mode: "dry" | "live"): string | null {
    if (mode === this.mode) return null;
    if (mode === "live" && !this.burnerKey) return "Create the cat wallet before switching to live mode.";
    if (mode === "dry") {
      const open = this.cats.filter((c) => c.sim.position != null);
      if (open.length > 0) {
        return `${open.map((c) => c.name).join(", ")} still hold real positions. Let them close before switching to dry mode.`;
      }
    }
    this.mode = mode;
    this.emitConfig();
    if (mode === "live") {
      this.cats = this.cats.map((c) => ({
        ...c,
        live: c.live ?? { ...initialLiveCatState },
      }));
    }
    void this.persist(true);
    this.notifyListeners();
    return null;
  }

  setBankroll(bankroll: number): void {
    this.bankroll = bankroll;
    void this.persist(true);
    this.emitConfig();
    this.notifyListeners();
  }

  setQuotePolicy(policy: QuotePolicy): void {
    this.quotePolicy = policy;
    void this.persist(true);
    this.emitConfig();
    this.notifyListeners();
  }

  setBurnerKey(key: Hex | null): void {
    this.burnerKey = key;
    if (!key && this.mode === "live") {
      this.mode = "dry";
    }
    this.emitConfig();
    this.notifyListeners();
  }

  totalAllocPct(): number {
    return this.cats.reduce((sum, c) => sum + c.allocPct, 0);
  }

  syncSubscriptions(): void {
    const activeMarkets = new Set<string>();
    const activeAssets = new Set<string>();
    for (const cat of this.cats) {
      activeMarkets.add(cat.marketId);
      const row = this.marketIndex.get(cat.marketId);
      if (row) activeAssets.add(row.asset.toUpperCase());
    }
    for (const cat of this.cats) {
      const row = this.marketIndex.get(cat.marketId);
      if (row) {
        subscribeMarket(cat.marketId, row.yesSymbol, this.address);
      }
    }
    for (const asset of activeAssets) {
      if (!this.assetReleasers.has(asset)) {
        this.assetReleasers.set(asset, acquireServerAsset(asset));
      }
    }
    for (const [asset, release] of this.assetReleasers) {
      if (!activeAssets.has(asset)) {
        release();
        this.assetReleasers.delete(asset);
      }
    }
  }

  async refreshMarketIndex(): Promise<void> {
    try {
      const markets = await listServerMarkets();
      this.marketIndex.clear();
      for (const m of markets) this.marketIndex.set(m.id, m);
    } catch {}
  }

  async persist(immediate?: boolean): Promise<void> {
    const now = Date.now();
    if (!immediate && now - this.lastPersistAt < PERSIST_THROTTLE_MS) return;
    this.lastPersistAt = now;
    await saveFleetState(this.address, {
      cats: this.cats,
      running: this.running,
      mode: this.mode,
      bankroll: this.bankroll,
      quotePolicy: this.quotePolicy,
    });
  }

  getState(): PersistedFleetState {
    return {
      cats: this.cats,
      running: this.running,
      mode: this.mode,
      bankroll: this.bankroll,
      quotePolicy: this.quotePolicy,
    };
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private notifyListeners(): void {
    for (const cb of this.listeners) {
      try { cb(); } catch {}
    }
  }

  private emitConfig(): void {
    void emitToUser(this.address, "config", {
      running: this.running,
      mode: this.mode,
      bankroll: this.bankroll,
      quotePolicy: this.quotePolicy,
      burnerReady: this.burnerKey !== null,
    });
  }

  touch(): void {
    this.lastActivityAt = Date.now();
  }

  isIdle(): boolean {
    return this.listeners.size === 0 && listenerCount(this.address) === 0 && Date.now() - this.lastActivityAt > IDLE_TIMEOUT_MS;
  }
}

export class FleetManager {
  fleets = new Map<string, UserFleet>();
  private idleTimer: ReturnType<typeof setInterval> | null = null;

  async getOrCreate(address: string): Promise<UserFleet> {
    const key = address.toLowerCase();
    let fleet = this.fleets.get(key);
    if (fleet) {
      fleet.touch();
      return fleet;
    }
    const state = await loadFleetState(key);
    const initial: PersistedFleetState = state ?? {
      cats: [],
      running: false,
      mode: "dry",
      bankroll: 10000,
      quotePolicy: "shadow",
    };
    fleet = new UserFleet(key, initial);
    await fleet.refreshMarketIndex();
    this.fleets.set(key, fleet);
    if (initial.running) fleet.start();
    return fleet;
  }

  remove(address: string): void {
    const key = address.toLowerCase();
    const fleet = this.fleets.get(key);
    if (!fleet) return;
    fleet.stop();
    this.fleets.delete(key);
  }

  activeCount(): number {
    return this.fleets.size;
  }

  async recoverFleets(): Promise<void> {
    await ensureSharedLoaded();
    try {
      const addresses = await listActiveFleets();
      for (const addr of addresses) {
        try {
          await this.getOrCreate(addr);
        } catch {}
      }
      console.log(`Recovered ${addresses.length} fleet(s)`);
    } catch (err) {
      console.log(`Fleet recovery skipped: ${err}`);
    }
  }

  startIdleCheck(): void {
    if (this.idleTimer) return;
    this.idleTimer = setInterval(() => {
      for (const [key, fleet] of this.fleets) {
        if (fleet.mode === "dry" && fleet.isIdle()) {
          console.log(`Stopping idle fleet: ${key}`);
          fleet.stop();
          this.fleets.delete(key);
        }
      }
    }, 60_000);
  }
}

export const fleetManager = new FleetManager();
