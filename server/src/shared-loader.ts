import type {
  Archetype,
  BookSnapshot,
  Fill,
  FleetCat,
  FleetSlotData,
  MarketContext,
  SimState,
  StrategyParams,
} from "./types.js";

interface StrategyConfig {
  archetype: Archetype;
  params: StrategyParams;
  inferQuoteFills?: boolean;
}

interface FleetTickInput {
  cats: FleetCat[];
  data: Map<number, FleetSlotData>;
  bankroll: number;
  now: number;
}

type StepSimFn = (
  cfg: StrategyConfig,
  state: SimState,
  book: BookSnapshot,
  fills: Fill[],
  now: number,
  ctx?: MarketContext
) => SimState;

type EquityCurveFn = (state: SimState, book: BookSnapshot) => number;
type TickFleetFn = (input: FleetTickInput) => FleetCat[];

const initialSimState: SimState = { position: null, realizedPnl: 0, trades: 0, wins: 0, log: [] };

let _stepSim: StepSimFn | null = null;
let _equityCurve: EquityCurveFn | null = null;
let _tickFleet: TickFleetFn | null = null;
let _loaded = false;

async function load(): Promise<void> {
  if (_loaded) return;
  const strategy = await import("../../lib/strategy.ts") as {
    stepSim: StepSimFn;
    equityCurve: EquityCurveFn;
  };
  const fleet = await import("../../lib/fleet.ts") as {
    tickFleet: TickFleetFn;
  };
  _stepSim = strategy.stepSim;
  _equityCurve = strategy.equityCurve;
  _tickFleet = fleet.tickFleet;
  _loaded = true;
}

export async function ensureSharedLoaded(): Promise<void> {
  await load();
}

export function stepSim(
  cfg: StrategyConfig,
  state: SimState,
  book: BookSnapshot,
  fills: Fill[],
  now: number,
  ctx?: MarketContext
): SimState {
  if (!_stepSim) throw new Error("shared-loader not initialized");
  return _stepSim(cfg, state, book, fills, now, ctx);
}

export function equityCurve(state: SimState, book: BookSnapshot): number {
  if (!_equityCurve) throw new Error("shared-loader not initialized");
  return _equityCurve(state, book);
}

export function tickFleet(input: FleetTickInput): FleetCat[] {
  if (!_tickFleet) throw new Error("shared-loader not initialized");
  return _tickFleet(input);
}

export { initialSimState };
export type { StrategyConfig, FleetTickInput };
