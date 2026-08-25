export type SpotAsset = "BTC" | "ETH";

export type SpotFlowSide = "buy" | "sell";

export type SpotFlowRead =
  | "buyers lifting"
  | "sellers pressing"
  | "buy flow absorbed"
  | "sell flow absorbed"
  | "balanced/mixed";

export type SpotFlowStatus = "connecting" | "live" | "reconnecting" | "error";

export const SPOT_FLOW_BACKFILL_WINDOW_MS = 300_000;
export const SPOT_FLOW_BACKFILL_BUCKET_MS = 1_000;
export const SPOT_FLOW_BACKFILL_BUCKET_COUNT = SPOT_FLOW_BACKFILL_WINDOW_MS / SPOT_FLOW_BACKFILL_BUCKET_MS;

export const SPOT_FLOW_WINDOWS = [
  { id: "15s", label: "15s", durationMs: 15_000 },
  { id: "1m", label: "1m", durationMs: 60_000 },
  { id: "5m", label: "5m", durationMs: 300_000 },
] as const;

export type SpotFlowWindowId = (typeof SPOT_FLOW_WINDOWS)[number]["id"];

export interface SpotAggTrade {
  id: string;
  asset: SpotAsset;
  price: number;
  quantity: number;
  notional: number;
  side: SpotFlowSide;
  ts: number;
  openPrice?: number;
  highPrice?: number;
  lowPrice?: number;
  closePrice?: number;
  tradeCount?: number;
  sourceId?: string;
  origin?: "aggTrade" | "kline";
}

export interface SpotFlowKline {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  tradeCount: number;
  takerBuyQuantity: number;
  takerBuyNotional: number;
}

export interface SpotFlowMetrics {
  asset: SpotAsset;
  averageTradeNotional: number | null;
  buyQuantity: number;
  buyNotional: number;
  buyShare: number | null;
  deltaNotional: number;
  flowRead: SpotFlowRead | null;
  grossQuoteVolume: number;
  highLowRangePct: number | null;
  lastPrice: number | null;
  lastTradeTs: number | null;
  priceChange: number | null;
  priceChangePct: number | null;
  quoteVolumePerSecond: number;
  sellQuantity: number;
  sellNotional: number;
  sellShare: number | null;
  tradeCount: number;
  windowStart: number;
}

export interface SpotFlowCallbacks {
  onStatus?: (status: SpotFlowStatus) => void;
  onTrade: (trade: SpotAggTrade) => void;
}

export interface SpotFlowBackfillResponse {
  source: "Binance spot";
  fetchedAt: number;
  rangeStart: number;
  rangeEnd: number;
  trades: SpotAggTrade[];
  errors: Partial<Record<SpotAsset, string>>;
  truncatedAssets: SpotAsset[];
  coverage: Partial<Record<SpotAsset, SpotFlowCoverage>>;
}

export interface SpotFlowCoverage {
  start: number;
  end: number;
  buckets: number;
  expectedBuckets: number;
  complete: boolean;
  bucketStarts: number[];
}

const BINANCE_SPOT_STREAM = "wss://stream.binance.com:9443/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerStringValue(value: unknown) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return null;
}

function assetFromSymbol(symbol: string | null): SpotAsset | null {
  if (symbol === "BTCUSDT") return "BTC";
  if (symbol === "ETHUSDT") return "ETH";
  return null;
}

export function isSpotFlowCoverage(value: unknown): value is SpotFlowCoverage {
  if (typeof value !== "object" || value === null) return false;
  const coverage = value as Record<string, unknown>;
  if (typeof coverage.start !== "number" || !Number.isFinite(coverage.start)) return false;
  if (typeof coverage.end !== "number" || !Number.isFinite(coverage.end)) return false;
  if (typeof coverage.buckets !== "number" || !Number.isInteger(coverage.buckets) || coverage.buckets < 0) return false;
  if (typeof coverage.expectedBuckets !== "number" || !Number.isInteger(coverage.expectedBuckets) || coverage.expectedBuckets < 0) return false;
  if (typeof coverage.complete !== "boolean" || !Array.isArray(coverage.bucketStarts)) return false;
  if (coverage.bucketStarts.length !== coverage.buckets) return false;
  return coverage.bucketStarts.every((bucketStart, index, starts) =>
    typeof bucketStart === "number"
    && Number.isInteger(bucketStart)
    && bucketStart > 0
    && bucketStart % SPOT_FLOW_BACKFILL_BUCKET_MS === 0
    && (index === 0 || bucketStart > starts[index - 1]),
  );
}

export function parseBinanceAggTrade(payload: unknown, assetHint?: SpotAsset): SpotAggTrade | null {
  const root = asRecord(payload);
  const data = asRecord(root?.data) ?? root;
  if (!data || (data.e != null && data.e !== "aggTrade")) return null;
  const asset = assetFromSymbol(stringValue(data.s)) ?? assetHint ?? null;
  const price = numberValue(data.p);
  const quantity = numberValue(data.q);
  const ts = numberValue(data.T) ?? numberValue(data.E);
  if (!asset || price == null || price <= 0 || quantity == null || quantity <= 0 || ts == null || ts <= 0) return null;
  const tradeId = integerStringValue(data.a);
  return {
    id: `${asset}-${tradeId ?? `${ts}-${price}-${quantity}`}`,
    asset,
    price,
    quantity,
    notional: price * quantity,
    side: data.m === true ? "sell" : "buy",
    ts,
    sourceId: tradeId ?? undefined,
    origin: "aggTrade",
  };
}

export function parseBinanceAggTrades(payload: unknown, asset: SpotAsset): SpotAggTrade[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((row) => parseBinanceAggTrade(row, asset))
    .filter((trade): trade is SpotAggTrade => trade !== null);
}

export function parseBinanceKline(payload: unknown): SpotFlowKline | null {
  if (!Array.isArray(payload) || payload.length < 11) return null;
  const openTime = numberValue(payload[0]);
  const open = numberValue(payload[1]);
  const high = numberValue(payload[2]);
  const low = numberValue(payload[3]);
  const close = numberValue(payload[4]);
  const volume = numberValue(payload[5]);
  const closeTime = numberValue(payload[6]);
  const quoteVolume = numberValue(payload[7]);
  const tradeCount = numberValue(payload[8]);
  const takerBuyQuantity = numberValue(payload[9]);
  const takerBuyNotional = numberValue(payload[10]);
  if (openTime == null || closeTime == null || open == null || high == null || low == null || close == null || volume == null || quoteVolume == null || tradeCount == null || takerBuyQuantity == null || takerBuyNotional == null) return null;
  if (openTime <= 0 || closeTime < openTime || open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0 || quoteVolume < 0 || tradeCount < 0 || takerBuyQuantity < 0 || takerBuyNotional < 0) return null;
  return {
    openTime,
    closeTime,
    open,
    high,
    low,
    close,
    volume,
    quoteVolume,
    tradeCount: Math.floor(tradeCount),
    takerBuyQuantity,
    takerBuyNotional,
  };
}

export function spotTradesFromKline(kline: SpotFlowKline, asset: SpotAsset): SpotAggTrade[] {
  const sellQuantity = Math.max(0, kline.volume - kline.takerBuyQuantity);
  const sellNotional = Math.max(0, kline.quoteVolume - kline.takerBuyNotional);
  const common = {
    asset,
    price: kline.close,
    ts: kline.closeTime,
    openPrice: kline.open,
    highPrice: kline.high,
    lowPrice: kline.low,
    closePrice: kline.close,
    origin: "kline" as const,
  };
  const trades: SpotAggTrade[] = [];
  if (kline.takerBuyQuantity > 0 && kline.takerBuyNotional > 0) {
    trades.push({
      ...common,
      id: `${asset}-kline-${kline.openTime}-buy`,
      quantity: kline.takerBuyQuantity,
      notional: kline.takerBuyNotional,
      side: "buy",
      tradeCount: sellQuantity > 0 && sellNotional > 0 ? 0 : kline.tradeCount,
    });
  }
  if (sellQuantity > 0 && sellNotional > 0) {
    trades.push({
      ...common,
      id: `${asset}-kline-${kline.openTime}-sell`,
      quantity: sellQuantity,
      notional: sellNotional,
      side: "sell",
      tradeCount: kline.tradeCount,
    });
  }
  return trades;
}

function emptyMetrics(asset: SpotAsset, windowStart: number): SpotFlowMetrics {
  return {
    asset,
    averageTradeNotional: null,
    buyQuantity: 0,
    buyNotional: 0,
    buyShare: null,
    deltaNotional: 0,
    flowRead: null,
    grossQuoteVolume: 0,
    highLowRangePct: null,
    lastPrice: null,
    lastTradeTs: null,
    priceChange: null,
    priceChangePct: null,
    quoteVolumePerSecond: 0,
    sellQuantity: 0,
    sellNotional: 0,
    sellShare: null,
    tradeCount: 0,
    windowStart,
  };
}

const FLOW_DELTA_SHARE_THRESHOLD = 0.1;
const FLOW_PRICE_RESPONSE_THRESHOLD_PCT = 0.02;

export function classifySpotFlow(
  deltaNotional: number,
  grossQuoteVolume: number,
  priceChangePct: number | null,
): SpotFlowRead | null {
  if (grossQuoteVolume <= 0 || !Number.isFinite(grossQuoteVolume)) return null;
  if (priceChangePct == null || !Number.isFinite(priceChangePct)) return "balanced/mixed";
  const deltaShare = deltaNotional / grossQuoteVolume;
  if (deltaShare > FLOW_DELTA_SHARE_THRESHOLD) {
    return priceChangePct > FLOW_PRICE_RESPONSE_THRESHOLD_PCT ? "buyers lifting" : "buy flow absorbed";
  }
  if (deltaShare < -FLOW_DELTA_SHARE_THRESHOLD) {
    return priceChangePct < -FLOW_PRICE_RESPONSE_THRESHOLD_PCT ? "sellers pressing" : "sell flow absorbed";
  }
  return "balanced/mixed";
}

function compareDecimalStrings(left: string, right: string): number {
  const a = left.replace(/^0+(?=\d)/, "");
  const b = right.replace(/^0+(?=\d)/, "");
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareTradeOrder(left: SpotAggTrade, right: SpotAggTrade): number {
  const timestampOrder = left.ts - right.ts;
  if (timestampOrder) return timestampOrder;
  if (left.sourceId && right.sourceId) return compareDecimalStrings(left.sourceId, right.sourceId);
  return left.id.localeCompare(right.id);
}

export function mergeSpotFlowTrades(
  existing: readonly SpotAggTrade[],
  incoming: readonly SpotAggTrade[],
  now: number,
  coverage?: Partial<Record<SpotAsset, SpotFlowCoverage>>,
): SpotAggTrade[] {
  const store = new Map(existing.map((trade) => [trade.id, trade]));
  const coveredBucketStarts = new Map<SpotAsset, Set<number>>();
  if (coverage) {
    for (const asset of ["BTC", "ETH"] as const) {
      const assetCoverage = coverage[asset];
      if (assetCoverage) coveredBucketStarts.set(asset, new Set(assetCoverage.bucketStarts));
    }
    for (const [id, trade] of store) {
      const covered = coveredBucketStarts.get(trade.asset)?.has(Math.floor(trade.ts / SPOT_FLOW_BACKFILL_BUCKET_MS) * SPOT_FLOW_BACKFILL_BUCKET_MS) ?? false;
      if (covered && trade.origin !== "kline") store.delete(id);
    }
  }
  for (const trade of incoming) {
    const covered = coveredBucketStarts.get(trade.asset)?.has(Math.floor(trade.ts / SPOT_FLOW_BACKFILL_BUCKET_MS) * SPOT_FLOW_BACKFILL_BUCKET_MS) ?? false;
    if (covered && trade.origin !== "kline") continue;
    if (!store.has(trade.id)) store.set(trade.id, trade);
  }
  const cutoff = now - SPOT_FLOW_BACKFILL_WINDOW_MS - SPOT_FLOW_WINDOWS[0].durationMs;
  return Array.from(store.values()).filter((trade) => trade.ts >= cutoff);
}

export function aggregateSpotFlow(
  trades: readonly SpotAggTrade[],
  now: number,
  windowMs: number,
  asset: SpotAsset,
): SpotFlowMetrics {
  const windowStart = now - windowMs;
  const scoped = trades
    .filter((trade) => trade.asset === asset && trade.ts >= windowStart && trade.ts <= now)
    .slice()
    .sort(compareTradeOrder);
  if (!scoped.length) return emptyMetrics(asset, windowStart);

  let buyQuantity = 0;
  let buyNotional = 0;
  let sellQuantity = 0;
  let sellNotional = 0;
  let highPrice = 0;
  let lowPrice = Number.POSITIVE_INFINITY;
  for (const trade of scoped) {
    if (trade.side === "buy") {
      buyQuantity += trade.quantity;
      buyNotional += trade.notional;
    } else {
      sellQuantity += trade.quantity;
      sellNotional += trade.notional;
    }
    highPrice = Math.max(highPrice, trade.highPrice ?? trade.price);
    lowPrice = Math.min(lowPrice, trade.lowPrice ?? trade.price);
  }
  const totalNotional = buyNotional + sellNotional;
  const firstPrice = scoped[0].price;
  const lastPrice = scoped[scoped.length - 1].closePrice ?? scoped[scoped.length - 1].price;
  const firstOpenPrice = scoped[0].openPrice ?? firstPrice;
  const priceChange = lastPrice - firstOpenPrice;
  const tradeCount = scoped.reduce((count, trade) => count + (trade.tradeCount ?? 1), 0);
  const priceChangePct = firstOpenPrice > 0 ? ((lastPrice - firstOpenPrice) / firstOpenPrice) * 100 : null;
  return {
    asset,
    averageTradeNotional: tradeCount > 0 ? totalNotional / tradeCount : null,
    buyQuantity,
    buyNotional,
    buyShare: totalNotional > 0 ? buyNotional / totalNotional : null,
    deltaNotional: buyNotional - sellNotional,
    flowRead: classifySpotFlow(buyNotional - sellNotional, totalNotional, priceChangePct),
    grossQuoteVolume: totalNotional,
    highLowRangePct: lowPrice > 0 ? ((highPrice - lowPrice) / lowPrice) * 100 : null,
    lastPrice,
    lastTradeTs: scoped[scoped.length - 1].ts,
    priceChange,
    priceChangePct,
    quoteVolumePerSecond: totalNotional / (windowMs / 1_000),
    sellQuantity,
    sellNotional,
    sellShare: totalNotional > 0 ? sellNotional / totalNotional : null,
    tradeCount,
    windowStart,
  };
}

export function watchSpotAggTrades({ onStatus, onTrade }: SpotFlowCallbacks): () => void {
  let alive = true;
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;

  const connect = () => {
    if (!alive) return;
    if (typeof window === "undefined" || typeof WebSocket === "undefined") {
      onStatus?.("error");
      return;
    }
    onStatus?.(retryCount ? "reconnecting" : "connecting");
    socket = new WebSocket(BINANCE_SPOT_STREAM);
    socket.onopen = () => {
      if (!alive) return;
      retryCount = 0;
      onStatus?.("live");
    };
    socket.onmessage = (event) => {
      if (!alive) return;
      try {
        const payload = JSON.parse(String(event.data)) as unknown;
        const trade = parseBinanceAggTrade(payload);
        if (trade) onTrade(trade);
      } catch {
        return;
      }
    };
    socket.onerror = () => {
      if (alive) onStatus?.("reconnecting");
    };
    socket.onclose = () => {
      socket = null;
      if (!alive) return;
      retryCount += 1;
      onStatus?.("reconnecting");
      const delay = Math.min(15_000, 1_000 * 2 ** Math.min(retryCount - 1, 4));
      retryTimer = setTimeout(connect, delay);
    };
  };

  const kick = setTimeout(connect, 0);
  return () => {
    alive = false;
    clearTimeout(kick);
    if (retryTimer) clearTimeout(retryTimer);
    socket?.close();
    socket = null;
  };
}
