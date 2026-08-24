"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowClockwise,
  ArrowUpRight,
  Binoculars,
  Broadcast,
  ChartLineUp,
  CircleNotch,
  ClockCountdown,
  Minus,
  Newspaper,
  Radio,
  TrendDown,
  TrendUp,
  WarningCircle,
} from "@phosphor-icons/react";
import AppChrome from "@/components/AppChrome";
import { useNow } from "@/lib/use-now";

interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  sentiment: "up" | "down" | "flat";
}

interface WhalePrint {
  asset: string;
  price: number;
  notional: number;
  side: "buy" | "sell";
  ts: number;
}

interface PmMarket {
  question: string;
  prices: number[];
  volume24hr: number;
  endDate: string;
  slug: string;
}

type LoadState = "loading" | "ready" | "error";
type StreamState = "connecting" | "live" | "reconnecting";

const fmtCompact = (n: number) => Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function age(ts: number, now: number) {
  const minutes = Math.max(0, Math.round((now - ts) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function Panel({ title, note, icon, children, className = "" }: { title: string; note: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`surface-shell min-w-0 ${className}`}>
      <div className="surface-frame min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-brand" aria-hidden="true">{icon}</span>
            <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-text-1">{title}</h2>
          </div>
          <span className="shrink-0 text-[10px] text-text-3">{note}</span>
        </div>
        {children}
      </div>
    </section>
  );
}

function SentimentIcon({ sentiment }: { sentiment: NewsItem["sentiment"] }) {
  if (sentiment === "up") return <TrendUp aria-label="Positive sentiment" size={14} className="text-buy" />;
  if (sentiment === "down") return <TrendDown aria-label="Negative sentiment" size={14} className="text-sell" />;
  return <Minus aria-label="Neutral sentiment" size={14} className="text-text-3" />;
}

function FeedState({ state, emptyTitle, emptyBody, onRetry }: { state: LoadState; emptyTitle: string; emptyBody: string; onRetry: () => void }) {
  if (state === "loading") {
    return <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 text-center" role="status" aria-live="polite"><CircleNotch className="animate-spin text-brand" aria-hidden="true" size={20} /><p className="text-xs text-text-2">Loading feed</p></div>;
  }
  if (state === "error") {
    return <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-4 text-center" role="alert"><WarningCircle className="text-sell" aria-hidden="true" size={22} /><div><p className="text-xs font-semibold text-text-1">Feed unavailable</p><p className="pt-1 text-[11px] text-text-2">The source did not respond. Try again when the connection is ready.</p></div><button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong px-3 text-[11px] font-semibold text-text-1 transition-colors hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 md:min-h-9"><ArrowClockwise aria-hidden="true" size={14} />Retry</button></div>;
  }
  return <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 text-center" role="status"><Binoculars className="text-text-3" aria-hidden="true" size={22} /><p className="text-xs font-semibold text-text-1">{emptyTitle}</p><p className="max-w-xs text-[11px] leading-5 text-text-2">{emptyBody}</p><button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong px-3 text-[11px] font-semibold text-text-1 transition-colors hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 md:min-h-9"><ArrowClockwise aria-hidden="true" size={14} />Refresh</button></div>;
}

function StreamBadge({ state }: { state: StreamState }) {
  const live = state === "live";
  return <span className="inline-flex items-center gap-1.5 text-[10px] text-text-2"><span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-buy" : "bg-brand"}`} />{live ? "Live stream" : state === "connecting" ? "Connecting" : "Reconnecting"}</span>;
}

export default function IntelHub() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsState, setNewsState] = useState<LoadState>("loading");
  const [prints, setPrints] = useState<WhalePrint[]>([]);
  const [pm, setPm] = useState<PmMarket[]>([]);
  const [pmState, setPmState] = useState<LoadState>("loading");
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const now = useNow();

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

  useEffect(() => {
    let ws: WebSocket | null = null;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      if (!alive) return;
      ws = new WebSocket("wss://stream.binance.com:9443/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade");
      ws.onopen = () => setStreamState("live");
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { data?: { s?: string; p?: string; q?: string; m?: boolean } };
          const d = msg.data;
          if (!d?.s || !d.p || !d.q) return;
          const asset = d.s.replace("USDT", "");
          const price = Number(d.p);
          const qty = Number(d.q);
          const notional = price * qty;
          const min = asset === "BTC" ? 50000 : 25000;
          if (notional < min) return;
          setPrints((prev) => [{ asset, price, notional, side: d.m ? ("sell" as const) : ("buy" as const), ts: Date.now() }, ...prev].slice(0, 12));
        } catch {}
      };
      ws.onerror = () => setStreamState("reconnecting");
      ws.onclose = () => {
        if (alive) {
          setStreamState("reconnecting");
          retry = setTimeout(connect, 3000);
        }
      };
    };
    const kick = setTimeout(connect, 0);
    return () => {
      alive = false;
      clearTimeout(kick);
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return (
    <div className="min-h-dvh min-w-0 overflow-x-hidden bg-canvas pb-24 md:pb-0">
      <AppChrome current="intel" />
      <main className="mx-auto min-w-0 max-w-[1440px] space-y-5 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <header className="flex min-w-0 flex-col justify-between gap-5 border-b border-line pb-6 md:flex-row md:items-end">
          <div className="min-w-0">
            <p className="section-kicker">Context feeds</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.045em] text-text-1 sm:text-5xl">Intel Hub</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-2">Read external context beside the live book: market news, large prints, and cross-venue probabilities.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2"><Broadcast aria-hidden="true" size={15} className="text-brand" /><StreamBadge state={streamState} /></div>
        </header>

        <div className="grid min-w-0 gap-4 lg:grid-cols-12">
          <Panel title="News" note="CoinDesk or CryptoPanic | 60s" icon={<Newspaper size={16} />} className="lg:col-span-7">
            {newsState !== "ready" || !news.length ? <FeedState state={newsState} emptyTitle="No market news" emptyBody="The feed returned no BTC or ETH headlines right now." onRetry={loadNews} /> : <div className="divide-y divide-line">
              {news.map((item) => <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" className="flex min-h-16 min-w-0 items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-[-2px] sm:px-5"><span className="mt-0.5 shrink-0" aria-hidden="true"><SentimentIcon sentiment={item.sentiment} /></span><span className="min-w-0 flex-1"><span className="line-clamp-2 text-xs leading-5 text-text-1">{item.title}</span><span className="num flex flex-wrap gap-x-2 pt-1 text-[10px] text-text-3"><span>{item.source}</span><span>{age(item.publishedAt, now)}</span></span></span><ArrowUpRight aria-hidden="true" size={14} className="mt-0.5 shrink-0 text-text-3" /></a>)}
            </div>}
          </Panel>

          <Panel title="Whale radar" note="Binance aggTrades" icon={<Radio size={16} />} className="lg:col-span-5">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 sm:px-5"><span className="text-[10px] text-text-3">Large off-chain prints</span><StreamBadge state={streamState} /></div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[430px] text-left text-xs" aria-label="Large Binance prints"><thead><tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-text-3"><th scope="col" className="px-5 py-3 font-medium">Asset</th><th scope="col" className="px-3 py-3 text-right font-medium">Price</th><th scope="col" className="px-3 py-3 text-right font-medium">Notional</th><th scope="col" className="px-5 py-3 text-right font-medium">Side</th></tr></thead><tbody>{prints.map((print, index) => <tr key={`${print.ts}-${index}`} className="h-11 border-b border-line transition-colors hover:bg-surface-1"><td className="num px-5 py-2 font-semibold text-brand">{print.asset}</td><td className="num px-3 py-2 text-right text-text-1">{fmtCompact(print.price)}</td><td className="num px-3 py-2 text-right text-text-2">${fmtCompact(print.notional)}</td><td className={`num px-5 py-2 text-right ${print.side === "buy" ? "text-buy" : "text-sell"}`}>{print.side}</td></tr>)}</tbody></table>{!prints.length && <p className="px-5 py-8 text-center text-xs text-text-3" role="status">Listening for large prints</p>}</div>
            <div className="divide-y divide-line md:hidden">{prints.length ? prints.map((print, index) => <article key={`${print.ts}-${index}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3"><div><p className="num text-xs font-semibold text-brand">{print.asset}</p><p className="num pt-1 text-[10px] text-text-3">{fmtCompact(print.price)} | ${fmtCompact(print.notional)}</p></div><span className={`num text-xs font-semibold ${print.side === "buy" ? "text-buy" : "text-sell"}`}>{print.side}</span></article>) : <p className="px-4 py-8 text-center text-xs text-text-3" role="status">Listening for large prints</p>}</div>
            <p className="border-t border-line px-4 py-3 text-[10px] leading-5 text-text-3 sm:px-5">Thresholds: BTC above $50k notional, ETH above $25k. This is Binance context, not Somnia on-chain data.</p>
          </Panel>

          <Panel title="Cross-venue sentiment" note="Polymarket | 30s" icon={<ChartLineUp size={16} />} className="lg:col-span-12">
            {pmState !== "ready" || !pm.length ? <FeedState state={pmState} emptyTitle="No cross-venue markets" emptyBody="Polymarket may be unreachable from this network. Results appear when the API is available." onRetry={loadPolymarket} /> : <div className="grid min-w-0 divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">{pm.map((market) => <article key={market.slug} className="min-w-0 px-4 py-4 sm:px-5"><div className="flex items-start justify-between gap-3"><span className="text-[10px] uppercase tracking-[0.14em] text-text-3">BTC or ETH market</span><ClockCountdown aria-hidden="true" size={15} className="shrink-0 text-text-3" /></div><h3 className="mt-2 line-clamp-3 text-xs leading-5 text-text-1">{market.question}</h3><div className="mt-4 flex items-end justify-between gap-3"><span className="num text-xl font-semibold text-brand">{market.prices[0] != null ? `${(market.prices[0] * 100).toFixed(1)}%` : "Unavailable"}</span><span className="num text-right text-[10px] leading-4 text-text-3">${fmtCompact(market.volume24hr)} volume<br />{market.endDate ? `Ends ${market.endDate.slice(0, 10)}` : "End date unavailable"}</span></div></article>)}</div>}
          </Panel>
        </div>
      </main>
    </div>
  );
}
