"use client";

import type { LiveMarketRow } from "./dreamdex";
import { bucketStartFor, fetchCandles, watchSpot, type Timeframe } from "./prices";
import type { MarketContext } from "./strategy";

const SIGMA_REFRESH_MS = 60000;
const SIGMA_CANDLES = 180;
const MIN_RETURNS = 10;
const OPEN_RETRY_MS = 30000;
const OPEN_DAILY_SPAN_MS = 6 * 3600000;
const OPEN_CACHE_TTL_MS = 48 * 3600000;

interface AssetEntry {
  refs: number;
  spot: number | null;
  spotPrev: number | null;
  sigma: number | null;
  stopSpot: (() => void) | null;
  sigmaTimer: ReturnType<typeof setInterval> | null;
}

export interface AssetStats {
  spot: number | null;
  spotPrev: number | null;
  sigma: number | null;
}

const assets = new Map<string, AssetEntry>();

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

async function refreshSigma(asset: string): Promise<void> {
  try {
    const candles = await fetchCandles(asset, "1m", SIGMA_CANDLES);
    const entry = assets.get(asset);
    if (!entry) return;
    const sigma = stdevOfLogReturns(candles.map((candle) => candle.close));
    if (sigma != null) entry.sigma = sigma;
  } catch {
    return;
  }
}

export function acquireAsset(asset: string): () => void {
  const key = normalizeAsset(asset);
  if (!key) return () => {};
  let entry = assets.get(key);
  if (!entry) {
    entry = { refs: 0, spot: null, spotPrev: null, sigma: null, stopSpot: null, sigmaTimer: null };
    assets.set(key, entry);
    entry.stopSpot = watchSpot(key, (tick) => {
      const current = assets.get(key);
      if (!current || !Number.isFinite(tick.price) || tick.price <= 0) return;
      current.spotPrev = current.spot;
      current.spot = tick.price;
    });
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

export function getAssetStats(asset: string): AssetStats {
  const entry = assets.get(normalizeAsset(asset));
  return { spot: entry?.spot ?? null, spotPrev: entry?.spotPrev ?? null, sigma: entry?.sigma ?? null };
}

const openPrices = new Map<string, number>();
const openPending = new Set<string>();
const openRetryAt = new Map<string, number>();

export function intervalSpanMs(interval: string): number | null {
  const match = /^(\d+)\s*([mhd])$/i.exec(interval.trim());
  if (!match) return null;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return null;
  const unit = match[2].toLowerCase();
  const scale = unit === "m" ? 60000 : unit === "h" ? 3600000 : 86400000;
  return count * scale;
}

export function windowStartFor(row: LiveMarketRow): number | null {
  if (row.tradingStart != null) {
    const raw = Number(row.tradingStart);
    if (Number.isFinite(raw) && raw > 0) return raw < 1e12 ? raw * 1000 : raw;
  }
  const span = intervalSpanMs(row.interval);
  if (span == null || !Number.isFinite(row.expiry)) return null;
  const start = row.expiry - span;
  return start > 0 ? start : null;
}

function openKey(asset: string, start: number): string {
  return `${asset}:${start}`;
}

function pruneOpenCache(): void {
  const cutoff = Date.now() - OPEN_CACHE_TTL_MS;
  for (const key of [...openPrices.keys()]) {
    const start = Number(key.slice(key.indexOf(":") + 1));
    if (Number.isFinite(start) && start < cutoff) openPrices.delete(key);
  }
}

async function resolveOpenPrice(asset: string, start: number, span: number): Promise<void> {
  const key = openKey(asset, start);
  if (openPending.has(key)) return;
  const retryAt = openRetryAt.get(key);
  if (retryAt != null && Date.now() < retryAt) return;
  openPending.add(key);
  try {
    const tf: Timeframe = span >= OPEN_DAILY_SPAN_MS ? "1d" : "1m";
    const candles = await fetchCandles(asset, tf, tf === "1d" ? 10 : 400);
    const bucket = bucketStartFor(tf, Math.floor(start / 1000));
    const hit = candles.find((candle) => candle.time === bucket);
    if (hit && hit.open > 0) {
      openPrices.set(key, hit.open);
      openRetryAt.delete(key);
      pruneOpenCache();
      return;
    }
    openRetryAt.set(key, Date.now() + OPEN_RETRY_MS);
  } catch {
    openRetryAt.set(key, Date.now() + OPEN_RETRY_MS);
  } finally {
    openPending.delete(key);
  }
}

export function openStrikeFor(row: LiveMarketRow): number | null {
  const asset = normalizeAsset(row.asset);
  const start = windowStartFor(row);
  if (!asset || start == null) return null;
  const cached = openPrices.get(openKey(asset, start));
  if (cached != null) return cached;
  const span = intervalSpanMs(row.interval) ?? row.expiry - start;
  void resolveOpenPrice(asset, start, span);
  return null;
}

export function strikeUsd(row: LiveMarketRow): number | null {
  if (row.kind !== "ladder") return null;
  if (row.strike != null) {
    const raw = Number(row.strike);
    if (Number.isFinite(raw) && raw > 0) return raw / 100;
  }
  const labelled = Number(String(row.strikeLabel ?? "").replaceAll(",", ""));
  return Number.isFinite(labelled) && labelled > 0 ? labelled : null;
}

export function contextStrike(row: LiveMarketRow): number | null {
  return row.kind === "open" ? openStrikeFor(row) : strikeUsd(row);
}

export function buildMarketContext(row: LiveMarketRow): MarketContext {
  const stats = getAssetStats(row.asset);
  return {
    asset: row.asset,
    strike: contextStrike(row),
    expiry: row.expiry,
    spot: stats.spot,
    spotPrev: stats.spotPrev,
    sigma: stats.sigma,
  };
}
