import type { BookSnapshot, Fill } from "./dreamdex";

export type Archetype = "maker" | "momentum" | "fade" | "fairvalue" | "theta" | "marketmaker";

export interface StrategyParams {
  orderSize: number;
  entryEdge: number;
  takeProfit: number;
  stopLoss: number;
  lookback: number;
  maxHoldSec: number;
  edgeThreshold?: number;
  sigmaFloor?: number;
  settleSigmas?: number;
  maxEntryPrice?: number;
  tauGateSec?: number;
  quoteSpread?: number;
  requoteThreshold?: number;
  maxQuoteAgeSec?: number;
  flattenSec?: number;
  tapeWindowSec?: number;
}

export interface StrategyConfig {
  archetype: Archetype;
  params: StrategyParams;
}

export interface MarketContext {
  asset: string;
  strike: number | null;
  expiry: number;
  spot: number | null;
  spotPrev: number | null;
  sigma: number | null;
}

export interface PersonaTemplate {
  archetype: Archetype;
  cat: string;
  blurb: string;
  defaults: StrategyParams;
}

export const DEFAULT_EDGE_THRESHOLD = 0.06;
export const DEFAULT_SIGMA_FLOOR = 0.0004;
export const DEFAULT_SETTLE_SIGMAS = 1.8;
export const DEFAULT_MAX_ENTRY_PRICE = 0.92;
export const DEFAULT_TAU_GATE_SEC = 600;
export const DEFAULT_QUOTE_SPREAD = 0.015;
export const DEFAULT_REQUOTE_THRESHOLD = 0.01;
export const DEFAULT_MAX_QUOTE_AGE_SEC = 120;
export const DEFAULT_FLATTEN_SEC = 60;
export const MIN_QUOTE_PRICE = 0.01;
export const MAX_QUOTE_PRICE = 0.99;
export const QUOTE_QUEUE_GAP = 0.005;
export const DEFAULT_TAPE_WINDOW_SEC = 300;
export const MIN_TAPE_PRINTS = 3;

export const MODEL_ARCHETYPES: readonly Archetype[] = ["fairvalue", "theta"];

export function isModelArchetype(archetype: Archetype): boolean {
  return MODEL_ARCHETYPES.includes(archetype);
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
    blurb: "Chases prints. Buys when the recent tape skews aggressively toward buys.",
    defaults: { orderSize: 5, entryEdge: 0.65, takeProfit: 0.05, stopLoss: 0.025, lookback: 6, maxHoldSec: 240, tapeWindowSec: DEFAULT_TAPE_WINDOW_SEC },
  },
  {
    archetype: "fade",
    cat: "Luna",
    blurb: "Fades euphoria. Sells into recent buy-skewed tapes by taking the NO side.",
    defaults: { orderSize: 5, entryEdge: 0.7, takeProfit: 0.04, stopLoss: 0.03, lookback: 8, maxHoldSec: 300, tapeWindowSec: DEFAULT_TAPE_WINDOW_SEC },
  },
  {
    archetype: "fairvalue",
    cat: "Fairy",
    blurb: "Prices the contract from spot, strike and time to expiry, then buys whichever side the model calls cheap.",
    defaults: {
      orderSize: 5,
      entryEdge: 0.6,
      takeProfit: 0.05,
      stopLoss: 0.04,
      lookback: 8,
      maxHoldSec: 420,
      edgeThreshold: DEFAULT_EDGE_THRESHOLD,
      sigmaFloor: DEFAULT_SIGMA_FLOOR,
    },
  },
  {
    archetype: "theta",
    cat: "Theta",
    blurb: "Rides convergence. Late in the window it buys the side spot has already decided and holds into expiry.",
    defaults: {
      orderSize: 5,
      entryEdge: 0.6,
      takeProfit: 0.06,
      stopLoss: 0.05,
      lookback: 8,
      maxHoldSec: 900,
      sigmaFloor: DEFAULT_SIGMA_FLOOR,
      settleSigmas: DEFAULT_SETTLE_SIGMAS,
      maxEntryPrice: DEFAULT_MAX_ENTRY_PRICE,
      tauGateSec: DEFAULT_TAU_GATE_SEC,
    },
  },
  {
    archetype: "marketmaker",
    cat: "Mittens",
    blurb: "Rests a bid and an ask either side of model fair value and earns the spread instead of paying it.",
    defaults: {
      orderSize: 5,
      entryEdge: 0.6,
      takeProfit: 0.02,
      stopLoss: 0.06,
      lookback: 8,
      maxHoldSec: 300,
      sigmaFloor: DEFAULT_SIGMA_FLOOR,
      quoteSpread: DEFAULT_QUOTE_SPREAD,
      requoteThreshold: DEFAULT_REQUOTE_THRESHOLD,
      maxQuoteAgeSec: DEFAULT_MAX_QUOTE_AGE_SEC,
      flattenSec: DEFAULT_FLATTEN_SEC,
    },
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

export interface RestingQuote {
  price: number;
  size: number;
  placedAt: number;
}

export interface QuoteBook {
  bid: RestingQuote | null;
  ask: RestingQuote | null;
}

export interface SimState {
  position: SimPosition | null;
  realizedPnl: number;
  trades: number;
  wins: number;
  log: LogEntry[];
  quotes?: QuoteBook;
}

export const initialSimState: SimState = { position: null, realizedPnl: 0, trades: 0, wins: 0, log: [] };

const EMPTY_QUOTES: QuoteBook = { bid: null, ask: null };

function clampQuote(price: number): number {
  return Math.min(MAX_QUOTE_PRICE, Math.max(MIN_QUOTE_PRICE, price));
}

function fillTimestamp(fill: Fill): number {
  return fill.ts < 1e12 ? fill.ts * 1000 : fill.ts;
}

function restingBidFilled(quote: RestingQuote, book: BookSnapshot, fills: Fill[]): boolean {
  const bestAsk = book.asks[0]?.price;
  if (bestAsk != null && bestAsk <= quote.price) return true;
  return fills.some((fill) => fillTimestamp(fill) > quote.placedAt && fill.side === "sell" && fill.price <= quote.price);
}

function restingAskFilled(quote: RestingQuote, book: BookSnapshot, fills: Fill[]): boolean {
  const bestBid = book.bids[0]?.price;
  if (bestBid != null && bestBid >= quote.price) return true;
  return fills.some((fill) => fillTimestamp(fill) > quote.placedAt && fill.side === "buy" && fill.price >= quote.price);
}

function refreshQuote(
  current: RestingQuote | null,
  desired: number,
  size: number,
  now: number,
  requoteThreshold: number,
  maxQuoteAgeSec: number
): RestingQuote {
  if (
    current &&
    Math.abs(current.price - desired) < requoteThreshold &&
    (now - current.placedAt) / 1000 <= maxQuoteAgeSec
  ) {
    return current;
  }
  return { price: desired, size, placedAt: now };
}

export function tapeSkew(fills: Fill[], lookback: number, now: number, windowSec: number): number {
  const cutoff = now - windowSec * 1000;
  const recent: Fill[] = [];
  for (const fill of fills) {
    if (recent.length >= lookback) break;
    if (fillTimestamp(fill) >= cutoff) recent.push(fill);
  }
  if (recent.length < MIN_TAPE_PRINTS) return 0;
  let score = 0;
  for (const f of recent) score += f.side === "buy" ? 1 : -1;
  return score / recent.length;
}

export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const density = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const tail =
    density * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}

export function modelSigmas(params: StrategyParams, ctx: MarketContext | undefined, now: number): number | null {
  if (!ctx || ctx.spot == null || ctx.strike == null) return null;
  if (!(ctx.spot > 0) || !(ctx.strike > 0)) return null;
  const tauMin = (ctx.expiry - now) / 60000;
  if (!(tauMin > 0)) return null;
  const sigma = Math.max(ctx.sigma ?? 0, params.sigmaFloor ?? DEFAULT_SIGMA_FLOOR);
  const scaled = sigma * Math.sqrt(tauMin);
  if (!(scaled > 0)) return null;
  const d = Math.log(ctx.spot / ctx.strike) / scaled;
  return Number.isFinite(d) ? d : null;
}

export function fairProbability(params: StrategyParams, ctx: MarketContext | undefined, now: number): number | null {
  const d = modelSigmas(params, ctx, now);
  return d == null ? null : normCdf(d);
}

function appendLog(state: SimState, entry: LogEntry): SimState {
  return { ...state, log: [entry, ...state.log].slice(0, 60) };
}

function closePosition(state: SimState, pos: SimPosition, mark: number, now: number, reasons: string[], label: string): SimState {
  const pnl = (mark - pos.entryPrice) * pos.size;
  return appendLog(
    {
      ...state,
      position: null,
      realizedPnl: state.realizedPnl + pnl,
      trades: state.trades + 1,
      wins: state.wins + (pnl > 0 ? 1 : 0),
    },
    {
      ts: now,
      action: "close",
      detail: `${label} @ ${(mark * 100).toFixed(1)}% · ${reasons.join(",")} · ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} tUSDC`,
    }
  );
}

function stepMarketMaker(
  cfg: StrategyConfig,
  state: SimState,
  book: BookSnapshot,
  fills: Fill[],
  now: number,
  ctx: MarketContext | undefined,
  fair: number | null
): SimState {
  const bestBid = book.bids[0]!.price;
  const bestAsk = book.asks[0]!.price;
  const { orderSize, takeProfit, stopLoss, maxHoldSec } = cfg.params;
  const quoteSpread = cfg.params.quoteSpread ?? DEFAULT_QUOTE_SPREAD;
  const requoteThreshold = cfg.params.requoteThreshold ?? DEFAULT_REQUOTE_THRESHOLD;
  const maxQuoteAgeSec = cfg.params.maxQuoteAgeSec ?? DEFAULT_MAX_QUOTE_AGE_SEC;
  const flattenSec = cfg.params.flattenSec ?? DEFAULT_FLATTEN_SEC;
  const center = fair ?? book.mid ?? (bestBid + bestAsk) / 2;
  const secToExpiry = ctx ? (ctx.expiry - now) / 1000 : null;
  const quotes = state.quotes ?? EMPTY_QUOTES;
  const pos = state.position;

  if (pos) {
    const heldSec = (now - pos.openedAt) / 1000;
    const mark = pos.side === "YES" ? bestBid : 1 - bestAsk;
    const forcedReasons: string[] = [];
    if (pos.entryPrice - mark >= stopLoss) forcedReasons.push("stop-loss");
    if (heldSec > maxHoldSec) forcedReasons.push("time-stop");
    if (secToExpiry != null && secToExpiry <= flattenSec) forcedReasons.push("flatten");
    if (forcedReasons.length) {
      return { ...closePosition(state, pos, mark, now, forcedReasons, `${pos.side} ${pos.size} taken`), quotes: EMPTY_QUOTES };
    }

    if (pos.side === "YES") {
      if (quotes.ask && restingAskFilled(quotes.ask, book, fills)) {
        return { ...closePosition(state, pos, quotes.ask.price, now, ["quote-filled"], `SELL ${pos.size} YES resting`), quotes: EMPTY_QUOTES };
      }
      const desiredAsk = clampQuote(Math.max(pos.entryPrice + takeProfit, center + quoteSpread, bestBid + QUOTE_QUEUE_GAP));
      const ask = refreshQuote(quotes.ask, desiredAsk, pos.size, now, requoteThreshold, maxQuoteAgeSec);
      return { ...state, quotes: { bid: null, ask } };
    }

    if (quotes.bid && restingBidFilled(quotes.bid, book, fills)) {
      return { ...closePosition(state, pos, 1 - quotes.bid.price, now, ["quote-filled"], `BUY ${pos.size} YES resting`), quotes: EMPTY_QUOTES };
    }
    const shortAt = 1 - pos.entryPrice;
    const desiredBid = clampQuote(Math.min(shortAt - takeProfit, center - quoteSpread, bestAsk - QUOTE_QUEUE_GAP));
    const bid = refreshQuote(quotes.bid, desiredBid, pos.size, now, requoteThreshold, maxQuoteAgeSec);
    return { ...state, quotes: { bid, ask: null } };
  }

  if (secToExpiry != null && secToExpiry <= flattenSec) {
    return state.quotes ? { ...state, quotes: EMPTY_QUOTES } : state;
  }

  if (quotes.bid && restingBidFilled(quotes.bid, book, fills)) {
    const filled = quotes.bid;
    return appendLog(
      { ...state, position: { side: "YES", entryPrice: filled.price, size: filled.size, openedAt: now }, quotes: EMPTY_QUOTES },
      { ts: now, action: "open", detail: `BID HIT ${filled.size} YES @ ${(filled.price * 100).toFixed(1)}% · fair ${fair == null ? "n/a" : `${(fair * 100).toFixed(1)}%`}` }
    );
  }
  if (quotes.ask && restingAskFilled(quotes.ask, book, fills)) {
    const filled = quotes.ask;
    return appendLog(
      { ...state, position: { side: "NO", entryPrice: 1 - filled.price, size: filled.size, openedAt: now }, quotes: EMPTY_QUOTES },
      { ts: now, action: "open", detail: `ASK LIFTED ${filled.size} YES @ ${(filled.price * 100).toFixed(1)}% · fair ${fair == null ? "n/a" : `${(fair * 100).toFixed(1)}%`}` }
    );
  }

  const desiredBid = clampQuote(Math.min(center - quoteSpread, bestAsk - QUOTE_QUEUE_GAP));
  const desiredAsk = clampQuote(Math.max(center + quoteSpread, bestBid + QUOTE_QUEUE_GAP));
  if (desiredBid >= desiredAsk) return state.quotes ? { ...state, quotes: EMPTY_QUOTES } : state;

  const bid = refreshQuote(quotes.bid, desiredBid, orderSize, now, requoteThreshold, maxQuoteAgeSec);
  const ask = refreshQuote(quotes.ask, desiredAsk, orderSize, now, requoteThreshold, maxQuoteAgeSec);
  const changed = bid !== quotes.bid || ask !== quotes.ask;
  const next = { ...state, quotes: { bid, ask } };
  return changed
    ? appendLog(next, { ts: now, action: "hold", detail: `QUOTE ${(bid.price * 100).toFixed(1)}% / ${(ask.price * 100).toFixed(1)}% · ${orderSize} ctr` })
    : next;
}

export function stepSim(
  cfg: StrategyConfig,
  state: SimState,
  book: BookSnapshot,
  fills: Fill[],
  now: number,
  ctx?: MarketContext
): SimState {
  const bestAsk = book.asks[0]?.price;
  const bestBid = book.bids[0]?.price;
  if (bestAsk == null || bestBid == null) return state;
  const { orderSize, entryEdge, takeProfit, stopLoss, lookback, maxHoldSec } = cfg.params;
  const edgeThreshold = cfg.params.edgeThreshold ?? DEFAULT_EDGE_THRESHOLD;
  const settleSigmas = cfg.params.settleSigmas ?? DEFAULT_SETTLE_SIGMAS;
  const maxEntryPrice = cfg.params.maxEntryPrice ?? DEFAULT_MAX_ENTRY_PRICE;
  const tauGateSec = cfg.params.tauGateSec ?? DEFAULT_TAU_GATE_SEC;
  const skew = tapeSkew(fills, lookback, now, cfg.params.tapeWindowSec ?? DEFAULT_TAPE_WINDOW_SEC);
  const pos = state.position;
  const model = isModelArchetype(cfg.archetype);
  const quoting = cfg.archetype === "marketmaker";
  const d = model || quoting ? modelSigmas(cfg.params, ctx, now) : null;
  const fair = d == null ? null : normCdf(d);
  const secToExpiry = ctx ? (ctx.expiry - now) / 1000 : null;

  if (quoting) return stepMarketMaker(cfg, state, book, fills, now, ctx, fair);

  if (pos) {
    const heldSec = (now - pos.openedAt) / 1000;
    const mark = pos.side === "YES" ? bestBid : 1 - bestAsk;
    const exitReasons: string[] = [];

    if (cfg.archetype === "theta") {
      if (secToExpiry != null && secToExpiry <= 10) exitReasons.push("expiry");
      if (d != null && ((pos.side === "YES" && d < settleSigmas * 0.4) || (pos.side === "NO" && d > -settleSigmas * 0.4))) {
        exitReasons.push("strike-recross");
      }
      if (pos.entryPrice - mark >= stopLoss) exitReasons.push("stop-loss");
    } else {
      if (mark - pos.entryPrice >= takeProfit) exitReasons.push("take-profit");
      if (pos.entryPrice - mark >= stopLoss) exitReasons.push("stop-loss");
      if (heldSec > maxHoldSec) exitReasons.push("time-stop");
      if (cfg.archetype === "fairvalue") {
        if (secToExpiry != null && secToExpiry <= 30) exitReasons.push("expiry");
        if (fair != null && pos.side === "YES" && fair <= bestBid - edgeThreshold / 2) exitReasons.push("model-target");
        if (fair != null && pos.side === "NO" && fair >= bestAsk + edgeThreshold / 2) exitReasons.push("model-target");
      } else if (pos.side === "YES" && skew <= -entryEdge) {
        exitReasons.push("tape-flip");
      }
    }

    if (exitReasons.length) {
      return closePosition(state, pos, mark, now, exitReasons, `${pos.side} ${pos.size}`);
    }
    return state;
  }

  if (model) {
    if (fair == null || d == null) return state;
    if (secToExpiry != null && secToExpiry <= 30) return state;

    if (cfg.archetype === "fairvalue") {
      if (fair - bestAsk >= edgeThreshold) {
        return appendLog(
          { ...state, position: { side: "YES", entryPrice: bestAsk, size: orderSize, openedAt: now } },
          {
            ts: now,
            action: "open",
            detail: `BUY ${orderSize} YES @ ${(bestAsk * 100).toFixed(1)}% · fair ${(fair * 100).toFixed(1)}% · ${d.toFixed(2)}σ`,
          }
        );
      }
      if (bestBid - fair >= edgeThreshold) {
        const noPrice = 1 - bestBid;
        return appendLog(
          { ...state, position: { side: "NO", entryPrice: noPrice, size: orderSize, openedAt: now } },
          {
            ts: now,
            action: "open",
            detail: `BUY ${orderSize} NO @ ${(noPrice * 100).toFixed(1)}% · fair ${((1 - fair) * 100).toFixed(1)}% · ${d.toFixed(2)}σ`,
          }
        );
      }
      return state;
    }

    if (secToExpiry == null || secToExpiry > tauGateSec) return state;
    if (d >= settleSigmas && bestAsk <= maxEntryPrice) {
      return appendLog(
        { ...state, position: { side: "YES", entryPrice: bestAsk, size: orderSize, openedAt: now } },
        {
          ts: now,
          action: "open",
          detail: `BUY ${orderSize} YES @ ${(bestAsk * 100).toFixed(1)}% · ${d.toFixed(2)}σ clear · ${Math.round(secToExpiry)}s left`,
        }
      );
    }
    if (d <= -settleSigmas && 1 - bestBid <= maxEntryPrice) {
      const noPrice = 1 - bestBid;
      return appendLog(
        { ...state, position: { side: "NO", entryPrice: noPrice, size: orderSize, openedAt: now } },
        {
          ts: now,
          action: "open",
          detail: `BUY ${orderSize} NO @ ${(noPrice * 100).toFixed(1)}% · ${d.toFixed(2)}σ clear · ${Math.round(secToExpiry)}s left`,
        }
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
    return appendLog(
      { ...state, position: { side: "YES", entryPrice: bestAsk, size: orderSize, openedAt: now } },
      { ts: now, action: "open", detail: `BUY ${orderSize} YES @ ${(bestAsk * 100).toFixed(1)}% · skew ${skew.toFixed(2)} · imb ${(book.imbalance ?? 0.5).toFixed(2)}` }
    );
  }
  if (wantNo) {
    const noPrice = 1 - bestBid;
    return appendLog(
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
