import { SomniaMarkets, SOMNIA_TESTNET_PRICE_FEED } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { env } from "./env.js";
import type { LiveMarketRow, MarketContext } from "./types.js";

const SIGMA_REFRESH_MS = 60_000;
const SIGMA_CANDLES = 180;
const MIN_RETURNS = 10;

interface AssetEntry {
  refs: number;
  spot: number | null;
  spotPrev: number | null;
  sigma: number | null;
  stopSpot: (() => void) | null;
  sigmaTimer: ReturnType<typeof setInterval> | null;
}

const assets = new Map<string, AssetEntry>();

let pxClient: SomniaMarkets | null = null;

function getPxClient(): SomniaMarkets {
  if (!pxClient) {
    pxClient = new SomniaMarkets({
      indexerUrl: env.INDEXER_URL,
      chain: somniaShannon,
      wsRpcUrl: env.WS_RPC_URL,
      priceFeed: SOMNIA_TESTNET_PRICE_FEED,
    });
  }
  return pxClient;
}

function normalizeAsset(asset: string): string {
  return asset.trim().toUpperCase();
}

function stdevOfLogReturns(closes: number[]): number | null {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const previous = closes[i - 1];
    const current = closes[i];
    if (previous > 0 && current > 0) returns.push(Math.log(current / previous));
  }
  if (returns.length < MIN_RETURNS) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const sd = Math.sqrt(variance);
  return Number.isFinite(sd) && sd > 0 ? sd : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function refreshSigma(asset: string): Promise<void> {
  try {
    const candles = await getPxClient().client.fetchPriceCandles(asset, "M1", { limit: SIGMA_CANDLES });
    const entry = assets.get(asset);
    if (!entry) return;
    const sigma = stdevOfLogReturns(candles.map((c) => c.close));
    if (sigma != null) entry.sigma = sigma;
  } catch {}
}

function startSpotPoll(asset: string): () => void {
  let alive = true;
  (async () => {
    while (alive) {
      try {
        const live = await getPxClient().watchPrice(asset);
        if (!alive) return;
        const entry = assets.get(asset);
        if (entry && Number.isFinite(Number(live.price)) && Number(live.price) > 0) {
          entry.spotPrev = entry.spot;
          entry.spot = Number(live.price);
        }
      } catch {
        await sleep(2000);
      }
    }
  })();
  return () => {
    alive = false;
  };
}

export function acquireServerAsset(asset: string): () => void {
  const key = normalizeAsset(asset);
  if (!key) return () => {};
  let entry = assets.get(key);
  if (!entry) {
    entry = { refs: 0, spot: null, spotPrev: null, sigma: null, stopSpot: null, sigmaTimer: null };
    assets.set(key, entry);
    entry.stopSpot = startSpotPoll(key);
    void refreshSigma(key);
    entry.sigmaTimer = setInterval(() => void refreshSigma(key), SIGMA_REFRESH_MS);
  }
  entry.refs += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = assets.get(key);
    if (!current) return;
    current.refs -= 1;
    if (current.refs > 0) return;
    current.stopSpot?.();
    if (current.sigmaTimer) clearInterval(current.sigmaTimer);
    assets.delete(key);
  };
}

export function getServerAssetStats(asset: string): { spot: number | null; spotPrev: number | null; sigma: number | null } {
  const entry = assets.get(normalizeAsset(asset));
  return { spot: entry?.spot ?? null, spotPrev: entry?.spotPrev ?? null, sigma: entry?.sigma ?? null };
}

export function buildServerMarketContext(row: LiveMarketRow): MarketContext {
  const stats = getServerAssetStats(row.asset);
  const strikeLabel = String(row.strikeLabel ?? "").replaceAll(",", "");
  const strikeNum = Number(strikeLabel);
  return {
    asset: row.asset,
    strike: row.kind === "ladder" && Number.isFinite(strikeNum) && strikeNum > 0 ? strikeNum : null,
    expiry: row.expiry,
    spot: stats.spot,
    spotPrev: stats.spotPrev,
    sigma: stats.sigma,
  };
}
