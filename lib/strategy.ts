import type { BookSnapshot, Fill } from "./dreamdex";

export type Archetype = "maker" | "momentum" | "fade";

export interface StrategyParams {
  orderSize: number;
  entryEdge: number;
  takeProfit: number;
  stopLoss: number;
  lookback: number;
  maxHoldSec: number;
}

export interface StrategyConfig {
  archetype: Archetype;
  params: StrategyParams;
}

export interface PersonaTemplate {
  archetype: Archetype;
  cat: string;
  blurb: string;
  defaults: StrategyParams;
}

export const TEMPLATES: PersonaTemplate[] = [
  {
    archetype: "maker",
    cat: "Whiskers",
    blurb: "Trades the imbalance. Buys YES when bids dominate depth, exits on reversion.",
    defaults: { orderSize: 5, entryEdge: 0.55, takeProfit: 0.04, stopLoss: 0.03, lookback: 8, maxHoldSec: 300 },
  },
  {
    archetype: "momentum",
    cat: "Pounce",
    blurb: "Chases prints. Buys when the tape skews aggressively toward buys.",
    defaults: { orderSize: 5, entryEdge: 0.65, takeProfit: 0.05, stopLoss: 0.025, lookback: 6, maxHoldSec: 240 },
  },
  {
    archetype: "fade",
    cat: "Luna",
    blurb: "Fades euphoria. Sells into buy-skewed tapes by taking the NO side.",
    defaults: { orderSize: 5, entryEdge: 0.7, takeProfit: 0.04, stopLoss: 0.03, lookback: 8, maxHoldSec: 300 },
  },
];

export interface SimPosition {
  side: "YES" | "NO";
  entryPrice: number;
  size: number;
  openedAt: number;
}

export interface LogEntry {
  ts: number;
  action: "open" | "close" | "hold";
  detail: string;
}

export interface SimState {
  position: SimPosition | null;
  realizedPnl: number;
  trades: number;
  wins: number;
  log: LogEntry[];
}

export const initialSimState: SimState = { position: null, realizedPnl: 0, trades: 0, wins: 0, log: [] };

function tapeSkew(fills: Fill[], lookback: number): number {
  const recent = fills.slice(0, lookback);
  if (!recent.length) return 0;
  let score = 0;
  for (const f of recent) score += f.side === "buy" ? 1 : -1;
  return score / recent.length;
}

export function stepSim(
  cfg: StrategyConfig,
  state: SimState,
  book: BookSnapshot,
  fills: Fill[],
  now: number
): SimState {
  const bestAsk = book.asks[0]?.price;
  const bestBid = book.bids[0]?.price;
  if (bestAsk == null || bestBid == null) return state;
  const { orderSize, entryEdge, takeProfit, stopLoss, lookback, maxHoldSec } = cfg.params;
  const skew = tapeSkew(fills, lookback);
  const pos = state.position;
  const log = (s: SimState, e: LogEntry): SimState => ({ ...s, log: [e, ...s.log].slice(0, 60) });

  if (pos) {
    const heldSec = (now - pos.openedAt) / 1000;
    const mark = pos.side === "YES" ? bestBid : 1 - bestAsk;
    const exitReasons: string[] = [];
    if (mark - pos.entryPrice >= takeProfit) exitReasons.push("take-profit");
    if (pos.entryPrice - mark >= stopLoss) exitReasons.push("stop-loss");
    if (heldSec > maxHoldSec) exitReasons.push("time-stop");
    if (pos.side === "YES" && skew <= -entryEdge) exitReasons.push("tape-flip");
    if (exitReasons.length) {
      const pnl = (mark - pos.entryPrice) * pos.size;
      return log(
        {
          ...state,
          position: null,
          realizedPnl: state.realizedPnl + pnl,
          trades: state.trades + 1,
          wins: state.wins + (pnl > 0 ? 1 : 0),
        },
        { ts: now, action: "close", detail: `${pos.side} ${pos.size} @ ${(mark * 100).toFixed(1)}% · ${exitReasons.join(",")} · ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} tUSDC` }
      );
    }
    return state;
  }

  const wantYes =
    (cfg.archetype === "maker" && book.imbalance != null && book.imbalance >= entryEdge) ||
    (cfg.archetype === "momentum" && skew >= entryEdge);
  const wantNo =
    (cfg.archetype === "fade" && skew >= entryEdge) ||
    (cfg.archetype === "maker" && book.imbalance != null && book.imbalance <= 1 - entryEdge);

  if (wantYes) {
    return log(
      { ...state, position: { side: "YES", entryPrice: bestAsk, size: orderSize, openedAt: now } },
      { ts: now, action: "open", detail: `BUY ${orderSize} YES @ ${(bestAsk * 100).toFixed(1)}% · skew ${skew.toFixed(2)} · imb ${(book.imbalance ?? 0.5).toFixed(2)}` }
    );
  }
  if (wantNo) {
    const noPrice = 1 - bestBid;
    return log(
      { ...state, position: { side: "NO", entryPrice: noPrice, size: orderSize, openedAt: now } },
      { ts: now, action: "open", detail: `BUY ${orderSize} NO @ ${(noPrice * 100).toFixed(1)}% · skew ${skew.toFixed(2)} · imb ${(book.imbalance ?? 0.5).toFixed(2)}` }
    );
  }
  return state;
}

export function equityCurve(state: SimState, book: BookSnapshot): number {
  let eq = state.realizedPnl;
  if (state.position && book.bids[0] && book.asks[0]) {
    const mark = state.position.side === "YES" ? book.bids[0].price : 1 - book.asks[0].price;
    eq += (mark - state.position.entryPrice) * state.position.size;
  }
  return eq;
}
