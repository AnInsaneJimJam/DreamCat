import { NextResponse } from "next/server";
import {
  parseBinanceKline,
  SPOT_FLOW_BACKFILL_BUCKET_COUNT,
  SPOT_FLOW_BACKFILL_BUCKET_MS,
  SPOT_FLOW_BACKFILL_WINDOW_MS,
  spotTradesFromKline,
  type SpotAggTrade,
  type SpotAsset,
  type SpotFlowBackfillResponse,
  type SpotFlowCoverage,
} from "@/lib/spot-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";
const ASSETS: SpotAsset[] = ["BTC", "ETH"];
const SYMBOLS: Record<SpotAsset, string> = { BTC: "BTCUSDT", ETH: "ETHUSDT" };

interface AssetBackfillResult {
  asset: SpotAsset;
  trades: SpotAggTrade[];
  error: string | null;
  partial: boolean;
  coverage: SpotFlowCoverage;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") return "Binance history request timed out.";
  if (error instanceof Error && error.message) return error.message.slice(0, 180);
  return "Binance history request failed.";
}

async function fetchAssetBackfill(asset: SpotAsset, rangeStart: number, rangeEnd: number): Promise<AssetBackfillResult> {
  try {
    const params = new URLSearchParams({
      symbol: SYMBOLS[asset],
      interval: "1s",
      startTime: String(rangeStart),
      endTime: String(rangeEnd),
      limit: String(SPOT_FLOW_BACKFILL_BUCKET_COUNT),
    });
    const response = await fetch(`${BINANCE_KLINES_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Binance returned HTTP ${response.status}.`);
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      const apiError = recordValue(payload)?.msg;
      throw new Error(typeof apiError === "string" ? apiError : "Binance returned an invalid kline payload.");
    }
    const parsed = payload
      .map(parseBinanceKline)
      .filter((kline) => kline !== null)
      .filter((kline) => kline.openTime >= rangeStart && kline.closeTime <= rangeEnd);
    const trades = parsed.flatMap((kline) => spotTradesFromKline(kline, asset));
    const first = parsed[0];
    const last = parsed[parsed.length - 1];
    const bucketStarts = parsed.map((kline) => kline.openTime);
    const contiguous = parsed.every((kline, index) => index === 0 || kline.openTime === parsed[index - 1].openTime + SPOT_FLOW_BACKFILL_BUCKET_MS);
    const complete = parsed.length === SPOT_FLOW_BACKFILL_BUCKET_COUNT
      && first?.openTime === rangeStart
      && last?.closeTime === rangeEnd
      && contiguous;
    return {
      asset,
      trades,
      error: null,
      partial: !complete,
      coverage: {
        start: first?.openTime ?? rangeStart,
        end: last?.closeTime ?? rangeEnd,
        buckets: parsed.length,
        expectedBuckets: SPOT_FLOW_BACKFILL_BUCKET_COUNT,
        complete,
        bucketStarts,
      },
    };
  } catch (error) {
    return {
      asset,
      trades: [],
      error: errorText(error),
      partial: true,
      coverage: {
        start: rangeStart,
        end: rangeEnd,
        buckets: 0,
        expectedBuckets: SPOT_FLOW_BACKFILL_BUCKET_COUNT,
        complete: false,
        bucketStarts: [],
      },
    };
  }
}

function requestedAssets(request: Request): SpotAsset[] {
  const raw = new URL(request.url).searchParams.get("assets");
  if (!raw) return ASSETS;
  return Array.from(new Set(raw.split(",").map((value) => value.trim().toUpperCase()).filter((value): value is SpotAsset => ASSETS.includes(value as SpotAsset))));
}

export async function GET(request: Request) {
  const assets = requestedAssets(request);
  if (!assets.length) return NextResponse.json({ error: "Unsupported spot asset." }, { status: 400 });
  const currentSecond = Math.floor(Date.now() / SPOT_FLOW_BACKFILL_BUCKET_MS) * SPOT_FLOW_BACKFILL_BUCKET_MS;
  const rangeStart = currentSecond - SPOT_FLOW_BACKFILL_WINDOW_MS;
  const rangeEnd = currentSecond - 1;
  const results = await Promise.all(assets.map((asset) => fetchAssetBackfill(asset, rangeStart, rangeEnd)));
  const errors: Partial<Record<SpotAsset, string>> = {};
  const truncatedAssets: SpotAsset[] = [];
  const coverage: SpotFlowBackfillResponse["coverage"] = {};
  const trades = results.flatMap((result) => {
    if (result.error) errors[result.asset] = result.error;
    if (result.partial) truncatedAssets.push(result.asset);
    coverage[result.asset] = result.coverage;
    return result.trades;
  });
  const body: SpotFlowBackfillResponse = {
    source: "Binance spot",
    fetchedAt: Date.now(),
    rangeStart,
    rangeEnd,
    trades,
    errors,
    truncatedAssets,
    coverage,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
