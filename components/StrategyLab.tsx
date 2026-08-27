"use client";

import {
  ArrowCounterClockwise,
  Broadcast,
  CircleNotch,
  Play,
  Stop,
  WarningCircle,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppChrome from "@/components/AppChrome";
import { SettlementRail } from "@/components/landing/SettlementRail";
import StrategyParamFields from "@/components/StrategyParamFields";
import { catFor } from "@/lib/cats";
import StrategyCopilotDock from "@/components/StrategyCopilotDock";
import {
  listLiveMarkets,
  watchBook,
  watchFills,
  type BookSnapshot,
  type Fill,
  type LiveMarketRow,
} from "@/lib/dreamdex";
import { acquireAsset, buildMarketContext } from "@/lib/market-context";
import {
  equityCurve,
  flattenForReconfigure,
  initialSimState,
  stepSim,
  TEMPLATES,
  type Archetype,
  type SimState,
  type StrategyParams,
} from "@/lib/strategy";
import { applyStrategyCopilotProposal as mergeStrategyCopilotProposal, type StrategyCopilotResponse } from "@/lib/strategy-copilot";
import { useNow } from "@/lib/use-now";

const fmtProb = (n: number) => `${(n * 100).toFixed(1)}%`;

function marketLabel(m: LiveMarketRow) {
  const level = m.kind === "ladder" ? `above $${m.strikeLabel}` : "above open";
  return `${m.asset} ${level} ${m.windowLabel || m.interval}`;
}

type MarketStatus = "loading" | "ready" | "error";

export default function StrategyLab() {
  const [markets, setMarkets] = useState<LiveMarketRow[]>([]);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>("loading");
  const [marketError, setMarketError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archetype, setArchetype] = useState<Archetype>("momentum");
  const [params, setParams] = useState<StrategyParams>(TEMPLATES[1].defaults);
  const [revision, setRevision] = useState(0);
  const [running, setRunning] = useState(false);
  const [sim, setSim] = useState<SimState>(initialSimState);
  const [book, setBook] = useState<BookSnapshot | null>(null);
  const bookRef = useRef<BookSnapshot | null>(null);
  const fillsRef = useRef<Fill[]>([]);
  const marketsRef = useRef(markets);
  const selectedRef = useRef<LiveMarketRow | null>(null);
  const refreshingRef = useRef(false);
  const now = useNow();

  useEffect(() => {
    marketsRef.current = markets;
  }, [markets]);

  const template = useMemo(() => TEMPLATES.find((t) => t.archetype === archetype)!, [archetype]);
  const cat = catFor(archetype);

  const updateParams = useCallback((next: StrategyParams) => {
    setParams(next);
    setRevision((current) => current + 1);
  }, []);

  const selectArchetype = useCallback((nextArchetype: Archetype, nextParams: StrategyParams) => {
    if (nextArchetype === archetype) return;
    setSim((state) => (state.position ? flattenForReconfigure(state, bookRef.current, Date.now()) : state));
    setArchetype(nextArchetype);
    setParams(nextParams);
    setRevision((current) => current + 1);
  }, [archetype]);

  const refreshMarkets = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const rows = (await listLiveMarkets()).filter(
        (row) => row.executionReady !== false && (row.executionMode === "chain-pool" || Boolean(row.yesSymbol))
      );
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
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    if (!selected?.asset || !running) return;
    return acquireAsset(selected.asset);
  }, [selected?.asset, running]);

  useEffect(() => {
    if (!selected || !running) return;
    const stopBook = watchBook(
      selected.yesSymbol,
      (nextBook) => {
        if (nextBook.bids.length || nextBook.asks.length) {
          bookRef.current = nextBook;
          setBook(nextBook);
        }
      },
      selected
    );
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
        const row = selectedRef.current;
        const ctx = row ? buildMarketContext(row) : undefined;
        setSim((state) => stepSim({ archetype, params }, state, bookRef.current!, fillsRef.current, Date.now(), ctx));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [running, archetype, params]);

  const pnl = book ? equityCurve(sim, book) : sim.realizedPnl;

  const reset = useCallback(() => {
    setSim(initialSimState);
  }, []);

  const resetRehearsal = useCallback(() => {
    setSim(initialSimState);
    setBook(null);
    bookRef.current = null;
    fillsRef.current = [];
  }, []);

  const applyCopilotProposal = useCallback((response: StrategyCopilotResponse, proposalRevision: number) => {
    if (running || proposalRevision !== revision) return;
    const next = mergeStrategyCopilotProposal({ archetype, params }, response);
    resetRehearsal();
    setArchetype(next.archetype);
    setParams(next.params);
    setRevision((current) => current + 1);
  }, [archetype, params, resetRehearsal, revision, running]);

  const selectMarket = (id: string) => {
    if (id === selectedId) return;
    setSim((state) => (state.position ? flattenForReconfigure(state, bookRef.current, Date.now()) : state));
    setSelectedId(id || null);
    setBook(null);
    bookRef.current = null;
    fillsRef.current = [];
  };

  const canRun = Boolean(selected) && marketStatus === "ready";

  const resultsRef = useRef<HTMLElement | null>(null);

  const toggleRun = useCallback(() => {
    setRunning((current) => {
      const next = !current;
      if (next) {
        const node = resultsRef.current;
        if (node) {
          const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          node.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        }
      }
      return next;
    });
  }, []);

  return (
    <div className="min-h-dvh min-w-0 overflow-x-clip bg-canvas pb-24 text-text-1 md:pb-0">
      <AppChrome current="lab" />

      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="section-kicker">Strategy Lab</p>
            <h1 className="mt-1.5 font-headline text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
              Test a cat before you trust it.
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 text-xs text-text-2">
              <Broadcast
                aria-hidden="true"
                className={marketStatus === "ready" ? "text-buy" : "text-brand"}
                size={15}
                weight="fill"
              />
              <span>
                {marketStatus === "ready"
                  ? `${markets.length} live windows`
                  : marketStatus === "loading"
                    ? "Loading markets"
                    : "Feed unavailable"}
              </span>
            </div>
            <Link
              className="flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-3.5 text-xs font-semibold text-text-1 transition-colors duration-150 hover:border-brand/60 hover:text-brand"
              href="/fleet"
            >
              Open fleet
            </Link>
          </div>
        </header>

        <section className="grid min-w-0 items-stretch gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-shell)] border border-line bg-surface-1">
            <div className="flex items-center gap-3.5 p-4">
              <Image alt="" className="h-14 w-14 shrink-0 rounded-[12px]" height={112} src={cat.image} width={112} />
              <div className="min-w-0">
                <h2 className="font-headline text-lg font-bold tracking-[-0.03em] text-text-1">{cat.name}</h2>
                <p className="num mt-0.5 text-[10px] uppercase tracking-[0.16em] text-brand">{cat.role}</p>
              </div>
            </div>
            <p className="px-4 pb-4 text-xs leading-5 text-text-2">{template.blurb}</p>
            <dl className="grid grid-cols-2 gap-px border-t border-line bg-line">
              <div className="bg-surface-1 px-4 py-3">
                <dt className="num text-[10px] uppercase tracking-[0.16em] text-text-3">Reads</dt>
                <dd className="mt-1 text-xs font-semibold text-text-1">{cat.reads}</dd>
              </div>
              <div className="bg-surface-1 px-4 py-3">
                <dt className="num text-[10px] uppercase tracking-[0.16em] text-text-3">Hold limit</dt>
                <dd className="num mt-1 text-xs font-semibold text-text-1">{params.maxHoldSec}s</dd>
              </div>
            </dl>
            <div className="flex flex-1 flex-col border-t border-line p-3">
              <p className="num pb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-3">
                Swap the cat
              </p>
              <div className="grid flex-1 grid-cols-3 content-start gap-2">
                {TEMPLATES.map((candidate) => {
                  const identity = catFor(candidate.archetype);
                  const active = archetype === candidate.archetype;
                  return (
                    <button
                      aria-label={`${identity.name}, ${identity.role}`}
                      aria-pressed={active}
                      className={`group cursor-pointer rounded-[10px] border p-1 transition-colors duration-150 ${
                        active ? "border-brand bg-brand/[0.08]" : "border-transparent hover:border-line-strong hover:bg-surface-2"
                      }`}
                      key={candidate.archetype}
                      onClick={() => selectArchetype(candidate.archetype, candidate.defaults)}
                      type="button"
                    >
                      <Image
                        alt=""
                        className={`h-auto w-full rounded-[7px] transition-all duration-150 ${
                          active ? "opacity-100" : "opacity-80 grayscale-[0.35] group-hover:opacity-100 group-hover:grayscale-0"
                        }`}
                        height={96}
                        src={identity.image}
                        width={96}
                      />
                      <span className={`mt-1 block truncate text-[10px] font-semibold ${active ? "text-brand" : "text-text-2"}`}>
                        {identity.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-4 rounded-[var(--radius-shell)] border border-line bg-surface-1 p-4 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1">
                <label className="num block pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-3" htmlFor="target-market">
                  Target market
                </label>
                {marketStatus === "loading" ? (
                  <div className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 text-xs text-text-2">
                    <CircleNotch aria-hidden="true" className="animate-spin text-brand" size={15} />
                    Loading live windows
                  </div>
                ) : marketStatus === "error" ? (
                  <div className="rounded-[var(--radius-control)] border border-sell/40 bg-sell/[0.06] p-3" role="alert">
                    <div className="flex items-start gap-2 text-xs text-sell">
                      <WarningCircle aria-hidden="true" className="mt-0.5 shrink-0" size={15} weight="fill" />
                      <span>{marketError}</span>
                    </div>
                    <button
                      className="mt-3 min-h-11 cursor-pointer rounded-[var(--radius-control)] border border-sell/50 px-3 text-xs font-semibold text-sell transition-colors duration-150 hover:bg-sell/[0.1]"
                      onClick={() => void refreshMarkets()}
                      type="button"
                    >
                      Try again
                    </button>
                  </div>
                ) : markets.length === 0 ? (
                  <p className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-3 text-xs leading-5 text-text-2">
                    No live windows right now. This updates automatically.
                  </p>
                ) : (
                  <select
                    className="min-h-11 w-full cursor-pointer rounded-[var(--radius-control)] border border-line-strong bg-surface-2 px-3 text-sm text-text-1 outline-none transition-colors duration-150 hover:border-brand/60 focus:border-brand"
                    id="target-market"
                    onChange={(event) => selectMarket(event.target.value)}
                    value={selectedId ?? ""}
                  >
                    {markets.map((market) => (
                      <option key={market.id} value={market.id}>
                        {marketLabel(market)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-3 text-xs font-medium text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text-1"
                  onClick={reset}
                  type="button"
                >
                  <ArrowCounterClockwise aria-hidden="true" size={15} />
                  Reset
                </button>
                <button
                  aria-pressed={running}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-5 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                    running ? "bg-sell/[0.14] text-sell hover:bg-sell/[0.22]" : "bg-brand text-brand-ink hover:bg-brand-strong"
                  }`}
                  disabled={!canRun}
                  onClick={toggleRun}
                  type="button"
                >
                  {running ? <Stop aria-hidden="true" size={15} weight="fill" /> : <Play aria-hidden="true" size={15} weight="fill" />}
                  {running ? "Stop dry run" : "Start dry run"}
                </button>
              </div>
            </div>

            <div className="flex flex-1 flex-col rounded-[var(--radius-shell)] border border-line bg-surface-1 p-5">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 pb-4">
                <h2 className="num shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-3">
                  Parameters · {cat.name}
                </h2>
                <p className="min-w-0 flex-1 text-[11px] leading-5 text-text-3">
                  Changes apply to a running simulation immediately. Nothing is signed — {cat.name} reads the
                  live book and paper-trades against it.
                </p>
                <button
                  className="num shrink-0 cursor-pointer text-[10px] uppercase tracking-[0.14em] text-text-3 transition-colors duration-150 hover:text-brand"
                  onClick={() => updateParams(template.defaults)}
                  type="button"
                >
                  Reset to defaults
                </button>
              </div>
              <div className="grid flex-1 auto-rows-min content-start gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3 [&>*:last-child]:sm:col-span-full">
                <StrategyParamFields archetype={archetype} onChange={updateParams} params={params} />
              </div>
            </div>
          </div>

        </section>

        <section className="flex min-w-0 scroll-mt-4 flex-col gap-4" ref={resultsRef}>
          <div className="grid items-stretch gap-4 lg:grid-cols-[1.15fr_1fr_1fr]">
            <div className="flex flex-col rounded-[var(--radius-shell)] border border-line bg-surface-1 p-5">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${running ? (book ? "bg-buy" : "bg-brand") : "bg-text-3"}`}
                />
                <p className="num text-[10px] uppercase tracking-[0.16em] text-text-3">
                  {running ? (book ? "Reading the live book" : "Waiting for book data") : "Paper equity · idle"}
                </p>
              </div>
              <p className={`num mt-4 text-[2.75rem] font-bold leading-none tracking-[-0.04em] ${pnl >= 0 ? "text-buy" : "text-sell"}`}>
                {pnl >= 0 ? "+" : ""}
                {pnl.toFixed(2)}
                <span className="num ml-1.5 text-sm font-medium text-text-3">tUSDC</span>
              </p>
              <p className="mt-3 truncate text-xs text-text-2">
                {selected ? selected.question : "Choose a market to begin"}
              </p>
              <div className="mt-auto flex items-center gap-5 border-t border-line pt-3">
                <span className="num text-[11px] text-text-2">{sim.trades} trades</span>
                <span className="num text-[11px] text-text-2">
                  {sim.wins}W / {sim.trades - sim.wins}L
                </span>
              </div>
            </div>

            <div className="flex flex-col rounded-[var(--radius-shell)] border border-line bg-surface-1 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="num text-[10px] uppercase tracking-[0.16em] text-text-3">Mid probability</p>
                <p className="num text-lg font-semibold text-text-1">{book?.mid != null ? fmtProb(book.mid) : "––"}</p>
              </div>
              <div className="my-auto py-4">
                <SettlementRail probability={book?.mid ?? 0.5} showScale={false} size="sm" />
              </div>
              <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-line pt-3">
                <div>
                  <dt className="num text-[10px] uppercase tracking-[0.16em] text-text-3">Spread</dt>
                  <dd className="num mt-1 text-xs font-semibold text-text-1">
                    {book?.spread != null ? fmtProb(book.spread) : "––"}
                  </dd>
                </div>
                <div>
                  <dt className="num text-[10px] uppercase tracking-[0.16em] text-text-3">Book</dt>
                  <dd className={`num mt-1 text-xs font-semibold ${book ? "text-buy" : "text-text-3"}`}>
                    {book ? "Connected" : "Waiting"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-col rounded-[var(--radius-shell)] border border-line bg-surface-1 p-5">
              <p className="num text-[10px] uppercase tracking-[0.16em] text-text-3">Position</p>
              {sim.position ? (
                <dl className="mt-4 space-y-2.5 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-2">Side</dt>
                    <dd className={`num font-semibold ${sim.position.side === "YES" ? "text-buy" : "text-sell"}`}>
                      {sim.position.side}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-2">Entry</dt>
                    <dd className="num">{fmtProb(sim.position.entryPrice)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-2">Size</dt>
                    <dd className="num">{sim.position.size} ctr</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-line pt-2.5">
                    <dt className="text-text-2">Held</dt>
                    <dd className="num">{Math.max(0, Math.round((now - sim.position.openedAt) / 1000))}s</dd>
                  </div>
                </dl>
              ) : (
                <div className="my-auto flex flex-col items-center gap-2.5 py-2 text-center">
                  <Image alt="" className="h-11 w-11 rounded-[10px] opacity-45" height={88} src={cat.image} width={88} />
                  <p className="text-xs leading-5 text-text-2">Flat</p>
                  <p className="text-[11px] leading-5 text-text-3">Waiting for {cat.name}&apos;s signal</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col rounded-[var(--radius-shell)] border border-line bg-surface-1">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <h2 className="num text-[10px] font-semibold uppercase tracking-[0.18em] text-text-3">Execution trace</h2>
              <span className="num text-[10px] text-text-3">{sim.log.length}/60</span>
            </div>
            <div
              aria-label="Dry run event log"
              className={`space-y-0.5 overflow-y-auto overflow-x-hidden p-2 ${
                sim.log.length ? "max-h-[42vh] min-h-[240px]" : ""
              }`}
              role="log"
            >
              {sim.log.map((event, index) => (
                <div
                  className={`grid min-w-0 grid-cols-[4rem_3.4rem_1fr] items-baseline gap-3 rounded-[var(--radius-control)] px-3 py-2 text-[11px] ${
                    event.action === "open"
                      ? "bg-brand/[0.06]"
                      : event.action === "close"
                        ? event.detail.includes("+")
                          ? "bg-buy/[0.07]"
                          : "bg-sell/[0.07]"
                        : ""
                  }`}
                  key={`${event.ts}-${index}`}
                >
                  <span className="num text-text-3">
                    {new Date(event.ts).toLocaleTimeString("en-GB", { hour12: false })}
                  </span>
                  <span
                    className={`num font-semibold ${
                      event.action === "open" ? "text-brand" : event.action === "close" ? "text-text-1" : "text-text-2"
                    }`}
                  >
                    {event.action.toUpperCase()}
                  </span>
                  <span className="min-w-0 break-words text-text-2">{event.detail}</span>
                </div>
              ))}
              {!sim.log.length && (
                <div className="flex items-center justify-center gap-3 px-6 py-8 text-center">
                  <Image alt="" className="h-9 w-9 shrink-0 rounded-[8px] opacity-45" height={72} src={cat.image} width={72} />
                  <p className="text-xs leading-5 text-text-2">
                    {running
                      ? `Watching for ${cat.name}'s first signal.`
                      : "Start a dry run to see simulated orders here."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

      </div>

      <StrategyCopilotDock draft={{ archetype, params }} revision={revision} running={running} onApply={applyCopilotProposal} />
    </div>
  );
}
