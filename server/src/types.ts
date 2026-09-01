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

export interface SimPosition {
  side: "YES" | "NO";
  entryPrice: number;
  size: number;
  openedAt: number;
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
  quotes?: QuoteBook;
}

export interface FleetCatInput {
  slot: number;
  name: string;
  accent: string;
  archetype: Archetype;
  params: StrategyParams;
  marketId: string;
  allocPct: number;
}

export interface LiveCatState {
  status: "idle" | "submitting" | "error";
  realizedPnl: number;
  orders: number;
  fills: number;
  entryPrice: number | null;
  lastHash?: string;
  lastError?: string;
  shadowActions?: number;
  cancels?: number;
}

export interface FleetCat extends FleetCatInput {
  sim: SimState;
  equityHist: number[];
  live?: LiveCatState;
}

export type QuotePolicy = "shadow" | "single" | "dual";

export interface PersistedFleetState {
  cats: FleetCat[];
  running: boolean;
  mode: "dry" | "live";
  bankroll: number;
  quotePolicy: QuotePolicy;
}

export interface Session {
  walletAddress: string;
  createdAt: number;
  expiresAt: number;
}

export interface BookLevel {
  price: number;
  qty: number;
}

export interface BookSnapshot {
  bids: BookLevel[];
  asks: BookLevel[];
  bidDepth: number;
  askDepth: number;
  mid: number | null;
  spread: number | null;
  imbalance: number | null;
}

export interface Fill {
  price: number;
  qty: number;
  side: "buy" | "sell" | null;
  ts: number;
}

export type MarketSource = "indexer" | "chain" | "merged";
export type TrustLevel = "attested" | "verified";
export type MarketExecutionMode = "sdk-symbol" | "chain-pool";

export interface LiveMarketRow {
  id: string;
  poolAddress: string;
  asset: string;
  kind: "ladder" | "open";
  strike?: string | null;
  strikeLabel: string;
  windowLabel: string;
  interval: string;
  expiry: number;
  status: string;
  question: string;
  title?: string;
  volumeQuote: number;
  tradeCount: number;
  lastPrice: number | null;
  yesSymbol: string;
  noSymbol?: string;
  marketSymbol?: string;
  quoteSymbol?: string | null;
  quoteDecimals?: number;
  executionMode?: MarketExecutionMode;
  executionReady?: boolean;
  source?: MarketSource;
  trust?: TrustLevel;
  sdkReady?: boolean;
  tradingStart?: number | null;
}

export interface MarketContext {
  asset: string;
  strike: number | null;
  expiry: number;
  spot: number | null;
  spotPrev: number | null;
  sigma: number | null;
}

export interface FleetSlotData {
  book: BookSnapshot;
  fills: Fill[];
  ctx?: MarketContext;
}
