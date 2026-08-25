export type MarketSource = "indexer" | "chain" | "merged";
export type TrustLevel = "attested" | "verified";
export type MarketExecutionMode = "sdk-symbol" | "chain-pool";

export interface MarketOutcome {
  label: string;
  index: number;
  tokenId: string | null;
  symbol: string;
}

export interface MarketBookMetadata {
  poolAddress: string;
  yesSymbol: string;
  noSymbol: string;
  quoteDecimals: number;
  tickSize: string | null;
  lotSize: string | null;
  minQuantity: string | null;
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
}

export interface MarketProvenance {
  source: "indexer" | "chain";
  trust: TrustLevel;
  observedAtSec: number;
  blockNumber?: number;
  transactionHash?: string;
  logIndex?: number;
}

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
  outcomes?: readonly MarketOutcome[];
  quoteSymbol?: string | null;
  quoteDecimals?: number;
  executionMode?: MarketExecutionMode;
  executionReady?: boolean;
  book?: MarketBookMetadata;
  source?: MarketSource;
  trust?: TrustLevel;
  provenance?: readonly MarketProvenance[];
  sdkReady?: boolean;
  marketAddress?: string;
  nonce?: string | null;
  collateral?: string | null;
  creator?: string | null;
  operatorId?: string | null;
  venueId?: string | null;
  yesTokenId?: string | null;
  noTokenId?: string | null;
  outcomeToken?: string | null;
  tradingStart?: number | null;
  createdBlock?: number | null;
  createdTx?: string | null;
  isResolved?: boolean;
  isVoided?: boolean;
  winningOutcome?: number | null;
  finalized?: boolean;
  backing?: string | null;
}

export interface MarketCreatedArgs {
  marketId: string;
  market: string;
  pool: string;
  oracleQuestionId: string;
  operatorId: string;
  venueId: string;
  creator: string;
  collateral: string;
  yesId: string;
  noId: string;
  nonce: string;
  outcomeSlotCount: string;
  marketType: string;
  tradingStart: string;
  expiry: string;
  voidPolicy: string;
  asset: string;
  strike: string;
  question: string;
  context: string;
}

export interface ChainMarketObservation {
  chainId: number;
  address: string;
  blockNumber: number;
  blockHash: string | null;
  transactionHash: string;
  logIndex: number;
  args: MarketCreatedArgs;
}

export interface ChainMarketEnrichment {
  marketSymbol: string;
  yesSymbol: string;
  noSymbol: string;
  outcomes: readonly MarketOutcome[];
  quoteSymbol: string | null;
  quoteDecimals: number;
  status: string;
  marketAddress: string;
  poolAddress: string;
  collateral: string;
  outcomeToken: string | null;
  yesTokenId: string;
  noTokenId: string;
  nonce: string | null;
  tradingStart: number;
  expiry: number;
  isResolved: boolean;
  isVoided: boolean;
  winningOutcome: number | null;
  finalized: boolean;
  backing: string | null;
  executionReady: boolean;
  book: MarketBookMetadata | null;
}

export interface ChainSyncResult {
  events: readonly ChainMarketObservation[];
  headBlock: number;
  nextBlock: number;
  complete: boolean;
  chunks: number;
  error: string | null;
}

export interface MarketsResponseMeta {
  officialCount: number;
  chainCount: number;
  mergedCount: number;
  headBlock: number | null;
  nextBlock: number | null;
  chainComplete: boolean;
  degraded: boolean;
  error: string | null;
  chainExecutionReadyCount?: number;
  stale?: boolean;
  ageMs?: number;
}

export interface MarketsResponse {
  markets: LiveMarketRow[];
  meta: MarketsResponseMeta;
}

export type LogRange = { fromBlock: number; toBlock: number };

export function scalarString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" || typeof value === "number") return String(value);
  return null;
}

export function normalizeAddress(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeMarketId(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function finiteNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
