"use client";

import {
  ArrowClockwise,
  ArrowUpRight,
  CircleNotch,
  TrendDown,
  TrendUp,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import AppChrome from "@/components/AppChrome";
import { useNow } from "@/lib/use-now";
import {
  acquireWhaleTape,
  getWhaleTapeServerState,
  getWhaleTapeState,
  subscribeWhaleTape,
} from "@/lib/whale-tape";

interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  sentiment: "up" | "down" | "flat";
}

interface PmMarket {
  question: string;
  prices: number[];
  volume24hr: number;
  endDate: string;
  slug: string;
}

type LoadState = "loading" | "ready" | "error";

const fmtCompact = (n: number) =>
  Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function age(ts: number, now: number) {
  const minutes = Math.max(0, Math.round((now - ts) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function clockOf(ts: number, mounted: boolean) {
  if (!mounted) return "--:--";
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function Drift({ sentiment }: { sentiment: NewsItem["sentiment"] }) {
  if (sentiment === "up") {
    return (
      <span className="inline-flex items-center gap-1 text-buy">
        <TrendUp aria-hidden="true" size={12} weight="bold" />
        <span className="num text-[10px] uppercase tracking-[0.14em]">Bullish</span>
      </span>
    );
  }
  if (sentiment === "down") {
    return (
      <span className="inline-flex items-center gap-1 text-sell">
        <TrendDown aria-hidden="true" size={12} weight="bold" />
        <span className="num text-[10px] uppercase tracking-[0.14em]">Bearish</span>
      </span>
    );
  }
  return <span className="num text-[10px] uppercase tracking-[0.14em] text-text-3">Neutral</span>;
}

export default function IntelHub() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsState, setNewsState] = useState<LoadState>("loading");
  const [pm, setPm] = useState<PmMarket[]>([]);
  const [pmState, setPmState] = useState<LoadState>("loading");
  const tape = useSyncExternalStore(subscribeWhaleTape, getWhaleTapeState, getWhaleTapeServerState);
  const { prints, streamState, seen } = tape;
  const [mounted, setMounted] = useState(false);
  const now = useNow();

  useEffect(() => {
    const kick = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(kick);
  }, []);

  const loadNews = useCallback(async () => {
    try {
      const res = await fetch("/api/news", { cache: "no-store" });
      if (!res.ok) throw new Error("News request failed");
      const json = (await res.json()) as { items?: NewsItem[] };
      if (!Array.isArray(json.items)) throw new Error("News response was invalid");
      setNews(json.items);
      setNewsState("ready");
    } catch {
      setNewsState("error");
    }
  }, []);

  const loadPolymarket = useCallback(async () => {
    try {
      const res = await fetch("/api/polymarket", { cache: "no-store" });
      if (!res.ok) throw new Error("Polymarket request failed");
      const json = (await res.json()) as { markets?: PmMarket[] };
      if (!Array.isArray(json.markets)) throw new Error("Polymarket response was invalid");
      setPm(json.markets);
      setPmState("ready");
    } catch {
      setPmState("error");
    }
  }, []);

  useEffect(() => {
    const kick = setTimeout(loadNews, 0);
    const refresh = setInterval(loadNews, 60000);
    return () => {
      clearTimeout(kick);
      clearInterval(refresh);
    };
  }, [loadNews]);

  useEffect(() => {
    const kick = setTimeout(loadPolymarket, 0);
    const refresh = setInterval(loadPolymarket, 30000);
    return () => {
      clearTimeout(kick);
      clearInterval(refresh);
    };
  }, [loadPolymarket]);

  useEffect(() => acquireWhaleTape(), []);

  const [lead, ...rest] = news;
  const secondary = rest.slice(0, 4);
  const wire = rest.slice(4);
  const bullish = news.filter((n) => n.sentiment === "up").length;
  const bearish = news.filter((n) => n.sentiment === "down").length;

  return (
    <div className="min-h-dvh min-w-0 overflow-x-hidden bg-canvas pb-24 md:pb-0">
      <AppChrome current="intel" />

      <div className="mx-auto min-w-0 max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b-2 border-text-1 py-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-headline text-4xl font-bold leading-none tracking-[-0.045em] text-text-1 sm:text-5xl">
              The Intel Desk
            </h1>
            <p className="mt-2.5 max-w-xl text-sm leading-6 text-text-2">
              What moved BTC and ETH today, and the prints behind it.
            </p>
          </div>
          <dl className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <dt className="num text-[10px] uppercase tracking-[0.16em] text-text-3">Tone</dt>
              <dd className="num mt-1 text-xs font-semibold">
                <span className="text-buy">{bullish} bull</span>
                <span className="px-1.5 text-text-3">/</span>
                <span className="text-sell">{bearish} bear</span>
              </dd>
            </div>
            <div>
              <dt className="num text-[10px] uppercase tracking-[0.16em] text-text-3">Tape</dt>
              <dd className="num mt-1 flex items-center gap-1.5 text-xs font-semibold text-text-1">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${streamState === "live" ? "bg-buy" : "bg-brand"}`}
                />
                {streamState === "live" ? "Live" : streamState === "connecting" ? "Connecting" : "Reconnecting"}
              </dd>
            </div>
          </dl>
        </header>

        {newsState === "loading" ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3" role="status">
            <CircleNotch aria-hidden="true" className="animate-spin text-brand" size={22} />
            <p className="text-xs text-text-2">Pulling the wire</p>
          </div>
        ) : newsState === "error" || !news.length ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center" role="alert">
            <WarningCircle aria-hidden="true" className="text-sell" size={24} />
            <p className="text-sm font-semibold text-text-1">The wire is quiet</p>
            <p className="max-w-sm text-xs leading-5 text-text-2">
              The news source did not respond. Headlines return as soon as it is reachable.
            </p>
            <button
              className="mt-1 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong px-4 text-xs font-semibold text-text-1 transition-colors duration-150 hover:border-brand hover:text-brand"
              onClick={loadNews}
              type="button"
            >
              <ArrowClockwise aria-hidden="true" size={14} />
              Try again
            </button>
          </div>
        ) : (
          <div className="grid min-w-0 gap-x-10 gap-y-8 py-8 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              {lead ? (
                <a
                  className="group block border-b border-line pb-7"
                  href={lead.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="num text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
                      Top story
                    </span>
                    <Drift sentiment={lead.sentiment} />
                    <span className="num text-[10px] uppercase tracking-[0.14em] text-text-3">
                      {lead.source} · {age(lead.publishedAt, now)}
                    </span>
                  </div>
                  <h2 className="mt-3 max-w-[26ch] font-headline text-[clamp(1.9rem,3.6vw,3.1rem)] font-bold leading-[1.04] tracking-[-0.035em] text-text-1 transition-colors duration-150 group-hover:text-brand">
                    {lead.title}
                  </h2>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-text-2 transition-colors duration-150 group-hover:text-brand">
                    Read on {lead.source}
                    <ArrowUpRight
                      aria-hidden="true"
                      className="transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                      size={14}
                      weight="bold"
                    />
                  </span>
                </a>
              ) : null}

              {secondary.length ? (
                <div className="grid gap-x-8 border-b border-line sm:grid-cols-2">
                  {secondary.map((item, index) => (
                    <a
                      className={`group flex min-w-0 flex-col gap-2 border-line py-5 sm:py-6 ${
                        index < secondary.length - 1 ? "border-b" : ""
                      } ${index >= secondary.length - 2 ? "sm:border-b-0" : ""} ${
                        index % 2 === 1 ? "sm:border-l sm:pl-8" : ""
                      }`}
                      href={item.url}
                      key={item.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <Drift sentiment={item.sentiment} />
                        <span className="num text-[10px] uppercase tracking-[0.14em] text-text-3">
                          {age(item.publishedAt, now)}
                        </span>
                      </div>
                      <h3 className="font-headline text-lg font-bold leading-snug tracking-[-0.025em] text-text-1 transition-colors duration-150 group-hover:text-brand">
                        {item.title}
                      </h3>
                      <span className="num mt-auto text-[10px] uppercase tracking-[0.14em] text-text-3">
                        {item.source}
                      </span>
                    </a>
                  ))}
                </div>
              ) : null}

              {wire.length ? (
                <section className="pt-7">
                  <h2 className="num pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-3">
                    On the wire
                  </h2>
                  <ol className="border-l border-line pl-5 sm:pl-6">
                    {wire.map((item) => (
                      <li key={item.url}>
                        <a
                          className="group relative flex min-w-0 flex-col gap-1 py-3.5 sm:flex-row sm:items-baseline sm:gap-5"
                          href={item.url}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <span
                            aria-hidden="true"
                            className="absolute -left-[1.55rem] top-[1.35rem] h-1 w-1 rounded-full bg-line-strong transition-colors duration-150 group-hover:bg-brand sm:-left-[1.8rem]"
                          />
                          <span className="num w-14 shrink-0 text-[11px] text-text-3">
                            {clockOf(item.publishedAt, mounted)}
                          </span>
                          <span className="min-w-0 flex-1 text-sm leading-6 text-text-1 transition-colors duration-150 group-hover:text-brand">
                            {item.title}
                          </span>
                          <span className="num shrink-0 text-[10px] uppercase tracking-[0.14em] text-text-3">
                            {item.source}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </div>

            <aside className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-4 lg:self-start lg:border-l lg:border-line lg:pl-8">
              <section className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                  <h2 className="num text-[10px] font-semibold uppercase tracking-[0.18em] text-text-1">
                    Whale prints
                  </h2>
                  <span className="num text-[10px] text-text-3">
                    {seen > 0 ? `${seen} today` : "Binance"}
                  </span>
                </div>
                {prints.length ? (
                  <ol className="divide-y divide-line">
                    {prints.map((print, index) => (
                      <li
                        className="flex items-baseline justify-between gap-3 py-2.5"
                        key={`${print.ts}-${index}`}
                      >
                        <span className="num text-xs font-semibold text-text-1">{print.asset}</span>
                        <span className="num flex-1 text-right text-[11px] text-text-2">
                          ${fmtCompact(print.notional)}
                        </span>
                        <span
                          className={`num w-9 text-right text-[11px] font-semibold ${
                            print.side === "buy" ? "text-buy" : "text-sell"
                          }`}
                        >
                          {print.side}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="py-4 text-[11px] leading-5 text-text-3" role="status">
                    Listening for prints over $50k in BTC or $25k in ETH.
                  </p>
                )}
                <p className="border-t border-line pt-2.5 text-[10px] leading-4 text-text-3">
                  Binance spot context, not Somnia on-chain flow.
                </p>
              </section>

              <section className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                  <h2 className="num text-[10px] font-semibold uppercase tracking-[0.18em] text-text-1">
                    Elsewhere
                  </h2>
                  <span className="num text-[10px] text-text-3">Polymarket</span>
                </div>
                {pmState === "ready" && pm.length ? (
                  <ol className="divide-y divide-line">
                    {pm.slice(0, 6).map((market) => (
                      <li key={market.slug}>
                        <a
                          className="group flex items-start gap-3 py-3"
                          href={`https://polymarket.com/event/${market.slug}`}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <span className="min-w-0 flex-1 text-[11px] leading-5 text-text-2 transition-colors duration-150 group-hover:text-brand">
                            {market.question}
                          </span>
                          <span className="num shrink-0 text-xs font-semibold text-text-1">
                            {market.prices[0] != null ? `${Math.round(market.prices[0] * 100)}%` : "—"}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="py-4 text-[11px] leading-5 text-text-3">
                    Cross-venue odds appear when Polymarket is reachable from this region.
                  </p>
                )}
              </section>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
