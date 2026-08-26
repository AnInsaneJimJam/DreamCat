"use client";

import {
  ArrowCounterClockwise,
  Broadcast,
  ChartLineUp,
  CircleNotch,
  Flask,
  Play,
  SlidersHorizontal,
  Stop,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AppChrome from "@/components/AppChrome";
import {
  listLiveMarkets,
  watchBook,
  watchFills,
  type BookSnapshot,
  type Fill,
  type LiveMarketRow,
} from "@/lib/dreamdex";
import {
  equityCurve,
  initialSimState,
  stepSim,
  TEMPLATES,
  type Archetype,
  type SimState,
  type StrategyParams,
} from "@/lib/strategy";
import { useNow } from "@/lib/use-now";

const fmtProb = (n: number) => `${(n * 100).toFixed(1)}%`;

function marketLabel(m: LiveMarketRow) {
  const level = m.kind === "ladder" ? `above $${m.strikeLabel}` : "above open";
  return `${m.asset} ${level} ${m.windowLabel || m.interval}`;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`surface-shell min-w-0 ${className}`}>
      <div className="surface-frame min-w-0 p-3">{children}</div>
    </div>
  );
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 pb-2">
        <label htmlFor={id} className="text-xs text-text-2">
          {label}
        </label>
        <output htmlFor={id} className="num text-xs font-medium text-text-1">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-11 w-full cursor-pointer accent-brand"
      />
    </div>
  );
}

type MarketStatus = "loading" | "ready" | "error";

export default function StrategyLab() {
  const [markets, setMarkets] = useState<LiveMarketRow[]>([]);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>("loading");
  const [marketError, setMarketError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archetype, setArchetype] = useState<Archetype>("momentum");
  const [params, setParams] = useState<StrategyParams>(TEMPLATES[1].defaults);
  const [running, setRunning] = useState(false);
  const [sim, setSim] = useState<SimState>(initialSimState);
  const [book, setBook] = useState<BookSnapshot | null>(null);
  const bookRef = useRef<BookSnapshot | null>(null);
  const fillsRef = useRef<Fill[]>([]);
  const marketsRef = useRef(markets);
  const refreshingRef = useRef(false);
  const now = useNow();

  useEffect(() => {
    marketsRef.current = markets;
  }, [markets]);

  const template = useMemo(() => TEMPLATES.find((t) => t.archetype === archetype)!, [archetype]);

  const refreshMarkets = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const rows = (await listLiveMarkets()).filter((row) => row.executionReady !== false && (row.executionMode === "chain-pool" || Boolean(row.yesSymbol)));
      setMarkets(rows);
      setSelectedId((current) => (current && rows.some((row) => row.id === current) ? current : (rows[0]?.id ?? null)));
      setMarketStatus("ready");
      setMarketError("");
    } catch {
      if (marketsRef.current.length === 0) {
        setMarketStatus("error");
        setMarketError("The market feed did not respond. Try again when the Somnia indexer is available.");
      }
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const kick = setTimeout(() => void refreshMarkets(), 0);
    const timer = setInterval(() => void refreshMarkets(), 8000);
    return () => {
      clearTimeout(kick);
      clearInterval(timer);
    };
  }, [refreshMarkets]);

  const selected = markets.find((market) => market.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected || !running) return;
    const stopBook = watchBook(selected.yesSymbol, (nextBook) => {
      if (nextBook.bids.length || nextBook.asks.length) {
        bookRef.current = nextBook;
        setBook(nextBook);
      }
    }, selected);
    const stopFills = watchFills(selected.yesSymbol, (fills) => {
      fillsRef.current = fills;
    });
    return () => {
      stopBook();
      stopFills();
    };
  }, [selected, running]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      if (bookRef.current) {
        setSim((state) => stepSim({ archetype, params }, state, bookRef.current!, fillsRef.current, Date.now()));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [running, archetype, params]);

  const pnl = book ? equityCurve(sim, book) : sim.realizedPnl;

  const reset = useCallback(() => {
    setSim(initialSimState);
  }, []);

  const selectMarket = (id: string) => {
    setSelectedId(id || null);
    setBook(null);
    bookRef.current = null;
    fillsRef.current = [];
  };

  const canRun = Boolean(selected) && marketStatus === "ready";

  return (
    <div className="min-h-dvh min-w-0 overflow-x-clip bg-canvas pb-24 text-text-1 md:pb-0">
      <AppChrome current="lab" />
      <header className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 pb-5 pt-7 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:pt-9">
        <div className="min-w-0">
          <p className="section-kicker">Strategy Lab / Simulate</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-5xl">
            Shape a strategy against the live book.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-2 sm:text-base">
            Tune a paper strategy, watch its signals, and inspect every simulated fill before you send a fleet.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 py-2 text-xs text-text-2">
            <Broadcast aria-hidden="true" className={marketStatus === "ready" ? "text-buy" : "text-brand"} size={15} weight="fill" />
            <span>{marketStatus === "ready" ? `${markets.length} live windows` : marketStatus === "loading" ? "Loading markets" : "Feed unavailable"}</span>
          </div>
          <Link
            href="/fleet"
            className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-3.5 text-xs font-semibold text-text-1 transition-colors duration-150 hover:border-brand/60 hover:text-brand"
          >
            Open fleet
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1440px] min-w-0 items-start gap-3 px-4 pb-8 sm:px-6 lg:px-8 xl:grid-cols-[300px_minmax(0,1fr)_minmax(280px,0.9fr)]">
        <section aria-labelledby="strategy-controls-heading" className="flex min-w-0 flex-col gap-3">
          <Panel>
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <Flask aria-hidden="true" className="text-brand" size={17} weight="regular" />
              <h2 id="strategy-controls-heading" className="text-sm font-semibold">Choose a strategy</h2>
            </div>
            <div className="space-y-2 pt-3">
              {TEMPLATES.map((candidate) => {
                const active = archetype === candidate.archetype;
                return (
                  <button
                    key={candidate.archetype}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setArchetype(candidate.archetype);
                      setParams(candidate.defaults);
                    }}
                    className={`min-h-11 w-full cursor-pointer rounded-[var(--radius-control)] border p-3 text-left transition-colors duration-150 ${
                      active ? "border-brand/60 bg-brand/[0.08]" : "border-line hover:border-line-strong hover:bg-surface-3"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-text-1">{candidate.cat}</span>
                      <span className="num text-[10px] uppercase tracking-[0.16em] text-text-3">{candidate.archetype}</span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-text-2">{candidate.blurb}</span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <SlidersHorizontal aria-hidden="true" className="text-brand" size={17} weight="regular" />
              <h2 className="text-sm font-semibold">Parameters</h2>
            </div>
            <div className="space-y-4 pt-4">
              <Slider id="entry-signal" label="Entry signal" value={params.entryEdge} min={0.5} max={0.95} step={0.05} format={(value) => value.toFixed(2)} onChange={(value) => setParams((current) => ({ ...current, entryEdge: value }))} />
              <Slider id="order-size" label="Order size" value={params.orderSize} min={1} max={50} step={1} format={(value) => `${value} ctr`} onChange={(value) => setParams((current) => ({ ...current, orderSize: value }))} />
              <Slider id="take-profit" label="Take profit" value={params.takeProfit} min={0.01} max={0.15} step={0.005} format={(value) => `${(value * 100).toFixed(1)}%`} onChange={(value) => setParams((current) => ({ ...current, takeProfit: value }))} />
              <Slider id="stop-loss" label="Stop loss" value={params.stopLoss} min={0.01} max={0.1} step={0.005} format={(value) => `${(value * 100).toFixed(1)}%`} onChange={(value) => setParams((current) => ({ ...current, stopLoss: value }))} />
              <Slider id="tape-lookback" label="Tape lookback" value={params.lookback} min={3} max={20} step={1} format={(value) => `${value} prints`} onChange={(value) => setParams((current) => ({ ...current, lookback: value }))} />
              <Slider id="time-stop" label="Time stop" value={params.maxHoldSec} min={30} max={900} step={30} format={(value) => `${value}s`} onChange={(value) => setParams((current) => ({ ...current, maxHoldSec: value }))} />
            </div>
          </Panel>
        </section>

        <section aria-labelledby="market-heading" className="flex min-w-0 flex-col gap-3">
          <Panel>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="section-kicker">Target market</p>
                <label htmlFor="target-market" className="mt-2 block text-sm font-semibold text-text-1">Choose a live window</label>
              </div>
              <span className="num text-xs text-text-3">{selected ? selected.asset : "No target"}</span>
            </div>
            {marketStatus === "loading" ? (
              <div className="mt-3 flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface-1 px-3 text-xs text-text-2">
                <CircleNotch aria-hidden="true" className="animate-spin text-brand" size={16} />
                Loading live market windows
              </div>
            ) : marketStatus === "error" ? (
              <div className="mt-3 rounded-[var(--radius-control)] border border-sell/40 bg-sell/[0.06] p-3" role="alert">
                <div className="flex items-start gap-2 text-xs text-sell">
                  <WarningCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} weight="fill" />
                  <span>{marketError}</span>
                </div>
                <button type="button" onClick={() => void refreshMarkets()} className="mt-3 min-h-11 cursor-pointer rounded-[var(--radius-control)] border border-sell/50 px-3 text-xs font-semibold text-sell transition-colors duration-150 hover:bg-sell/[0.1]">
                  Try again
                </button>
              </div>
            ) : markets.length === 0 ? (
              <div className="mt-3 rounded-[var(--radius-control)] border border-line bg-surface-1 p-3 text-xs leading-5 text-text-2">
                No live market windows are available right now. The picker will update automatically.
              </div>
            ) : (
              <select
                id="target-market"
                value={selectedId ?? ""}
                onChange={(event) => selectMarket(event.target.value)}
                className="mt-3 min-h-11 w-full cursor-pointer rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-3 text-sm text-text-1 outline-none transition-colors duration-150 hover:border-brand/60 focus:border-brand"
              >
                {markets.map((market) => (
                  <option key={market.id} value={market.id}>{marketLabel(market)}</option>
                ))}
              </select>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <button
                type="button"
                aria-pressed={running}
                onClick={() => setRunning((current) => !current)}
                disabled={!canRun}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-4 text-xs font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${running ? "bg-sell/[0.14] text-sell hover:bg-sell/[0.22]" : "bg-brand text-brand-ink hover:bg-brand-strong"}`}
              >
                {running ? <Stop aria-hidden="true" size={15} weight="fill" /> : <Play aria-hidden="true" size={15} weight="fill" />}
                {running ? "Stop dry run" : "Start dry run"}
              </button>
              <button type="button" onClick={reset} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-3 text-xs font-medium text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text-1">
                <ArrowCounterClockwise aria-hidden="true" size={15} />
                Reset
              </button>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-kicker">Live market</p>
                <h2 id="market-heading" className="mt-2 text-sm font-semibold">{selected ? selected.question : "Waiting for a target"}</h2>
              </div>
              <span className={`h-2 w-2 shrink-0 rounded-full ${book ? "bg-buy" : "bg-text-3"}`} aria-label={book ? "Book connected" : "Book waiting"} />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-[var(--radius-control)] border border-line bg-surface-1 p-3">
                <dt className="text-[10px] uppercase tracking-[0.16em] text-text-3">Mid probability</dt>
                <dd className="num mt-2 text-2xl font-semibold text-brand">{book?.mid != null ? fmtProb(book.mid) : "Waiting"}</dd>
              </div>
              <div className="rounded-[var(--radius-control)] border border-line bg-surface-1 p-3">
                <dt className="text-[10px] uppercase tracking-[0.16em] text-text-3">Spread</dt>
                <dd className="num mt-2 text-2xl font-semibold text-text-1">{book?.spread != null ? fmtProb(book.spread) : "Waiting"}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-5 text-text-2">
              {running ? (book ? "The runner is reading the live book." : "The runner is waiting for book data.") : "Start a dry run to connect to this market."}
            </p>
          </Panel>

          <Panel className="xl:min-h-[250px]">
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <ChartLineUp aria-hidden="true" className="text-brand" size={17} weight="regular" />
              <h2 className="text-sm font-semibold">Position and equity</h2>
            </div>
            {sim.position ? (
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-text-2">Side</dt><dd className={sim.position.side === "YES" ? "text-buy" : "text-sell"}>{sim.position.side}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-2">Entry</dt><dd className="num">{fmtProb(sim.position.entryPrice)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-2">Size</dt><dd className="num">{sim.position.size} ctr</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-2">Held</dt><dd className="num">{Math.max(0, Math.round((now - sim.position.openedAt) / 1000))}s</dd></div>
              </dl>
            ) : (
              <div className="mt-3 rounded-[var(--radius-control)] border border-line bg-surface-1 p-3 text-xs leading-5 text-text-2">
                Flat. Waiting for {template.cat}&apos;s signal.
              </div>
            )}
            <div className="mt-5 border-t border-line pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[10px] uppercase tracking-[0.16em] text-text-3">Paper equity</span>
                <span className={`num text-lg font-semibold ${pnl >= 0 ? "text-buy" : "text-sell"}`}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} tUSDC</span>
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-text-3">
                <span className="num">{sim.trades} trades</span>
                <span className="num">{sim.wins}W / {sim.trades - sim.wins}L</span>
              </div>
            </div>
          </Panel>
        </section>

        <section aria-labelledby="log-heading" className="min-w-0 lg:col-span-2 xl:col-span-1">
          <Panel className="xl:sticky xl:top-24">
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <div>
                <p className="section-kicker">Execution trace</p>
                <h2 id="log-heading" className="mt-2 text-sm font-semibold">Dry-run log</h2>
              </div>
              <span className="num text-xs text-text-3">{sim.log.length}/60</span>
            </div>
            <div role="log" aria-label="Dry run event log" className="mt-3 max-h-[520px] min-h-[180px] space-y-1 overflow-y-auto overflow-x-hidden pr-1">
              {sim.log.map((event, index) => (
                <div
                  key={`${event.ts}-${index}`}
                  className={`grid min-w-0 grid-cols-[3.6rem_auto_1fr] gap-2 rounded-[var(--radius-control)] px-2 py-2 text-[11px] ${event.action === "open" ? "bg-brand/[0.06]" : event.action === "close" ? (event.detail.includes("+") ? "bg-buy/[0.07]" : "bg-sell/[0.07]") : ""}`}
                >
                  <span className="num text-text-3">{new Date(event.ts).toLocaleTimeString("en-GB", { hour12: false })}</span>
                  <span className={`font-semibold ${event.action === "open" ? "text-brand" : event.action === "close" ? "text-text-1" : "text-text-2"}`}>{event.action.toUpperCase()}</span>
                  <span className="min-w-0 break-words text-text-2">{event.detail}</span>
                </div>
              ))}
              {!sim.log.length && (
                <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-[var(--radius-control)] border border-dashed border-line px-4 text-center">
                  <ChartLineUp aria-hidden="true" className="text-text-3" size={22} />
                  <p className="text-xs leading-5 text-text-2">{running ? "Watching for the first signal." : "Start a dry run to see simulated orders here."}</p>
                  <p className="text-[11px] leading-5 text-text-3">Nothing is signed. The runner watches the live book and paper-trades it.</p>
                </div>
              )}
            </div>
          </Panel>
        </section>
      </main>
    </div>
  );
}
