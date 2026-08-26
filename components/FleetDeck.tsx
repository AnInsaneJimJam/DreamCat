"use client";

import {
  Broadcast,
  Check,
  CircleNotch,
  Info,
  Lightning,
  Play,
  Plus,
  Stop,
  Trash,
  UploadSimple,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import AppChrome from "@/components/AppChrome";
import { listLiveMarkets, type LiveMarketRow } from "@/lib/dreamdex";
import BurnerPanel from "@/components/BurnerPanel";
import CatConfigModal from "@/components/CatConfigModal";
import { TEMPLATES, type StrategyParams } from "@/lib/strategy";
import { canTradeLive } from "@/lib/live-fleet";
import type { Address } from "viem";
import { useNow } from "@/lib/use-now";
import {
  MAX_CATS,
  catEquity,
  fleetSummary,
  freshCat,
  nextAccent,
  totalAlloc,
  type FleetCat,
} from "@/lib/fleet";
import {
  EMPTY_BOOK,
  acknowledgeDroppedPositions,
  getFleetServerState,
  getFleetState,
  hydrateFleet,
  removeFleetCat,
  setFleetBankroll,
  setFleetMarkets,
  setFleetMode,
  setFleetRunning,
  subscribeFleet,
  updateFleetCatConfig,
  updateFleetCats,
  type FleetMode,
} from "@/lib/fleet-runner";

const fmtProb = (n: number) => `${(n * 100).toFixed(1)}%`;

function marketLabel(m: LiveMarketRow | undefined) {
  if (!m) return "Market unavailable";
  const level = m.kind === "ladder" ? `above $${m.strikeLabel}` : "above open";
  return `${m.asset} ${level} ${m.windowLabel || m.interval}`;
}

function Spark({ hist, accent }: { hist: number[]; accent: string }) {
  if (hist.length < 2) return <div className="h-6 w-full" aria-hidden="true" />;
  const min = Math.min(...hist, 0);
  const max = Math.max(...hist, 0.001);
  const range = max - min || 1;
  const points = hist
    .map((value, index) => `${(index / (hist.length - 1)) * 100},${22 - ((value - min) / range) * 20}`)
    .join(" ");
  return (
    <svg aria-hidden="true" className="h-6 w-full" preserveAspectRatio="none" viewBox="0 0 100 24">
      <polyline fill="none" points={points} stroke={accent} strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function FleetEquityPlot({ cats }: { cats: FleetCat[] }) {
  const series = cats.filter((cat) => cat.equityHist.length >= 2);
  if (series.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 rounded-[var(--radius-panel)] border border-dashed border-line px-6 text-center">
        <p className="text-xs text-text-2">No equity history yet</p>
        <p className="text-[11px] text-text-3">Curves are drawn once the fleet runs.</p>
      </div>
    );
  }
  const span = Math.max(...series.map((cat) => cat.equityHist.length));
  let min = 0;
  let max = 0;
  for (const cat of series) {
    for (const value of cat.equityHist) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  const pad = (max - min) * 0.14 || 0.4;
  min -= pad;
  max += pad;
  const toY = (value: number) => 100 - ((value - min) / (max - min)) * 100;
  const zero = toY(0);
  return (
    <div className="flex h-full flex-col">
      <svg aria-hidden="true" className="min-h-0 w-full flex-1" preserveAspectRatio="none" viewBox="0 0 100 100">
        <line className="text-line-strong" stroke="currentColor" strokeDasharray="3 3" strokeWidth="0.5" x1="0" x2="100" y1={zero} y2={zero} />
        {series.map((cat) => {
          const offset = span - cat.equityHist.length;
          const points = cat.equityHist
            .map((value, index) => `${((index + offset) / (span - 1)) * 100},${toY(value)}`)
            .join(" ");
          return (
            <polyline
              key={cat.slot}
              fill="none"
              points={points}
              stroke={cat.accent}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      <div className="flex items-center justify-between gap-3 pt-2">
        <ul className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {series.map((cat) => (
            <li key={cat.slot} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ backgroundColor: cat.accent }} />
              <span className="truncate text-[11px] text-text-2">{cat.name}</span>
            </li>
          ))}
        </ul>
        <span className="num shrink-0 text-[10px] text-text-3">{span} ticks</span>
      </div>
    </div>
  );
}

function StateCell({ cat, now, mode, running }: { cat: FleetCat; now: number; mode: FleetMode; running: boolean }) {
  if (mode === "live") {
    if (!canTradeLive(cat.archetype)) return <span className="text-[11px] text-text-3">Paused in live run</span>;
    if (!running) return <span className="text-[11px] text-text-3">Waiting for deploy</span>;
    const live = cat.live;
    if (live?.status === "submitting") return <span className="text-[11px] font-semibold text-brand">Signing order</span>;
    if (live?.status === "error") {
      return <span className="truncate text-[11px] text-sell" title={live.lastError}>{live.lastError ?? "Order rejected"}</span>;
    }
  }
  const position = cat.sim.position;
  if (position) {
    return (
      <span className="flex items-baseline gap-1.5">
        <span className={`text-[11px] font-semibold ${position.side === "YES" ? "text-buy" : "text-sell"}`}>{position.side}</span>
        <span className="num text-[11px] text-text-2">{fmtProb(position.entryPrice)}</span>
        <span className="num text-[10px] text-text-3">{running ? `${Math.max(0, Math.round((now - position.openedAt) / 1000))}s` : "held, paused"}</span>
      </span>
    );
  }
  const quotes = cat.sim.quotes;
  if (quotes?.bid || quotes?.ask) {
    return (
      <span className="flex items-baseline gap-1.5">
        <span className="text-[11px] font-semibold text-brand">RESTING</span>
        <span className="num text-[11px] text-text-2">
          {quotes.bid ? fmtProb(quotes.bid.price) : "\u2014"} / {quotes.ask ? fmtProb(quotes.ask.price) : "\u2014"}
        </span>
      </span>
    );
  }
  return <span className="text-[11px] text-text-3">{running ? "Scanning" : "Waiting for deploy"}</span>;
}

interface Draft {
  persona: number;
  marketId: string;
}

type MarketStatus = "loading" | "ready" | "error";

export default function FleetDeck() {
  const fleet = useSyncExternalStore(subscribeFleet, getFleetState, getFleetServerState);
  const { cats, running, mode, bankroll, live: liveData, hydrated: storageReady, droppedPositions, burnerReady } = fleet;
  const [markets, setMarkets] = useState<LiveMarketRow[]>([]);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>("loading");
  const [marketError, setMarketError] = useState("");
  const [published, setPublished] = useState<Record<number, "sending" | "done" | "fail">>({});
  const [draft, setDraft] = useState<Draft>({ persona: 0, marketId: "" });
  const [draftError, setDraftError] = useState("");
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; slot: number } | null>(null);
  const [modeError, setModeError] = useState("");
  const marketsRef = useRef(markets);
  const refreshingRef = useRef(false);
  const now = useNow();

  useEffect(() => {
    marketsRef.current = markets;
  }, [markets]);

  useEffect(() => {
    const kick = setTimeout(hydrateFleet, 0);
    return () => clearTimeout(kick);
  }, []);

  useEffect(() => {
    setFleetMarkets(markets);
  }, [markets]);

  const refreshMarkets = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const rows = (await listLiveMarkets()).filter((row) => row.executionReady !== false && (row.executionMode === "chain-pool" || Boolean(row.yesSymbol)));
      setMarkets(rows);
      setDraft((current) => (current.marketId && rows.some((row) => row.id === current.marketId) ? current : { ...current, marketId: rows[0]?.id ?? "" }));
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
    const timer = setInterval(() => void refreshMarkets(), 10000);
    return () => {
      clearTimeout(kick);
      clearInterval(timer);
    };
  }, [refreshMarkets]);

  useEffect(() => {
    if (!markets.length) return;
    const kick = setTimeout(() => {
      try {
        const raw = localStorage.getItem("dreamcat-pending-clone");
        if (!raw) return;
        localStorage.removeItem("dreamcat-pending-clone");
        const cat = JSON.parse(raw) as FleetCat;
        if (cats.length >= MAX_CATS) return;
        updateFleetCats((current) =>
          current.some((item) => item.slot === cat.slot)
            ? current
            : [...current, { ...cat, marketId: cat.marketId || markets[0].id, sim: { ...cat.sim, position: null, log: [] } }]
        );
      } catch {
        setDraftError("The cloned strategy could not be loaded into the fleet.");
      }
    }, 200);
    return () => clearTimeout(kick);
  }, [markets, cats.length]);

  const draftTemplate = TEMPLATES[draft.persona] ?? TEMPLATES[0];

  const openDeployModal = useCallback(() => {
    setDraftError("");
    if (!draft.marketId) {
      setDraftError("Choose a live market before adding a cat.");
      return;
    }
    if (cats.length >= MAX_CATS) {
      setDraftError("The fleet is full. Remove a cat before adding another one.");
      return;
    }
    if (100 - totalAlloc(cats) < 5) {
      setDraftError("Available capital is fully allocated. Remove a cat before adding another one.");
      return;
    }
    setModal({ mode: "create" });
  }, [cats, draft.marketId]);

  const createCat = useCallback((params: StrategyParams, allocPct: number) => {
    const template = draftTemplate;
    const slot = cats.reduce((max, cat) => Math.max(max, cat.slot), -1) + 1;
    const cat = freshCat({
      slot,
      name: cats.some((item) => item.name === template.cat) ? `${template.cat} II` : template.cat,
      accent: nextAccent(cats),
      archetype: template.archetype,
      params,
      marketId: draft.marketId,
      allocPct,
    });
    updateFleetCats((current) => [...current, cat]);
    setModal(null);
  }, [cats, draft.marketId, draftTemplate]);

  const applyCatConfig = useCallback((slot: number, params: StrategyParams, allocPct: number) => {
    updateFleetCatConfig(slot, params, allocPct);
    setModal(null);
  }, []);

  const publishCat = useCallback(async (cat: FleetCat) => {
    setPublished((current) => ({ ...current, [cat.slot]: "sending" }));
    const market = markets.find((item) => item.id === cat.marketId);
    try {
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catName: cat.name,
          archetype: cat.archetype,
          params: cat.params,
          pnl: Number(cat.sim.realizedPnl.toFixed(4)),
          trades: cat.sim.trades,
          wins: cat.sim.wins,
          marketLabel: marketLabel(market),
        }),
      });
      setPublished((current) => ({ ...current, [cat.slot]: response.ok ? "done" : "fail" }));
    } catch {
      setPublished((current) => ({ ...current, [cat.slot]: "fail" }));
    }
  }, [markets]);

  const summary = useMemo(
    () =>
      fleetSummary(
        cats,
        new Map(cats.map((cat) => [cat.slot, { book: liveData[cat.slot]?.book ?? EMPTY_BOOK }])),
        bankroll
      ),
    [cats, liveData, bankroll]
  );
  const allocUsed = totalAlloc(cats);
  const remainingAlloc = Math.max(0, 100 - allocUsed);
  const editingCat = modal?.mode === "edit" ? cats.find((cat) => cat.slot === modal.slot) ?? null : null;
  const collateral = (markets.find((market) => market.collateral)?.collateral ?? null) as Address | null;
  const liveBlocked = cats.filter((cat) => !canTradeLive(cat.archetype));
  const liveRealized = cats.reduce((total, cat) => total + (cat.live?.realizedPnl ?? 0), 0);
  const headlineEquity = mode === "live" ? liveRealized : summary.equity;

  return (
    <div className="min-h-dvh min-w-0 overflow-x-clip bg-canvas pb-24 text-text-1 md:pb-0">
      <AppChrome current="fleet" />

      <header className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 pb-3 pt-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="min-w-0">
          <p className="section-kicker">Fleet Deck / Paper execution</p>
          <h1 className="mt-1.5 font-display text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-3xl">
            Run a fleet with separated risk.
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 py-2 text-xs text-text-2">
            <Broadcast aria-hidden="true" className={marketStatus === "ready" ? "text-buy" : "text-brand"} size={15} weight="fill" />
            <span>{marketStatus === "ready" ? `${markets.length} live windows` : marketStatus === "loading" ? "Loading markets" : "Feed unavailable"}</span>
          </div>
          <Link href="/leaderboard" className="flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-3.5 text-xs font-semibold text-text-1 transition-colors duration-150 hover:border-brand/60 hover:text-brand">
            Open board
          </Link>
          <div role="group" aria-label="Execution mode" className="flex items-center rounded-[var(--radius-control)] border border-line-strong bg-surface-1 p-0.5">
            {(["dry", "live"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                disabled={option === "live" && !burnerReady}
                title={option === "live" && !burnerReady ? "Create and fund the cat wallet first" : undefined}
                onClick={() => setModeError(setFleetMode(option) ?? "")}
                className={`min-h-10 cursor-pointer rounded-[calc(var(--radius-control)-2px)] px-3 text-xs font-semibold transition-colors duration-150 ${
                  mode === option
                    ? option === "live"
                      ? "bg-sell/[0.18] text-sell"
                      : "bg-surface-3 text-text-1"
                    : "text-text-3 hover:text-text-1"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {option === "dry" ? "Dry run" : "Live run"}
              </button>
            ))}
          </div>
          <button type="button" aria-pressed={running} disabled={!cats.length} onClick={() => setFleetRunning(!running)} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-3.5 text-xs font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${running ? "bg-sell/[0.14] text-sell hover:bg-sell/[0.22]" : "bg-brand text-brand-ink hover:bg-brand-strong"}`}>
            {running ? <Stop aria-hidden="true" size={14} weight="fill" /> : <Play aria-hidden="true" size={14} weight="fill" />}
            {running ? "Stop fleet" : "Deploy fleet"}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] min-w-0 space-y-3 px-4 pb-8 sm:px-6 lg:px-8">
        {droppedPositions > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-panel)] border border-brand/40 bg-brand/[0.06] px-3 py-2 text-xs text-text-2" role="status">
            <WarningCircle aria-hidden="true" className="shrink-0 text-brand" size={15} weight="fill" />
            <span>
              {droppedPositions === 1 ? "1 open paper position was" : `${droppedPositions} open paper positions were`} cleared on reload — they could not be marked against a live book from the previous session.
            </span>
            <button type="button" onClick={acknowledgeDroppedPositions} className="ml-auto min-h-11 cursor-pointer rounded-[var(--radius-control)] px-2 text-xs font-semibold text-brand hover:bg-brand/[0.12] md:min-h-9">
              Dismiss
            </button>
          </div>
        ) : null}

        {modeError ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-panel)] border border-sell/40 bg-sell/[0.06] px-3 py-2 text-xs text-text-2" role="alert">
            <WarningCircle aria-hidden="true" className="shrink-0 text-sell" size={15} weight="fill" />
            <span>{modeError}</span>
            <button type="button" onClick={() => setModeError("")} className="ml-auto min-h-11 cursor-pointer rounded-[var(--radius-control)] px-2 text-xs font-semibold text-sell hover:bg-sell/[0.12] md:min-h-9">
              Dismiss
            </button>
          </div>
        ) : null}

        {mode === "live" ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-panel)] border border-sell/40 bg-sell/[0.06] px-3 py-2 text-xs text-text-2" role="status">
            <Lightning aria-hidden="true" className="shrink-0 text-sell" size={15} weight="fill" />
            <span>
              Live run signs real Somnia Shannon transactions from the cat wallet and spends real testnet funds.
              {liveBlocked.length > 0
                ? ` ${liveBlocked.map((cat) => cat.name).join(", ")} ${liveBlocked.length === 1 ? "rests quotes and stays paused" : "rest quotes and stay paused"} in live run.`
                : ""}
            </span>
          </div>
        ) : null}

        <div className="grid min-w-0 items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="fleet-equity-heading" className="surface-shell min-w-0">
            <div className="surface-frame flex h-full min-w-0 flex-col p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-text-3">{mode === "live" ? "Realized on chain" : "Fleet equity"}</p>
                  <p className={`num mt-1 text-4xl font-semibold leading-none tracking-[-0.02em] sm:text-5xl ${headlineEquity >= 0 ? "text-buy" : "text-sell"}`}>
                    {headlineEquity >= 0 ? "+" : ""}{headlineEquity.toFixed(2)}
                  </p>
                  <p className="num mt-1.5 text-[11px] text-text-3">{mode === "live" ? "tUSDC settled from confirmed fills" : "tUSDC marked against live books"}</p>
                </div>
                <dl className="flex shrink-0 items-start gap-5 text-right">
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.16em] text-text-3">Open</dt>
                    <dd className="num mt-1 text-lg font-semibold text-text-1">{summary.openPositions}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.16em] text-text-3">Trades</dt>
                    <dd className="num mt-1 text-lg font-semibold text-text-1">{summary.trades}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.16em] text-text-3">Record</dt>
                    <dd className="num mt-1 text-lg font-semibold text-text-1">{summary.wins}<span className="text-text-3">/</span>{summary.losses}</dd>
                  </div>
                </dl>
              </div>
              <h2 id="fleet-equity-heading" className="sr-only">Fleet equity history</h2>
              <div className="mt-4 h-52 sm:h-60">
                <FleetEquityPlot cats={cats} />
              </div>
            </div>
          </section>

          <section aria-labelledby="fleet-capital-heading" className="surface-shell min-w-0">
            <div className="surface-frame flex h-full min-w-0 flex-col gap-4 p-4">
              <div>
                <h2 id="fleet-capital-heading" className="text-[10px] uppercase tracking-[0.18em] text-text-3">Capital</h2>
                <div className="mt-2 flex items-center gap-2">
                  <label htmlFor="fleet-bankroll" className="sr-only">Fleet bankroll in tUSDC</label>
                  <input id="fleet-bankroll" type="number" min={100} step={100} value={bankroll} onChange={(event) => setFleetBankroll(Math.max(100, Number(event.target.value) || 100))} className="num min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-2 text-lg font-semibold text-text-1 outline-none focus:border-brand" />
                  <span className="num shrink-0 text-[10px] text-text-3">tUSDC</span>
                </div>
                <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${allocUsed}% of capital allocated across ${cats.length} cats`}>
                  {cats.map((cat) => (
                    <span key={cat.slot} className="h-full" style={{ width: `${cat.allocPct}%`, backgroundColor: cat.accent }} />
                  ))}
                </div>
                <p className="num mt-2 text-[11px] text-text-3">{allocUsed}% allocated / {remainingAlloc}% free</p>
              </div>

              <div className="min-w-0 border-t border-line pt-3">
                <BurnerPanel collateral={collateral} />
              </div>

              <div className="min-w-0 border-t border-line pt-3">
                <h3 className="text-[10px] uppercase tracking-[0.18em] text-text-3">Add a cat</h3>
                {marketStatus === "error" ? (
                  <div className="mt-2" role="alert">
                    <p className="text-xs leading-5 text-sell">{marketError}</p>
                    <button type="button" onClick={() => void refreshMarkets()} className="mt-2 min-h-11 cursor-pointer rounded-[var(--radius-control)] border border-sell/50 px-3 text-xs font-semibold text-sell hover:bg-sell/[0.1]">Try again</button>
                  </div>
                ) : marketStatus === "loading" ? (
                  <div className="mt-2 flex min-h-20 items-center gap-2 text-xs text-text-2"><CircleNotch aria-hidden="true" className="animate-spin text-brand" size={16} />Loading live markets</div>
                ) : markets.length === 0 ? (
                  <p className="mt-2 text-xs leading-5 text-text-2">No live market windows are available for a new cat.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div>
                      <label htmlFor="fleet-persona" className="mb-1 block text-[11px] text-text-2">Persona</label>
                      <select id="fleet-persona" value={draft.persona} onChange={(event) => setDraft((current) => ({ ...current, persona: Number(event.target.value) }))} className="min-h-11 w-full cursor-pointer rounded-[var(--radius-control)] border border-line bg-surface-1 px-2 text-xs outline-none focus:border-brand">
                        {TEMPLATES.map((template, index) => <option key={template.archetype} value={index}>{template.cat} / {template.archetype}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="fleet-market" className="mb-1 block text-[11px] text-text-2">Target market</label>
                      <select id="fleet-market" value={draft.marketId} onChange={(event) => setDraft((current) => ({ ...current, marketId: event.target.value }))} className="min-h-11 w-full cursor-pointer rounded-[var(--radius-control)] border border-line bg-surface-1 px-2 text-xs outline-none focus:border-brand">
                        {markets.map((market) => <option key={market.id} value={market.id}>{marketLabel(market)}</option>)}
                      </select>
                    </div>
                    <button type="button" onClick={openDeployModal} disabled={!draft.marketId || remainingAlloc < 5 || cats.length >= MAX_CATS} className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand px-3 text-xs font-semibold text-brand-ink transition-colors duration-150 hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40">
                      <Plus aria-hidden="true" size={14} weight="bold" />
                      Add to fleet
                    </button>
                    <p className="text-[11px] leading-4 text-text-3">You will set parameters and capital share next.</p>
                    {draftError ? <p className="text-xs leading-5 text-sell" role="alert">{draftError}</p> : null}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <section aria-labelledby="fleet-roster-heading" className="surface-shell min-w-0">
          <div className="surface-frame min-w-0 p-1.5">
            <div className="flex items-center justify-between gap-3 px-2.5 py-2">
              <h2 id="fleet-roster-heading" className="text-[10px] uppercase tracking-[0.18em] text-text-3">Roster</h2>
              <span className="num text-[10px] text-text-3">{cats.length}/{MAX_CATS} cats</span>
            </div>

            {!storageReady ? (
              <div className="flex min-h-28 items-center justify-center gap-2 text-xs text-text-2">
                <CircleNotch aria-hidden="true" className="animate-spin text-brand" size={17} />
                Loading saved fleet
              </div>
            ) : cats.length === 0 ? (
              <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-5 text-center">
                <UsersThree aria-hidden="true" className="text-brand" size={24} weight="regular" />
                <h3 className="text-sm font-semibold">No cats deployed</h3>
                <p className="max-w-md text-xs leading-5 text-text-2">Pick a persona and a live window in Capital, then set its parameters.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {cats.map((cat) => {
                  const book = liveData[cat.slot]?.book ?? null;
                  const equity = catEquity(cat, book, bankroll);
                  const publishState = published[cat.slot];
                  return (
                    <li key={cat.slot} className="grid min-w-0 grid-cols-[3px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-[var(--radius-control)] px-2.5 py-2.5 transition-colors duration-150 hover:bg-surface-2 lg:grid-cols-[3px_minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,0.75fr)_128px_minmax(0,0.62fr)_auto]">
                      <span aria-hidden="true" className="h-8 w-[3px] shrink-0 rounded-full lg:h-9" style={{ backgroundColor: cat.accent }} />

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-text-1">{cat.name}</p>
                        <p className="num truncate text-[10px] uppercase tracking-[0.14em] text-text-3">{cat.archetype}</p>
                      </div>

                      <p className="col-span-2 col-start-2 min-w-0 truncate text-[11px] text-text-2 lg:col-span-1 lg:col-start-auto">
                        {marketLabel(markets.find((market) => market.id === cat.marketId))}
                      </p>

                      <div className="col-span-2 col-start-2 min-w-0 lg:col-span-1 lg:col-start-auto">
                        <StateCell cat={cat} mode={mode} now={now} running={running} />
                      </div>

                      <div className="col-span-2 col-start-2 min-w-0 lg:col-span-1 lg:col-start-auto">
                        <Spark accent={cat.accent} hist={cat.equityHist} />
                      </div>

                      <div className="col-span-2 col-start-2 flex items-baseline gap-2 lg:col-span-1 lg:col-start-auto lg:flex-col lg:items-end lg:gap-0.5">
                        <span className={`num text-sm font-semibold ${equity >= 0 ? "text-buy" : "text-sell"}`}>{equity >= 0 ? "+" : ""}{equity.toFixed(2)}</span>
                        <span className="num text-[10px] text-text-3">
                          {mode === "live"
                            ? `${cat.live?.orders ?? 0} orders / ${cat.allocPct}%`
                            : `${cat.sim.trades}t / ${cat.sim.wins}W / ${cat.allocPct}%`}
                        </span>
                      </div>

                      <div className="col-start-3 row-start-1 flex shrink-0 items-center justify-end gap-0.5 lg:col-start-auto lg:row-start-auto">
                        <button type="button" onClick={() => setModal({ mode: "edit", slot: cat.slot })} aria-label={`Open ${cat.name} details and parameters`} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-brand">
                          <Info aria-hidden="true" size={16} />
                        </button>
                        <button type="button" onClick={() => void publishCat(cat)} disabled={publishState === "sending"} aria-label={publishState === "done" ? `Published ${cat.name} to board` : publishState === "fail" ? `Retry publishing ${cat.name}` : `Publish ${cat.name} to board`} className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[var(--radius-control)] transition-colors duration-150 disabled:cursor-wait disabled:opacity-50 ${publishState === "done" ? "text-buy" : publishState === "fail" ? "text-sell hover:bg-sell/[0.1]" : "text-text-3 hover:bg-surface-3 hover:text-brand"}`}>
                          {publishState === "sending" ? <CircleNotch aria-hidden="true" className="animate-spin" size={16} /> : publishState === "done" ? <Check aria-hidden="true" size={16} weight="bold" /> : publishState === "fail" ? <WarningCircle aria-hidden="true" size={16} weight="fill" /> : <UploadSimple aria-hidden="true" size={16} />}
                        </button>
                        <button type="button" onClick={() => removeFleetCat(cat.slot)} aria-label={`Remove ${cat.name} from fleet`} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-text-3 transition-colors duration-150 hover:bg-sell/[0.1] hover:text-sell">
                          <Trash aria-hidden="true" size={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11px] text-text-3">
          <Broadcast aria-hidden="true" className="text-buy" size={13} weight="fill" />
          <span>Each cat paper-trades its own live window through WebSocket data. Fleet settings persist locally.</span>
        </p>
      </main>

      {modal?.mode === "create" ? (
        <CatConfigModal
          mode="create"
          catName={cats.some((item) => item.name === draftTemplate.cat) ? `${draftTemplate.cat} II` : draftTemplate.cat}
          archetype={draftTemplate.archetype}
          blurb={draftTemplate.blurb}
          accent={nextAccent(cats)}
          marketLabel={marketLabel(markets.find((market) => market.id === draft.marketId))}
          initialParams={draftTemplate.defaults}
          initialAllocPct={Math.min(20, remainingAlloc)}
          maxAllocPct={remainingAlloc}
          onSubmit={createCat}
          onClose={() => setModal(null)}
        />
      ) : null}

      {editingCat ? (
        <CatConfigModal
          mode="edit"
          catName={editingCat.name}
          archetype={editingCat.archetype}
          blurb={TEMPLATES.find((item) => item.archetype === editingCat.archetype)?.blurb ?? ""}
          accent={editingCat.accent}
          marketLabel={marketLabel(markets.find((market) => market.id === editingCat.marketId))}
          initialParams={editingCat.params}
          initialAllocPct={editingCat.allocPct}
          maxAllocPct={remainingAlloc + editingCat.allocPct}
          cat={editingCat}
          running={running}
          onSubmit={(params, allocPct) => applyCatConfig(editingCat.slot, params, allocPct)}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}
