"use client";

import { useEffect, useRef, useState } from "react";
import { Broadcast, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import {
  aggregateSpotFlow,
  isSpotFlowCoverage,
  mergeSpotFlowTrades,
  SPOT_FLOW_WINDOWS,
  type SpotFlowBackfillResponse,
  watchSpotAggTrades,
  type SpotAggTrade,
  type SpotAsset,
  type SpotFlowCoverage,
  type SpotFlowMetrics,
  type SpotFlowRead,
  type SpotFlowStatus,
  type SpotFlowWindowId,
} from "@/lib/spot-flow";

const fmtUsd = (value: number) =>
  `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: value >= 1_000_000 ? 1 : 2 }).format(value)}`;

const fmtBase = (value: number, asset: SpotAsset) =>
  `${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: value >= 1 ? 3 : 6 }).format(value)} ${asset}`;

const fmtPrice = (value: number | null) =>
  value == null ? "Unavailable" : `$${Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}`;

const fmtSignedUsd = (value: number) => value === 0 ? "$0" : `${value > 0 ? "+" : "-"}${fmtUsd(Math.abs(value))}`;

const fmtSignedPct = (value: number | null) => value == null ? "Unavailable" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

const fmtShare = (value: number | null) => value == null ? "Unavailable" : `${(value * 100).toFixed(1)}%`;

const fmtRangePct = (value: number | null) => value == null ? "Unavailable" : `${value.toFixed(2)}%`;

const FLOW_READ_LABELS: Record<SpotFlowRead, string> = {
  "buyers lifting": "Buyers lifting",
  "sellers pressing": "Sellers pressing",
  "buy flow absorbed": "Buy flow absorbed",
  "sell flow absorbed": "Sell flow absorbed",
  "balanced/mixed": "Balanced / mixed",
};

function flowReadTone(flowRead: SpotFlowRead | null) {
  if (flowRead === "buyers lifting") return "text-up";
  if (flowRead === "sellers pressing") return "text-down";
  if (flowRead === "buy flow absorbed" || flowRead === "sell flow absorbed") return "text-amber";
  return "text-foreground";
}

function initialMetrics(asset: SpotAsset): SpotFlowMetrics {
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
    windowStart: 0,
  };
}

function statusCopy(status: SpotFlowStatus) {
  if (status === "live") return "Live stream";
  if (status === "reconnecting") return "Reconnecting";
  if (status === "error") return "Unavailable";
  return "Connecting";
}

function statusIcon(status: SpotFlowStatus) {
  if (status === "error") return <WarningCircle size={14} aria-hidden="true" />;
  if (status === "connecting") return <CircleNotch size={14} aria-hidden="true" />;
  return <Broadcast size={14} aria-hidden="true" />;
}

type HistoryStatus = "loading" | "ready" | "partial" | "error";

function isSpotAggTrade(value: unknown): value is SpotAggTrade {
  if (typeof value !== "object" || value === null) return false;
  const trade = value as Record<string, unknown>;
  return typeof trade.id === "string"
    && (trade.asset === "BTC" || trade.asset === "ETH")
    && typeof trade.price === "number"
    && Number.isFinite(trade.price)
    && typeof trade.quantity === "number"
    && Number.isFinite(trade.quantity)
    && typeof trade.notional === "number"
    && Number.isFinite(trade.notional)
    && (trade.side === "buy" || trade.side === "sell")
    && typeof trade.ts === "number"
    && Number.isFinite(trade.ts);
}

function isBackfillResponse(value: unknown): value is SpotFlowBackfillResponse {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  const coverage = payload.coverage;
  if (typeof coverage !== "object" || coverage === null) return false;
  for (const [asset, value] of Object.entries(coverage)) {
    if ((asset !== "BTC" && asset !== "ETH") || !isSpotFlowCoverage(value)) return false;
  }
  return payload.source === "Binance spot"
    && typeof payload.fetchedAt === "number"
    && typeof payload.rangeStart === "number"
    && typeof payload.rangeEnd === "number"
    && Array.isArray(payload.trades)
    && payload.trades.every(isSpotAggTrade)
    && typeof payload.errors === "object"
    && payload.errors !== null
    && Array.isArray(payload.truncatedAssets)
    && typeof payload.coverage === "object"
    && payload.coverage !== null;
}

function mergeTrades(
  store: Map<string, SpotAggTrade>,
  incoming: readonly SpotAggTrade[],
  now: number,
  coverage?: Partial<Record<SpotAsset, SpotFlowCoverage>>,
) {
  const merged = mergeSpotFlowTrades(Array.from(store.values()), incoming, now, coverage);
  store.clear();
  for (const trade of merged) store.set(trade.id, trade);
}

function MetricTile({
  label,
  quantity,
  notional,
  asset,
  side,
}: {
  label: string;
  quantity: number;
  notional: number;
  asset: SpotAsset;
  side: "buy" | "sell";
}) {
  return (
    <div className="rounded-md border border-hairline bg-background/50 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
        <span>{label}</span>
        <span className={`h-1.5 w-1.5 rounded-full ${side === "buy" ? "bg-up" : "bg-down"}`} aria-hidden="true" />
      </div>
      <div className={`num mt-1 text-sm font-semibold ${side === "buy" ? "text-up" : "text-down"}`}>
        {fmtBase(quantity, asset)}
      </div>
      <div className="num mt-0.5 text-[10px] text-muted">{fmtUsd(notional)}</div>
    </div>
  );
}

function MetricSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-background/40 px-2.5 py-2">
      <div className="text-[10px] text-muted">{label}</div>
      <div className="num mt-1 text-[11px] font-medium text-foreground">{value}</div>
    </div>
  );
}

function FlowStat({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-hairline/70 py-1.5 last:border-b-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`num text-right text-[11px] ${tone}`}>{value}</dd>
    </div>
  );
}

export default function SpotFlowPanel({ asset }: { asset: SpotAsset }) {
  const [windowId, setWindowId] = useState<SpotFlowWindowId>("1m");
  const [status, setStatus] = useState<SpotFlowStatus>("connecting");
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("loading");
  const [historyCoverage, setHistoryCoverage] = useState<Partial<Record<SpotAsset, SpotFlowCoverage>>>({});
  const [metrics, setMetrics] = useState<SpotFlowMetrics>(() => initialMetrics(asset));
  const tradesRef = useRef<Map<string, SpotAggTrade>>(new Map());
  const coverageRef = useRef<Partial<Record<SpotAsset, SpotFlowCoverage>>>({});
  const selectedWindow = SPOT_FLOW_WINDOWS.find((window) => window.id === windowId) ?? SPOT_FLOW_WINDOWS[1];

  useEffect(() => watchSpotAggTrades({
    onStatus: setStatus,
    onTrade: (trade) => {
      const trades = tradesRef.current;
      mergeTrades(trades, [trade], Date.now(), coverageRef.current);
    },
  }), []);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/spot-flow?assets=BTC,ETH", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Spot history returned HTTP ${response.status}.`);
        const payload: unknown = await response.json();
        if (!alive) return;
        if (!isBackfillResponse(payload)) throw new Error("Spot history returned an invalid payload.");
        coverageRef.current = payload.coverage;
        mergeTrades(tradesRef.current, payload.trades, Date.now(), coverageRef.current);
        setHistoryCoverage(payload.coverage);
        const hasErrors = Object.keys(payload.errors).length > 0;
        const hasTruncation = payload.truncatedAssets.length > 0;
        setHistoryStatus(hasErrors ? "error" : hasTruncation ? "partial" : "ready");
      } catch (error) {
        if (!alive || (error instanceof Error && error.name === "AbortError")) return;
        setHistoryStatus("error");
      }
    };
    const kick = setTimeout(() => {
      void load();
    }, 0);
    return () => {
      alive = false;
      clearTimeout(kick);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (!alive) return;
      setMetrics(aggregateSpotFlow(
        Array.from(tradesRef.current.values()),
        Date.now(),
        selectedWindow.durationMs,
        asset,
      ));
    };
    const kick = setTimeout(refresh, 0);
    const interval = setInterval(refresh, 1_000);
    return () => {
      alive = false;
      clearTimeout(kick);
      clearInterval(interval);
    };
  }, [asset, selectedWindow.durationMs]);

  const buyShare = metrics.buyShare ?? 0;
  const sellShare = metrics.sellShare ?? 0;
  const hasData = metrics.tradeCount > 0;
  const deltaTone = metrics.deltaNotional > 0 ? "text-up" : metrics.deltaNotional < 0 ? "text-down" : "text-foreground";
  const priceTone = metrics.priceChangePct != null && metrics.priceChangePct > 0
    ? "text-up"
    : metrics.priceChangePct != null && metrics.priceChangePct < 0
      ? "text-down"
      : "text-foreground";
  const titleId = `spot-flow-title-${asset.toLowerCase()}`;
  const coverage = historyCoverage[asset];

  return (
    <section aria-labelledby={titleId} className="h-full min-w-0 rounded-xl border border-hairline bg-panel p-1.5">
      <div className="flex h-full min-h-[360px] min-w-0 flex-col rounded-lg bg-panel-raised shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
        <header className="border-b border-hairline px-3 pb-2.5 pt-2.5">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">Spot flow / {asset}</h2>
            <span className={`inline-flex shrink-0 items-center gap-1.5 text-[10px] ${status === "live" ? "text-up" : status === "error" ? "text-down" : "text-muted"}`}>
              {statusIcon(status)}
              {statusCopy(status)}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-muted">
            <span className="text-amber">Binance spot</span>
            <span> · 5m history + live aggTrades</span>
            {coverage && <span> · {coverage.buckets}/{coverage.expectedBuckets}s loaded</span>}
          </p>
        </header>

        <div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-2">
          <span className="text-[10px] text-muted">Rolling window</span>
          <div className="flex gap-1 rounded-md border border-hairline bg-background p-0.5" role="group" aria-label="Spot flow rolling window">
            {SPOT_FLOW_WINDOWS.map((window) => (
              <button
                key={window.id}
                type="button"
                aria-pressed={window.id === windowId}
                onClick={() => setWindowId(window.id)}
                className={`num min-h-9 min-w-11 rounded px-2 text-[10px] ease-terminal transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 md:min-h-8 ${window.id === windowId ? "bg-amber/15 text-amber" : "text-muted hover:bg-white/[0.04] hover:text-foreground"}`}
              >
                {window.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 px-3 py-3">
          <div className="grid grid-cols-2 gap-2" aria-label={`${asset} aggressive trade volume`}>
            <MetricTile label="Buy volume" quantity={metrics.buyQuantity} notional={metrics.buyNotional} asset={asset} side="buy" />
            <MetricTile label="Sell volume" quantity={metrics.sellQuantity} notional={metrics.sellNotional} asset={asset} side="sell" />
          </div>

          <div className="mt-3" aria-label={`${asset} buy and sell share`}>
            <div className="flex items-center justify-between text-[10px]">
              <span className="num text-up">Buy {fmtShare(metrics.buyShare)}</span>
              <span className="num text-down">Sell {fmtShare(metrics.sellShare)}</span>
            </div>
            <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/[0.04]" aria-hidden="true">
              <div className="h-full bg-up" style={{ width: `${buyShare * 100}%` }} />
              <div className="h-full flex-1 bg-down/70" style={{ width: `${sellShare * 100}%` }} />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2" aria-label={`${asset} quote flow metrics`}>
            <MetricSummary label="Gross quote volume" value={hasData ? fmtUsd(metrics.grossQuoteVolume) : "Unavailable"} />
            <MetricSummary label="Average trade" value={hasData ? fmtUsd(metrics.averageTradeNotional ?? 0) : "Unavailable"} />
            <MetricSummary label="Quote pace / sec" value={hasData ? `${fmtUsd(metrics.quoteVolumePerSecond)}/s` : "Unavailable"} />
            <MetricSummary label="High-low range" value={hasData ? fmtRangePct(metrics.highLowRangePct) : "Unavailable"} />
          </div>

          <dl className="mt-3 border-t border-hairline pt-1">
            <FlowStat label="Net aggressive delta" value={hasData ? fmtSignedUsd(metrics.deltaNotional) : "Unavailable"} tone={hasData ? deltaTone : "text-muted"} />
            <FlowStat label="Price response" value={hasData ? fmtSignedPct(metrics.priceChangePct) : "Unavailable"} tone={hasData ? priceTone : "text-muted"} />
            <FlowStat label="Last print" value={fmtPrice(metrics.lastPrice)} />
            <FlowStat label="Trades" value={hasData ? Intl.NumberFormat("en-US").format(metrics.tradeCount) : "Unavailable"} />
          </dl>

          <div className="mt-3 rounded-md border border-hairline bg-background/40 px-2.5 py-2" aria-label={`${asset} flow read`}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-muted">Flow read</span>
              <span className={`text-right text-[11px] font-medium ${hasData ? flowReadTone(metrics.flowRead) : "text-muted"}`}>
                {hasData && metrics.flowRead ? FLOW_READ_LABELS[metrics.flowRead] : "Unavailable"}
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted">Aggressive delta versus price response.</p>
          </div>

          {!hasData && (
            <p className="mt-4 rounded-md border border-hairline bg-background/40 px-2.5 py-2 text-[10px] leading-relaxed text-muted" role="status">
              {historyStatus === "loading"
                ? "Loading the latest 5 minutes of spot prints."
                : historyStatus === "error"
                  ? "Historical spot prints are unavailable. Listening for new trades."
                  : historyStatus === "partial"
                    ? `${coverage?.buckets ?? 0}/${coverage?.expectedBuckets ?? 300} closed seconds loaded. Listening for new trades.`
                  : "Listening for BTC and ETH spot prints."}
            </p>
          )}
          {hasData && historyStatus === "partial" && (
            <p className="mt-4 rounded-md border border-amber/30 bg-amber/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-amber" role="status">
              Recent history is partially loaded; live prints continue updating this window.
            </p>
          )}
          {status === "error" && (
            <p className="mt-4 rounded-md border border-down/30 bg-down/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-down" role="alert">
              Binance live stream is unavailable in this browser. Historical spot context may still be available.
            </p>
          )}
        </div>

        <p className="border-t border-hairline px-3 py-2.5 text-[10px] leading-relaxed text-muted">
          Buy and sell volume are classified by aggressor side. This feed is read-only context, not DreamDEX execution data.
        </p>
      </div>
    </section>
  );
}
