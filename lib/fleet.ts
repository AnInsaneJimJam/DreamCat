import type { BookSnapshot, Fill } from "./dreamdex";
import type { LiveCatState } from "./live-fleet";
import {
  equityCurve,
  initialSimState,
  stepSim,
  type Archetype,
  type MarketContext,
  type SimState,
  type StrategyParams,
} from "./strategy";

export interface FleetCatInput {
  slot: number;
  name: string;
  accent: string;
  archetype: Archetype;
  params: StrategyParams;
  marketId: string;
  allocPct: number;
}

export interface FleetCat extends FleetCatInput {
  sim: SimState;
  equityHist: number[];
  live?: LiveCatState;
}

export interface FleetSlotData {
  book: BookSnapshot;
  fills: Fill[];
  ctx?: MarketContext;
}

export const MAX_CATS = 5;

export const ACCENTS = ["#f59e0b", "#22d3ee", "#f472b6", "#34d399", "#a78bfa"];

export function nextAccent(cats: FleetCat[]): string {
  const taken = new Set(cats.map((cat) => cat.accent));
  return ACCENTS.find((accent) => !taken.has(accent)) ?? ACCENTS[cats.length % ACCENTS.length];
}

export function dedupeAccents(cats: FleetCat[]): FleetCat[] {
  const seen = new Set<string>();
  return cats.map((cat) => {
    const known = ACCENTS.includes(cat.accent);
    if (known && !seen.has(cat.accent)) {
      seen.add(cat.accent);
      return cat;
    }
    const free = ACCENTS.find((accent) => !seen.has(accent));
    if (!free) return cat;
    seen.add(free);
    return { ...cat, accent: free };
  });
}

export function totalAlloc(cats: FleetCat[]): number {
  return cats.reduce((s, c) => s + c.allocPct, 0);
}

function scaleFor(cat: FleetCat, bankroll: number): number {
  return (cat.allocPct / 100) * (bankroll / 1000);
}

export function catEquity(cat: FleetCat, book: BookSnapshot | null, bankroll: number): number {
  if (!book) return 0;
  return equityCurve(cat.sim, book) * scaleFor(cat, bankroll);
}

export interface FleetTickInput {
  cats: FleetCat[];
  data: Map<number, FleetSlotData>;
  bankroll: number;
  now: number;
}

export function tickFleet({ cats, data, bankroll, now }: FleetTickInput): FleetCat[] {
  return cats.map((cat) => {
    const d = data.get(cat.slot);
    if (!d || !d.book.bids.length) return cat;
    const cfg = { archetype: cat.archetype, params: cat.params };
    const sim = stepSim(cfg, cat.sim, d.book, d.fills, now, d.ctx);
    const eq = equityCurve(sim, d.book) * scaleFor(cat, bankroll);
    const equityHist = [...cat.equityHist, eq].slice(-80);
    return { ...cat, sim, equityHist };
  });
}

export function freshCat(input: FleetCatInput): FleetCat {
  return { ...input, sim: initialSimState, equityHist: [] };
}

export function fleetSummary(cats: FleetCat[], data: Map<number, { book: BookSnapshot }>, bankroll: number) {
  let equity = 0;
  let trades = 0;
  let wins = 0;
  let openPositions = 0;
  for (const c of cats) {
    equity += catEquity(c, data.get(c.slot)?.book ?? null, bankroll);
    trades += c.sim.trades;
    wins += c.sim.wins;
    if (c.sim.position) openPositions += 1;
  }
  return { equity, trades, wins, openPositions, losses: trades - wins };
}
