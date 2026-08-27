"use client";

import { useEffect, useState } from "react";
import { listLiveMarkets, type LiveMarketRow } from "@/lib/dreamdex";
import { watchSpot, type SpotTick } from "@/lib/prices";
import { useNow } from "@/lib/use-now";
import { SettlementRail } from "./SettlementRail";

const usd = (n: number, digits = 0) =>
  Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);

const compact = (n: number) =>
  Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function countdown(seconds: number) {
  if (seconds <= 0) return "closed";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (v: number) => String(v).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function pickFeatured(rows: LiveMarketRow[]): LiveMarketRow | null {
  const tradable = rows.filter((row) => row.lastPrice != null && row.expiry > Date.now());
  if (!tradable.length) return null;
  return tradable.reduce((best, row) =>
    row.volumeQuote + row.tradeCount > best.volumeQuote + best.tradeCount ? row : best
  );
}

export default function HeroContract() {
  const [market, setMarket] = useState<LiveMarketRow | null>(null);
  const [spot, setSpot] = useState<SpotTick | null>(null);
  const [mounted, setMounted] = useState(false);
  const [reached, setReached] = useState(false);
  const now = useNow();

  useEffect(() => {
    const kick = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(kick);
  }, []);

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const rows = await listLiveMarkets();
        if (!alive) return;
        setReached(true);
        const featured = pickFeatured(rows);
        if (featured) setMarket(featured);
      } catch {}
    };
    const kick = setTimeout(pull, 0);
    const timer = setInterval(pull, 15000);
    return () => {
      alive = false;
      clearTimeout(kick);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const asset = market?.asset;
    if (!asset) return;
    return watchSpot(asset, (tick) => setSpot(tick));
  }, [market?.asset]);

  const probability = market?.lastPrice ?? null;
  const pct = probability == null ? null : Math.round(probability * 100);
  const secondsLeft = market ? (market.expiry - now) / 1000 : 0;

  return (
    <div className="rounded-[var(--radius-shell)] border border-line bg-surface-1 p-1.5 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
      <div className="rounded-[var(--radius-panel)] bg-surface-2">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-buy opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-buy" />
            </span>
            <span className="num text-[10px] font-semibold uppercase tracking-[0.18em] text-text-2">
              Live on Somnia
            </span>
          </div>
          <span className="num text-[10px] uppercase tracking-[0.16em] text-text-3">
            {market ? `${market.asset} · ${market.windowLabel || market.interval}` : "—"}
          </span>
        </div>

        <div className="px-5 py-6 sm:px-7 sm:py-8">
          <p className="min-h-[3.5rem] max-w-[36ch] text-balance font-headline text-lg font-semibold leading-snug tracking-[-0.02em] text-text-1 sm:text-xl">
            {market ? market.question : reached ? "No window is open right now." : "Reading the Somnia order book…"}
          </p>

          <div className="mt-7 flex items-end justify-between gap-6">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="num text-[clamp(3.6rem,9vw,5.6rem)] font-bold leading-none tracking-[-0.05em] text-eye tabular-nums"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {pct == null ? "––" : pct}
                </span>
                <span className="num pb-2 text-2xl font-semibold text-text-3">%</span>
              </div>
              <p className="num mt-2 text-[11px] uppercase tracking-[0.18em] text-text-2">
                market-implied chance of yes
              </p>
            </div>
            {spot ? (
              <div className="hidden shrink-0 text-right sm:block">
                <p className="num text-[10px] uppercase tracking-[0.18em] text-text-3">{spot.asset} spot</p>
                <p className="num mt-1.5 text-xl font-semibold text-text-1">
                  ${usd(spot.price, spot.price < 100 ? 2 : 0)}
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-7">
            <SettlementRail probability={probability ?? 0.5} />
          </div>
        </div>

        <dl className="grid grid-cols-3 border-t border-line">
          <div className="border-r border-line px-5 py-4">
            <dt className="num text-[10px] uppercase tracking-[0.16em] text-text-3">Closes in</dt>
            <dd className="num mt-1.5 text-sm font-semibold text-text-1">
              {mounted && market ? countdown(secondsLeft) : "––:––"}
            </dd>
          </div>
          <div className="border-r border-line px-5 py-4">
            <dt className="num text-[10px] uppercase tracking-[0.16em] text-text-3">Volume</dt>
            <dd className="num mt-1.5 text-sm font-semibold text-text-1">
              {market ? `$${compact(market.volumeQuote)}` : "—"}
            </dd>
          </div>
          <div className="px-5 py-4">
            <dt className="num text-[10px] uppercase tracking-[0.16em] text-text-3">Trades</dt>
            <dd className="num mt-1.5 text-sm font-semibold text-text-1">
              {market ? compact(market.tradeCount) : "—"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
