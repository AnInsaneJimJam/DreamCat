"use client";

import { Pause, Play } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { listLiveMarkets, type LiveMarketRow } from "@/lib/dreamdex";
import { watchSpot, type SpotTick } from "@/lib/prices";

const fmtUsd = (n: number) =>
  Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: n >= 100000 ? 1 : 2,
  }).format(n);

type TickerItem = {
  key: string;
  value: string;
  up: boolean;
};

export default function LandingTicker() {
  const [spots, setSpots] = useState<Record<string, SpotTick>>({});
  const [markets, setMarkets] = useState<LiveMarketRow[]>([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const stops = (["BTC", "ETH"] as const).map((asset) =>
      watchSpot(asset, (tick) => setSpots((previous) => ({ ...previous, [asset]: tick })))
    );
    return () => stops.forEach((stop) => stop());
  }, []);

  useEffect(() => {
    const pull = async () => {
      try {
        setMarkets(await listLiveMarkets());
      } catch {}
    };
    const kick = setTimeout(pull, 0);
    const timer = setInterval(pull, 15000);
    return () => {
      clearTimeout(kick);
      clearInterval(timer);
    };
  }, []);

  const items: TickerItem[] = [];
  for (const asset of ["BTC", "ETH"] as const) {
    const tick = spots[asset];
    if (tick) items.push({ key: `${asset}/USD`, value: `$${fmtUsd(tick.price)}`, up: true });
  }
  for (const market of markets.slice(0, 6)) {
    if (market.lastPrice == null) continue;
    const level = market.kind === "ladder" ? `at ${market.strikeLabel}` : "from open";
    items.push({
      key: `${market.asset} ${level} ${market.windowLabel || market.interval}`,
      value: `${(market.lastPrice * 100).toFixed(0)}%`,
      up: market.lastPrice >= 0.5,
    });
  }

  const strip = [...items, ...items];

  return (
    <section className="ticker-viewport" aria-label="Live market feed">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-buy" aria-hidden="true" />
          <span className="num text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Live feed</span>
          <span className="hidden text-xs text-text-3 sm:inline">Somnia Shannon</span>
        </div>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
          className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-3 text-[11px] font-medium text-text-2 transition-colors duration-150 hover:border-line-strong hover:text-text-1"
        >
          {paused ? <Play aria-hidden="true" size={13} weight="fill" /> : <Pause aria-hidden="true" size={13} weight="fill" />}
          <span>{paused ? "Resume tape" : "Pause tape"}</span>
        </button>
      </div>
      {items.length ? (
        <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
          <div className="ticker-track gap-8 px-4 pb-3" data-paused={paused}>
            {strip.map((item, index) => (
              <span key={`${item.key}-${index}`} className="flex shrink-0 items-baseline gap-2 text-xs">
                <span className="num text-text-2">{item.key}</span>
                <span className="num font-semibold text-text-1">{item.value}</span>
                <span className={`num ${item.up ? "text-buy" : "text-sell"}`}>live</span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="px-4 pb-3 text-xs text-text-2">Connecting to the Somnia feed</p>
      )}
      <ul className="sr-only" aria-label="Current market feed">
        {items.map((item) => (
          <li key={item.key}>
            {item.key}: {item.value}
          </li>
        ))}
      </ul>
    </section>
  );
}
