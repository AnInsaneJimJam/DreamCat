"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Chart, KLineData, OverlayCreate, Period } from "klinecharts";
import {
  ArrowCounterClockwise,
  ArrowLineUpRight,
  ArrowsOutLineHorizontal,
  Camera,
  ChartLine,
  Crosshair,
  Magnet,
  Minus,
  Trash,
  TrendUp,
} from "@phosphor-icons/react";
import { bucketStartFor, fetchCandles, watchSpot, type SpotTick, type Timeframe } from "@/lib/prices";
import type { SpotAsset } from "@/lib/spot-flow";

const TFS: Timeframe[] = ["1m", "5m", "15m", "1h", "1d"];

const PERIODS: Record<Timeframe, Period> = {
  "1m": { type: "minute", span: 1 },
  "5m": { type: "minute", span: 5 },
  "15m": { type: "minute", span: 15 },
  "1h": { type: "hour", span: 1 },
  "1d": { type: "day", span: 1 },
};

const DRAW_TOOLS = [
  { id: "segment", label: "Trend line", icon: "trend" },
  { id: "rayLine", label: "Ray line", icon: "ray" },
  { id: "horizontalStraightLine", label: "Horizontal line", icon: "horizontal" },
  { id: "priceChannelLine", label: "Price channel", icon: "channel" },
  { id: "fibonacciLine", label: "Fibonacci retracement", icon: "fibonacci" },
] as const;

const INDICATOR_LABELS: Record<string, string> = {
  MA: "Moving average (MA)",
  EMA: "Exponential moving average (EMA)",
  RSI: "Relative strength index (RSI)",
};

const DRAW_STEPS: Record<string, number> = {
  segment: 2,
  rayLine: 2,
  horizontalStraightLine: 1,
  priceChannelLine: 3,
  fibonacciLine: 2,
};

type ChartIconName = "trend" | "ray" | "horizontal" | "channel" | "fibonacci" | "magnet" | "undo" | "clear" | "live" | "snapshot";

function ChartIcon({ name }: { name: ChartIconName }) {
  const iconProps = { size: 16, weight: "regular" as const, "aria-hidden": true };
  if (name === "trend") return <TrendUp {...iconProps} />;
  if (name === "ray") return <ArrowLineUpRight {...iconProps} />;
  if (name === "horizontal") return <Minus {...iconProps} />;
  if (name === "channel") return <ArrowsOutLineHorizontal {...iconProps} />;
  if (name === "fibonacci") return <ChartLine {...iconProps} />;
  if (name === "magnet") return <Magnet {...iconProps} />;
  if (name === "undo") return <ArrowCounterClockwise {...iconProps} />;
  if (name === "clear") return <Trash {...iconProps} />;
  if (name === "live") return <Crosshair {...iconProps} />;
  return <Camera {...iconProps} />;
}

type StoredDrawing = Pick<OverlayCreate, "name" | "points" | "styles">;

const fmtUsd = (n: number) =>
  Intl.NumberFormat("en-US", { notation: n >= 100000 ? "compact" : "standard", maximumFractionDigits: n >= 100000 ? 1 : 2 }).format(n);

const groupFor = (asset: string, tf: Timeframe) => `drawings:${asset}:${tf}`;
const storageKeyFor = (group: string) => `dreamcat-chart:${group}`;

function timeframeForPeriod(period: Period): Timeframe | null {
  return TFS.find((tf) => PERIODS[tf].type === period.type && PERIODS[tf].span === period.span) ?? null;
}

function saveDrawings(chart: Chart, groupId: string) {
  const drawings: StoredDrawing[] = chart
    .getOverlays({ groupId })
    .filter(({ currentStep }) => currentStep === -1)
    .map(({ name, points, styles }) => ({ name, points, styles }));
  try {
    localStorage.setItem(storageKeyFor(groupId), JSON.stringify(drawings));
  } catch {
    return;
  }
}

function drawingCallbacks(chart: Chart, groupId: string, onDrawEnd?: () => void) {
  const persist = () => saveDrawings(chart, groupId);
  return {
    onDrawEnd: () => {
      onDrawEnd?.();
      persist();
    },
    onPressedMoveEnd: persist,
    onRemoved: persist,
  };
}

interface PriceChartProps {
  asset: SpotAsset;
  onAssetChange: (asset: SpotAsset) => void;
}

export default function PriceChart({ asset, onAssetChange }: PriceChartProps) {
  const [tf, setTf] = useState<Timeframe>("1m");
  const [spot, setSpot] = useState<Record<string, SpotTick>>({});
  const [tool, setTool] = useState<string | null>(null);
  const [magnet, setMagnet] = useState(true);
  const [indicators, setIndicators] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [ohlc, setOhlc] = useState<KLineData | null>(null);
  const [prevClose, setPrevClose] = useState<number | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const ctxRef = useRef({ asset, tf });
  const candlesRef = useRef<KLineData[]>([]);
  const unsubRef = useRef<(() => void) | null>(null);
  const loadIdRef = useRef(0);

  useEffect(() => {
    ctxRef.current = { asset, tf };
  }, [asset, tf]);

  useEffect(() => {
    const resetPrevClose = setTimeout(() => {
      setPrevClose(null);
      setOhlc(null);
      setChartError(null);
    }, 0);
    return () => clearTimeout(resetPrevClose);
  }, [asset, tf]);

  useEffect(() => {
    const stops = (["BTC", "ETH"] as const).map((a) =>
      watchSpot(a, (t) => setSpot((prev) => ({ ...prev, [a]: t })))
    );
    return () => stops.forEach((s) => s());
  }, []);

  useEffect(() => {
    let alive = true;
    let teardown = () => {};
    const mount = async () => {
      const { dispose, init } = await import("klinecharts");
      if (!alive || !containerRef.current) return;
      const container = containerRef.current;
      const chart = init(container, {
        timezone: "Etc/UTC",
        styles: {
          grid: {
            horizontal: { show: true, color: "rgba(255,255,255,0.04)" },
            vertical: { show: true, color: "rgba(255,255,255,0.04)" },
          },
          candle: {
            bar: {
              upColor: "#22c55e",
              downColor: "#ef4444",
              noChangeColor: "#8b98ab",
              upWickColor: "#22c55e",
              downWickColor: "#ef4444",
              noChangeWickColor: "#8b98ab",
            },
          },
          indicator: {
            bars: [{ upColor: "rgba(34,197,94,0.45)", downColor: "rgba(239,68,68,0.45)", noChangeColor: "rgba(139,152,171,0.45)" }],
            lines: [{ color: "#f59e0b" }, { color: "#22d3ee" }],
          },
          crosshair: {
            horizontal: { line: { color: "rgba(255,255,255,0.25)" }, text: { backgroundColor: "#f59e0b", color: "#0b0f1a" } },
            vertical: { line: { color: "rgba(255,255,255,0.25)" }, text: { backgroundColor: "#f59e0b", color: "#0b0f1a" } },
          },
          overlay: { line: { color: "#f59e0b", size: 2 } },
          separator: { color: "rgba(255,255,255,0.08)" },
        },
      });
      if (!chart) return;
      chartRef.current = chart;
      chart.setDataLoader({
        getBars: async ({ callback, symbol, period }) => {
          const currentAsset = symbol.ticker.split("/")[0];
          const currentTf = timeframeForPeriod(period);
          if (!currentTf || currentAsset !== ctxRef.current.asset || currentTf !== ctxRef.current.tf) return;
          const loadId = ++loadIdRef.current;
          setLoading(true);
          setChartError(null);
          try {
            const candles = await fetchCandles(currentAsset, currentTf, 300);
            if (
              loadId !== loadIdRef.current ||
              !chartRef.current ||
              currentAsset !== ctxRef.current.asset ||
              currentTf !== ctxRef.current.tf
            ) return;
            const nextCandles = candles.map((c) => ({
              timestamp: c.time * 1000,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.ticks,
            }));
            candlesRef.current = nextCandles;
            setOhlc(nextCandles[nextCandles.length - 1] ?? null);
            setChartError(nextCandles.length ? null : "No candle data for this market.");
            setPrevClose(candles.length > 1 ? candles[candles.length - 2].close : null);
            callback(candlesRef.current, false);
          } catch {
            if (
              loadId === loadIdRef.current &&
              chartRef.current &&
              currentAsset === ctxRef.current.asset &&
              currentTf === ctxRef.current.tf
            ) {
              setChartError("Candle data is unavailable.");
              callback([], false);
            }
          } finally {
            if (
              loadId === loadIdRef.current &&
              currentAsset === ctxRef.current.asset &&
              currentTf === ctxRef.current.tf
            ) setLoading(false);
          }
        },
        subscribeBar: ({ callback, symbol, period }) => {
          const currentAsset = symbol.ticker.split("/")[0];
          const currentTf = timeframeForPeriod(period);
          if (!currentTf) return;
          unsubRef.current?.();
          unsubRef.current = watchSpot(currentAsset, (tick) => {
            if (currentAsset !== ctxRef.current.asset || currentTf !== ctxRef.current.tf) return;
            const candles = candlesRef.current;
            if (!candles.length) return;
            const seconds = tick.ts > 10_000_000_000 ? Math.floor(tick.ts / 1000) : Math.floor(tick.ts);
            const bucket = bucketStartFor(currentTf, seconds) * 1000;
            const last = candles[candles.length - 1];
            if (bucket === last.timestamp) {
              candles[candles.length - 1] = {
                ...last,
                close: tick.price,
                high: Math.max(last.high, tick.price),
                low: Math.min(last.low, tick.price),
                volume: (last.volume ?? 0) + 1,
              };
            } else if (bucket > last.timestamp) {
              candles.push({ timestamp: bucket, open: last.close, high: tick.price, low: tick.price, close: tick.price, volume: 1 });
              setPrevClose(last.close);
            } else {
              return;
            }
            const latest = candles[candles.length - 1];
            setOhlc({ ...latest });
            setChartError(null);
            callback(latest);
          });
        },
        unsubscribeBar: () => {
          unsubRef.current?.();
          unsubRef.current = null;
        },
      });
      chart.createIndicator({ name: "VOL", paneId: "volume" });
      chart.setPaneOptions({ id: "volume", height: 70, minHeight: 52 });
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(container);
      teardown = () => {
        unsubRef.current?.();
        unsubRef.current = null;
        observer.disconnect();
        dispose(container);
      };
      setChartReady(true);
    };
    void mount();
    return () => {
      alive = false;
      teardown();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chartReady || !chart) return;
    ctxRef.current = { asset, tf };
    candlesRef.current = [];
    chart.removeOverlay();
    const nextTicker = `${asset}/USD`;
    const currentSymbol = chart.getSymbol();
    const currentPeriod = chart.getPeriod();
    if (currentSymbol?.ticker !== nextTicker) {
      chart.setSymbol({ ticker: nextTicker, pricePrecision: 2, volumePrecision: 0 });
    }
    if (currentPeriod?.type !== PERIODS[tf].type || currentPeriod.span !== PERIODS[tf].span) {
      chart.setPeriod(PERIODS[tf]);
    }
    const groupId = groupFor(asset, tf);
    try {
      const stored = JSON.parse(localStorage.getItem(storageKeyFor(groupId)) ?? "[]") as unknown;
      if (Array.isArray(stored)) {
        stored.forEach((drawing) => {
          if (!drawing || typeof drawing !== "object" || !("name" in drawing) || typeof drawing.name !== "string") return;
          chart.createOverlay({
            ...(drawing as StoredDrawing),
            groupId,
            mode: magnet ? "strong_magnet" : "normal",
            ...drawingCallbacks(chart, groupId),
          });
        });
      }
    } catch {
      try {
        localStorage.removeItem(storageKeyFor(groupId));
      } catch {
        return;
      }
    }
    const resetTool = setTimeout(() => setTool(null), 0);
    return () => clearTimeout(resetTool);
  }, [asset, chartReady, magnet, tf]);

  const pickTool = useCallback(
    (name: string) => {
      const chart = chartRef.current;
      if (!chart) return;
      const groupId = groupFor(asset, tf);
      chart.createOverlay({
        name,
        groupId,
        mode: magnet ? "strong_magnet" : "normal",
        styles: { line: { color: "#f59e0b", size: 2 } },
        ...drawingCallbacks(chart, groupId, () => setTool(null)),
      });
      setTool(name);
    },
    [asset, magnet, tf]
  );

  const toggleIndicator = useCallback(
    (name: string) => {
      const chart = chartRef.current;
      if (!chart) return;
      const on = indicators[name];
      const paneId = name === "RSI" ? "rsi" : "candle_pane";
      if (on) chart.removeIndicator({ paneId, name });
      else chart.createIndicator({ name, paneId }, name !== "RSI");
      if (!on && name === "RSI") chart.setPaneOptions({ id: paneId, height: 82, minHeight: 60 });
      setIndicators((p) => ({ ...p, [name]: !on }));
    },
    [indicators]
  );

  const undoDrawing = () => {
    const chart = chartRef.current;
    if (!chart) return;
    const groupId = groupFor(asset, tf);
    const drawings = chart.getOverlays({ groupId });
    const last = drawings[drawings.length - 1];
    if (last) chart.removeOverlay({ id: last.id });
    saveDrawings(chart, groupId);
    setTool(null);
  };

  const clearDrawings = () => {
    const groupId = groupFor(asset, tf);
    chartRef.current?.removeOverlay({ groupId });
    try {
      localStorage.removeItem(storageKeyFor(groupId));
    } catch {
      return;
    }
    setTool(null);
  };

  const exportChart = () => {
    const url = chartRef.current?.getConvertPictureUrl(true, "png", "#141b2d");
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = `${asset}-${tf}-analysis.png`;
    link.click();
  };

  const retryChart = useCallback(() => {
    setChartError(null);
    chartRef.current?.resetData();
  }, []);

  const tick = spot[asset];
  const currentPrice = tick?.price ?? ohlc?.close ?? null;
  const change = tick && prevClose ? tick.price - prevClose : null;
  const changePct = change != null && prevClose ? (change / prevClose) * 100 : null;
  const activeTool = tool ? DRAW_TOOLS.find((drawing) => drawing.id === tool) : null;
  const toolHint = activeTool ? `${activeTool.label}: click ${DRAW_STEPS[activeTool.id]} point${DRAW_STEPS[activeTool.id] === 1 ? "" : "s"}` : "";

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-hairline bg-panel p-1.5">
      <div className="min-w-0 max-w-full overflow-hidden rounded-lg bg-panel-raised p-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1.5 pt-1 pb-2">
          <div className="flex gap-1">
            {(["BTC", "ETH"] as const).map((a) => (
              <button
                key={a}
                onClick={() => onAssetChange(a)}
                type="button"
                aria-pressed={asset === a}
                className={`num min-h-11 cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold ease-terminal transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/70 focus-visible:ring-offset-1 focus-visible:ring-offset-panel-raised md:min-h-9 ${
                  asset === a ? "bg-amber/15 text-amber" : "text-muted hover:text-foreground"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="num text-xl font-semibold text-foreground">{currentPrice != null ? fmtUsd(currentPrice) : "Unavailable"}</span>
            {changePct != null && (
              <span className={`num text-xs ${changePct >= 0 ? "text-up" : "text-down"}`}>
                {change! >= 0 ? "+" : ""}
                {fmtUsd(change!)} ({changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%)
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {TFS.map((t) => (
              <button
                key={t}
                onClick={() => setTf(t)}
                type="button"
                aria-pressed={tf === t}
                className={`num min-h-11 cursor-pointer rounded-md px-2 py-1 text-[11px] ease-terminal transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/70 focus-visible:ring-offset-1 focus-visible:ring-offset-panel-raised md:min-h-9 ${
                  tf === t ? "bg-white/[0.07] text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="num ml-auto text-[10px] text-muted">{loading ? "Loading" : "Somnia price feed"}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1.5 pb-2">
          <div className="flex gap-1" role="group" aria-label="Drawing tools">
            {DRAW_TOOLS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => pickTool(d.id)}
                aria-label={d.label}
                title={d.label}
                aria-pressed={tool === d.id}
                className={`grid h-11 w-11 cursor-pointer place-items-center rounded-md border ease-terminal transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/70 focus-visible:ring-offset-1 focus-visible:ring-offset-panel-raised md:h-9 md:w-9 ${
                  tool === d.id ? "border-amber/50 bg-amber/15 text-amber" : "border-hairline text-muted hover:text-foreground"
                }`}
              >
                <ChartIcon name={d.icon} />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMagnet((value) => !value)}
              aria-label="Toggle magnet snapping"
              title="Magnet snapping"
              aria-pressed={magnet}
              className={`grid h-11 w-11 cursor-pointer place-items-center rounded-md border ease-terminal transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/70 focus-visible:ring-offset-1 focus-visible:ring-offset-panel-raised md:h-9 md:w-9 ${
                magnet ? "border-amber/50 bg-amber/15 text-amber" : "border-hairline text-muted hover:text-foreground"
              }`}
            >
              <ChartIcon name="magnet" />
            </button>
          </div>
          <div className="flex gap-1" role="group" aria-label="Chart indicators">
            {["MA", "EMA", "RSI"].map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => toggleIndicator(ind)}
                aria-label={`Toggle ${INDICATOR_LABELS[ind]}`}
                title={INDICATOR_LABELS[ind]}
                aria-pressed={Boolean(indicators[ind])}
                className={`num min-h-11 cursor-pointer rounded-md border px-2 py-1 text-[11px] ease-terminal transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/70 focus-visible:ring-offset-1 focus-visible:ring-offset-panel-raised md:min-h-9 ${
                  indicators[ind] ? "border-amber/50 bg-amber/15 text-amber" : "border-hairline text-muted hover:text-foreground"
                }`}
              >
                {ind}
              </button>
            ))}
          </div>
          <div className="flex gap-1" role="group" aria-label="Chart actions">
            <button
              type="button"
              onClick={undoDrawing}
              aria-label="Undo last drawing"
              title="Undo last drawing"
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-md border border-hairline text-muted ease-terminal transition-colors duration-200 hover:text-down focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/70 focus-visible:ring-offset-1 focus-visible:ring-offset-panel-raised md:h-9 md:w-9"
            >
              <ChartIcon name="undo" />
            </button>
            <button
              type="button"
              onClick={clearDrawings}
              aria-label="Clear drawings"
              title="Clear drawings"
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-md border border-hairline text-muted ease-terminal transition-colors duration-200 hover:text-down focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/70 focus-visible:ring-offset-1 focus-visible:ring-offset-panel-raised md:h-9 md:w-9"
            >
              <ChartIcon name="clear" />
            </button>
            <button
              type="button"
              onClick={() => chartRef.current?.scrollToRealTime(200)}
              aria-label="Scroll chart to live data"
              title="Scroll to live data"
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-md border border-hairline text-muted ease-terminal transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/70 focus-visible:ring-offset-1 focus-visible:ring-offset-panel-raised md:h-9 md:w-9"
            >
              <ChartIcon name="live" />
            </button>
            <button
              type="button"
              onClick={exportChart}
              aria-label="Export chart snapshot"
              title="Export chart snapshot"
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-md border border-hairline text-muted ease-terminal transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/70 focus-visible:ring-offset-1 focus-visible:ring-offset-panel-raised md:h-9 md:w-9"
            >
              <ChartIcon name="snapshot" />
            </button>
          </div>
          <span className="num text-[10px] text-muted" aria-live="polite" aria-atomic="true">{toolHint}</span>
        </div>

        <div className="relative min-w-0 max-w-full overflow-hidden">
          <div ref={containerRef} className="h-[360px] min-w-0 max-w-full overflow-hidden px-1 pb-1 md:h-[420px]" aria-label={`${asset} ${tf} candlestick chart`} />
          {(loading || chartError || (!ohlc && chartReady)) && (
            <div className="pointer-events-none absolute inset-x-4 top-4 flex justify-center">
              <div role={chartError ? "alert" : "status"} className={`flex items-center gap-2 rounded-md border border-hairline bg-background/90 px-2.5 py-1.5 text-[10px] ${chartError ? "text-down" : "text-muted"}`}>
                <span>{loading ? "Loading candle data" : chartError ?? "No candle data available"}</span>
                {chartError ? (
                  <button
                    type="button"
                    onClick={retryChart}
                    className="pointer-events-auto min-h-11 rounded-[var(--radius-control)] border border-line-strong px-3 text-text-1 transition-colors hover:border-brand/60 hover:text-brand md:min-h-8"
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
        <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1 border-t border-hairline px-1.5 py-2 text-[10px] sm:grid-cols-5" aria-label="Chart OHLC data">
          <div className="flex min-w-0 justify-between gap-2 sm:block">
            <dt className="text-muted">Current</dt>
            <dd className="num truncate text-right text-foreground sm:text-left">{currentPrice != null ? fmtUsd(currentPrice) : "Unavailable"}</dd>
          </div>
          <div className="flex min-w-0 justify-between gap-2 sm:block">
            <dt className="text-muted">Open</dt>
            <dd className="num truncate text-right text-foreground sm:text-left">{ohlc ? fmtUsd(ohlc.open) : "Unavailable"}</dd>
          </div>
          <div className="flex min-w-0 justify-between gap-2 sm:block">
            <dt className="text-muted">High</dt>
            <dd className="num truncate text-right text-foreground sm:text-left">{ohlc ? fmtUsd(ohlc.high) : "Unavailable"}</dd>
          </div>
          <div className="flex min-w-0 justify-between gap-2 sm:block">
            <dt className="text-muted">Low</dt>
            <dd className="num truncate text-right text-foreground sm:text-left">{ohlc ? fmtUsd(ohlc.low) : "Unavailable"}</dd>
          </div>
          <div className="flex min-w-0 justify-between gap-2 sm:block">
            <dt className="text-muted">Close</dt>
            <dd className="num truncate text-right text-foreground sm:text-left">{ohlc ? fmtUsd(ohlc.close) : "Unavailable"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
