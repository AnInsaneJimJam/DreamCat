"use client";

import {
  Broadcast,
  Check,
  CircleNotch,
  FloppyDisk,
  Play,
  Stop,
  Trash,
  UploadSimple,
  UsersThree,
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
import { TEMPLATES } from "@/lib/strategy";
import { useNow } from "@/lib/use-now";
import {
  ACCENTS,
  MAX_CATS,
  catEquity,
  fleetSummary,
  freshCat,
  tickFleet,
  totalAlloc,
  type FleetCat,
} from "@/lib/fleet";

const STORAGE_KEY = "dreamcat-fleet-v1";
const EMPTY_BOOK: BookSnapshot = {
  bids: [],
  asks: [],
  bidDepth: 0,
  askDepth: 0,
  mid: null,
  spread: null,
  imbalance: null,
};

const fmtProb = (n: number) => `${(n * 100).toFixed(1)}%`;

function marketLabel(m: LiveMarketRow | undefined) {
  if (!m) return "Market unavailable";
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

function CatGlyph({ accent, size = 24 }: { accent: string; size?: number }) {
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="M4 11c0-4 3.6-7 8-7s8 3 8 7l-1.5 6.5c-.3 1.2-1.2 2-2.4 2H7.9c-1.2 0-2.1-.8-2.4-2L4 11Z"
        stroke={accent}
        strokeWidth="1.5"
      />
      <path d="M7 5.5 8.5 9M17 5.5 15.5 9" stroke={accent} strokeLinecap="round" strokeWidth="1.5" />
      <circle cx="9.5" cy="12.5" fill={accent} r="1" />
      <circle cx="14.5" cy="12.5" fill={accent} r="1" />
      <path d="M10.5 15.5h3" stroke={accent} strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}

function Spark({ hist, accent }: { hist: number[]; accent: string }) {
  if (hist.length < 2) return <div className="h-8" aria-hidden="true" />;
  const min = Math.min(...hist, 0);
  const max = Math.max(...hist, 0.001);
  const range = max - min || 1;
  const points = hist
    .map((value, index) => `${(index / (hist.length - 1)) * 100},${28 - ((value - min) / range) * 26}`)
    .join(" ");
  return (
    <svg aria-hidden="true" className="h-8 w-full" preserveAspectRatio="none" viewBox="0 0 100 28">
      <polyline fill="none" points={points} stroke={accent} strokeWidth="1.5" />
    </svg>
  );
}

interface Draft {
  persona: number;
  marketId: string;
  allocPct: number;
  orderSize: number;
}

type MarketStatus = "loading" | "ready" | "error";

export default function FleetDeck() {
  const [markets, setMarkets] = useState<LiveMarketRow[]>([]);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>("loading");
  const [marketError, setMarketError] = useState("");
  const [cats, setCats] = useState<FleetCat[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [bankroll, setBankroll] = useState(1000);
  const [published, setPublished] = useState<Record<number, "sending" | "done" | "fail">>({});
  const [draft, setDraft] = useState<Draft>({ persona: 0, marketId: "", allocPct: 20, orderSize: 5 });
  const [draftError, setDraftError] = useState("");
  const [liveData, setLiveData] = useState<Record<number, { book: BookSnapshot; fills: Fill[] }>>({});
  const liveRef = useRef(liveData);
  const stopsRef = useRef(new Map<number, (() => void)[]>());
  const now = useNow();

  useEffect(() => {
    liveRef.current = liveData;
  }, [liveData]);

  useEffect(() => {
    const kick = setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as { cats: FleetCat[] };
          if (Array.isArray(parsed.cats)) setCats(parsed.cats.map((cat) => ({ ...cat, sim: { ...cat.sim, log: [] } })));
        }
      } catch {
        setDraftError("Saved fleet data could not be read. A new local fleet is ready.");
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => clearTimeout(kick);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    let errorTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cats }));
    } catch {
      errorTimer = setTimeout(() => setDraftError("Fleet changes could not be saved locally."), 0);
    }
    return () => {
      if (errorTimer) clearTimeout(errorTimer);
    };
  }, [cats, storageReady]);

  const refreshMarkets = useCallback(async () => {
    setMarketStatus("loading");
    setMarketError("");
    try {
      const rows = await listLiveMarkets();
      setMarkets(rows);
      setDraft((current) => (current.marketId && rows.some((row) => row.id === current.marketId) ? current : { ...current, marketId: rows[0]?.id ?? "" }));
      setMarketStatus("ready");
    } catch {
      setMarkets([]);
      setMarketStatus("error");
      setMarketError("The market feed did not respond. Try again when the Somnia indexer is available.");
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
        setCats((current) =>
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

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setCats((current) => tickFleet({ cats: current, data: new Map(Object.entries(liveRef.current).map(([key, value]) => [Number(key), value])), bankroll, now: Date.now() }));
    }, 1000);
    return () => clearInterval(timer);
  }, [running, bankroll]);

  const deployCat = useCallback(() => {
    setDraftError("");
    if (!draft.marketId) {
      setDraftError("Choose a live market before adding a cat.");
      return;
    }
    if (cats.length >= MAX_CATS) {
      setDraftError(`The fleet is full. Remove a cat before adding another one.`);
      return;
    }
    if (totalAlloc(cats) + draft.allocPct > 100) {
      setDraftError("Available capital is fully allocated. Lower this share or remove a cat.");
      return;
    }
    const template = TEMPLATES[draft.persona];
    const slot = cats.reduce((max, cat) => Math.max(max, cat.slot), -1) + 1;
    const cat = freshCat({
      slot,
      name: cats.some((item) => item.name === template.cat) ? `${template.cat} II` : template.cat,
      accent: ACCENTS[slot % ACCENTS.length],
      archetype: template.archetype,
      params: { ...template.defaults, orderSize: draft.orderSize },
      marketId: draft.marketId,
      allocPct: draft.allocPct,
    });
    setCats((current) => [...current, cat]);
  }, [cats, draft]);

  const stopWatches = useCallback((slot: number) => {
    stopsRef.current.get(slot)?.forEach((stop) => stop());
    stopsRef.current.delete(slot);
    setLiveData((previous) => {
      const next = { ...previous };
      delete next[slot];
      return next;
    });
  }, []);

  const removeCat = useCallback((slot: number) => {
    stopWatches(slot);
    setCats((current) => current.filter((cat) => cat.slot !== slot));
  }, [stopWatches]);

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

  useEffect(() => {
    if (!running) return;
    for (const cat of cats) {
      if (stopsRef.current.has(cat.slot)) continue;
      const market = markets.find((item) => item.id === cat.marketId);
      if (!market) continue;
      const apply = (patch: Partial<{ book: BookSnapshot; fills: Fill[] }>) =>
        setLiveData((previous) => {
          const current = previous[cat.slot] ?? { book: EMPTY_BOOK, fills: [] };
          return { ...previous, [cat.slot]: { ...current, ...patch } };
        });
      const stopBook = watchBook(market.yesSymbol, (book) => apply({ book }));
      const stopFills = watchFills(market.yesSymbol, (fills) => apply({ fills }));
      stopsRef.current.set(cat.slot, [stopBook, stopFills]);
    }
    for (const slot of [...stopsRef.current.keys()]) {
      if (!cats.some((cat) => cat.slot === slot)) stopWatches(slot);
    }
  }, [running, cats, markets, stopWatches]);

  useEffect(() => {
    if (running) return;
    for (const slot of [...stopsRef.current.keys()]) stopWatches(slot);
  }, [running, stopWatches]);

  const summary = useMemo(
    () => fleetSummary(cats, new Map(cats.map((cat) => [cat.slot, { book: liveData[cat.slot]?.book ?? EMPTY_BOOK }])), bankroll),
    [cats, liveData, bankroll]
  );
  const allocUsed = totalAlloc(cats);
  const remainingAlloc = Math.max(0, 100 - allocUsed);
  const draftMaxAlloc = Math.max(5, remainingAlloc);

  return (
    <div className="min-h-dvh min-w-0 overflow-x-clip bg-canvas pb-24 text-text-1 md:pb-0">
      <AppChrome current="fleet" />
      <header className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 pb-5 pt-7 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:pt-9">
        <div className="min-w-0">
          <p className="section-kicker">Fleet Deck / Paper execution</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-5xl">
            Run a fleet with separated risk.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-2 sm:text-base">
            Assign capital across up to five paper-trading cats, then follow their live windows and equity history.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 py-2 text-xs text-text-2">
            <Broadcast aria-hidden="true" className={marketStatus === "ready" ? "text-buy" : "text-brand"} size={15} weight="fill" />
            <span>{marketStatus === "ready" ? `${markets.length} live windows` : marketStatus === "loading" ? "Loading markets" : "Feed unavailable"}</span>
          </div>
          <Link href="/leaderboard" className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-3.5 text-xs font-semibold text-text-1 transition-colors duration-150 hover:border-brand/60 hover:text-brand">
            Open board
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] min-w-0 space-y-3 px-4 pb-8 sm:px-6 lg:px-8">
        <section aria-labelledby="fleet-overview-heading" className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
          <Panel>
            <p className="text-[10px] uppercase tracking-[0.16em] text-text-3">Bankroll</p>
            <label htmlFor="fleet-bankroll" className="sr-only">Fleet bankroll in tUSDC</label>
            <div className="mt-2 flex items-center gap-2">
              <input id="fleet-bankroll" type="number" min={100} step={100} value={bankroll} onChange={(event) => setBankroll(Math.max(100, Number(event.target.value) || 100))} className="num min-h-11 min-w-0 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-2 text-lg font-semibold text-text-1 outline-none focus:border-brand" />
              <span className="num text-[10px] text-text-3">tUSDC</span>
            </div>
          </Panel>
          <Panel>
            <p className="text-[10px] uppercase tracking-[0.16em] text-text-3">Paper equity</p>
            <p className={`num mt-3 text-xl font-semibold ${summary.equity >= 0 ? "text-buy" : "text-sell"}`}>{summary.equity >= 0 ? "+" : ""}{summary.equity.toFixed(2)}</p>
          </Panel>
          <Panel>
            <p className="text-[10px] uppercase tracking-[0.16em] text-text-3">Trades</p>
            <p className="num mt-3 text-xl font-semibold text-text-1">{summary.trades}</p>
            <p className="num mt-1 text-[11px] text-text-3">{summary.wins}W / {summary.losses}L</p>
          </Panel>
          <Panel>
            <p className="text-[10px] uppercase tracking-[0.16em] text-text-3">Fleet status</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text-1">{running ? "Running" : "Paused"}</p>
              <button type="button" aria-pressed={running} disabled={!cats.length} onClick={() => setRunning((current) => !current)} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-3 text-xs font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${running ? "bg-sell/[0.14] text-sell hover:bg-sell/[0.22]" : "bg-brand text-brand-ink hover:bg-brand-strong"}`}>
                {running ? <Stop aria-hidden="true" size={14} weight="fill" /> : <Play aria-hidden="true" size={14} weight="fill" />}
                {running ? "Stop" : "Deploy"}
              </button>
            </div>
          </Panel>
        </section>

        <section aria-labelledby="fleet-overview-heading" className="min-w-0">
          <div className="flex flex-col gap-3 border-b border-line pb-4 pt-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-kicker">Fleet overview</p>
              <h2 id="fleet-overview-heading" className="mt-2 text-xl font-semibold">Your paper-trading pack</h2>
            </div>
            <p className="num text-xs text-text-3">{cats.length}/{MAX_CATS} cats / {allocUsed}% allocated</p>
          </div>

          {!storageReady ? (
            <div className="mt-3 flex min-h-32 items-center justify-center gap-2 rounded-[var(--radius-panel)] border border-line bg-surface-1 text-xs text-text-2">
              <CircleNotch aria-hidden="true" className="animate-spin text-brand" size={17} />
              Loading saved fleet
            </div>
          ) : cats.length === 0 ? (
            <div className="mt-3 flex min-h-40 flex-col items-center justify-center gap-2 rounded-[var(--radius-panel)] border border-dashed border-line bg-surface-1 px-5 text-center">
              <UsersThree aria-hidden="true" className="text-brand" size={24} weight="regular" />
              <h3 className="text-sm font-semibold">No cats deployed</h3>
              <p className="max-w-md text-xs leading-5 text-text-2">Choose a persona and live market below to create your first paper-trading cat.</p>
            </div>
          ) : null}

          <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {cats.map((cat) => {
              const book = liveData[cat.slot]?.book ?? null;
              const equity = catEquity(cat, book, bankroll);
              const position = cat.sim.position;
              const publishState = published[cat.slot];
              return (
                <article key={cat.slot} className="surface-shell min-w-0">
                  <div className="surface-frame min-w-0 p-3">
                    <div className="flex items-center gap-2">
                      <CatGlyph accent={cat.accent} />
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-text-1">{cat.name}</h3>
                        <p className="num text-[10px] uppercase tracking-[0.14em] text-text-3">{cat.archetype}</p>
                      </div>
                      <div className="ml-auto flex items-center gap-1">
                        <button type="button" onClick={() => void publishCat(cat)} disabled={publishState === "sending"} aria-label={publishState === "done" ? `Published ${cat.name} to board` : publishState === "fail" ? `Retry publishing ${cat.name}` : `Publish ${cat.name} to board`} className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[var(--radius-control)] transition-colors duration-150 disabled:cursor-wait disabled:opacity-50 ${publishState === "done" ? "text-buy" : publishState === "fail" ? "text-sell hover:bg-sell/[0.1]" : "text-text-3 hover:bg-surface-3 hover:text-brand"}`}>
                          {publishState === "sending" ? <CircleNotch aria-hidden="true" className="animate-spin" size={16} /> : publishState === "done" ? <Check aria-hidden="true" size={16} weight="bold" /> : publishState === "fail" ? <WarningCircle aria-hidden="true" size={16} weight="fill" /> : <UploadSimple aria-hidden="true" size={16} />}
                        </button>
                        <button type="button" onClick={() => removeCat(cat.slot)} aria-label={`Remove ${cat.name} from fleet`} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-text-3 transition-colors duration-150 hover:bg-sell/[0.1] hover:text-sell">
                          <Trash aria-hidden="true" size={16} />
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 truncate text-[11px] text-text-2">{marketLabel(markets.find((market) => market.id === cat.marketId))} <span className="num text-text-3">/ {cat.allocPct}%</span></p>
                    <div className="mt-3 rounded-[var(--radius-control)] border border-line bg-surface-1 px-2 py-1">
                      <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-text-3">Equity history</p>
                      <Spark accent={cat.accent} hist={cat.equityHist} />
                    </div>
                    <div className="mt-3 flex items-baseline justify-between gap-2">
                      <span className={`num text-sm font-semibold ${equity >= 0 ? "text-buy" : "text-sell"}`}>{equity >= 0 ? "+" : ""}{equity.toFixed(2)}</span>
                      <span className="num text-[10px] text-text-3">{cat.sim.trades}t / {cat.sim.wins}W</span>
                    </div>
                    <div className="mt-3 rounded-[var(--radius-control)] border border-line px-2 py-2 text-[11px]">
                      {position ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className={position.side === "YES" ? "text-buy" : "text-sell"}>{position.side}</span>
                          <span className="num text-right text-text-2">{fmtProb(position.entryPrice)} / {position.size} ctr / {Math.max(0, Math.round((now - position.openedAt) / 1000))}s</span>
                        </div>
                      ) : (
                        <span className="text-text-2">Scanning for a signal</span>
                      )}
                    </div>
                    {cat.sim.log[0] ? (
                      <p className="mt-2 break-words text-[10px] leading-4 text-text-3">
                        <span className="num">{new Date(cat.sim.log[0].ts).toLocaleTimeString("en-GB", { hour12: false })}</span> {cat.sim.log[0].action.toUpperCase()} / {cat.sim.log[0].detail}
                      </p>
                    ) : null}
                    {publishState === "done" ? <p className="mt-2 text-[10px] text-buy" role="status">Published to board</p> : publishState === "fail" ? <p className="mt-2 text-[10px] text-sell" role="alert">Publish failed. Try again.</p> : null}
                  </div>
                </article>
              );
            })}

            {cats.length < MAX_CATS && (
              <Panel className="border-dashed bg-surface-1/60">
                <div className="flex items-center gap-2 border-b border-line pb-3">
                  <FloppyDisk aria-hidden="true" className="text-brand" size={17} weight="regular" />
                  <div>
                    <h3 className="text-sm font-semibold">Deploy a cat</h3>
                    <p className="text-[10px] text-text-3">{cats.length}/{MAX_CATS} active</p>
                  </div>
                </div>
                {marketStatus === "error" ? (
                  <div className="mt-3 rounded-[var(--radius-control)] border border-sell/40 bg-sell/[0.06] p-3" role="alert">
                    <div className="flex items-start gap-2 text-xs text-sell"><WarningCircle aria-hidden="true" className="mt-0.5 shrink-0" size={15} weight="fill" /><span>{marketError}</span></div>
                    <button type="button" onClick={() => void refreshMarkets()} className="mt-3 min-h-11 cursor-pointer rounded-[var(--radius-control)] border border-sell/50 px-3 text-xs font-semibold text-sell hover:bg-sell/[0.1]">Try again</button>
                  </div>
                ) : marketStatus === "loading" ? (
                  <div className="mt-3 flex min-h-20 items-center justify-center gap-2 text-xs text-text-2"><CircleNotch aria-hidden="true" className="animate-spin text-brand" size={16} />Loading live markets</div>
                ) : markets.length === 0 ? (
                  <p className="mt-3 text-xs leading-5 text-text-2">No live market windows are available for a new cat.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label htmlFor="fleet-persona" className="mb-1.5 block text-xs text-text-2">Persona</label>
                      <select id="fleet-persona" value={draft.persona} onChange={(event) => setDraft((current) => ({ ...current, persona: Number(event.target.value) }))} className="min-h-11 w-full cursor-pointer rounded-[var(--radius-control)] border border-line bg-surface-1 px-2 text-xs outline-none focus:border-brand">
                        {TEMPLATES.map((template, index) => <option key={template.archetype} value={index}>{template.cat} / {template.archetype}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="fleet-market" className="mb-1.5 block text-xs text-text-2">Target market</label>
                      <select id="fleet-market" value={draft.marketId} onChange={(event) => setDraft((current) => ({ ...current, marketId: event.target.value }))} className="min-h-11 w-full cursor-pointer rounded-[var(--radius-control)] border border-line bg-surface-1 px-2 text-xs outline-none focus:border-brand">
                        {markets.map((market) => <option key={market.id} value={market.id}>{marketLabel(market)}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2"><label htmlFor="fleet-capital" className="text-xs text-text-2">Capital share</label><span className="num text-xs text-text-1">{draft.allocPct}% / {((draft.allocPct / 100) * bankroll).toFixed(0)} tUSDC</span></div>
                      <input id="fleet-capital" type="range" min={5} max={draftMaxAlloc} step={5} value={Math.min(draft.allocPct, draftMaxAlloc)} onChange={(event) => setDraft((current) => ({ ...current, allocPct: Number(event.target.value) }))} className="mt-2 min-h-11 w-full cursor-pointer accent-brand" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2"><label htmlFor="fleet-order-size" className="text-xs text-text-2">Order size</label><span className="num text-xs text-text-1">{draft.orderSize} ctr</span></div>
                      <input id="fleet-order-size" type="range" min={1} max={50} step={1} value={draft.orderSize} onChange={(event) => setDraft((current) => ({ ...current, orderSize: Number(event.target.value) }))} className="mt-2 min-h-11 w-full cursor-pointer accent-brand" />
                    </div>
                    <button type="button" onClick={deployCat} disabled={!draft.marketId || remainingAlloc < 5} className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand px-3 text-xs font-semibold text-brand-ink transition-colors duration-150 hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40">
                      <UsersThree aria-hidden="true" size={15} weight="fill" />
                      Add to fleet
                    </button>
                    {draftError ? <p className="text-xs leading-5 text-sell" role="alert">{draftError}</p> : null}
                  </div>
                )}
              </Panel>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11px] text-text-3">
            <Broadcast aria-hidden="true" className="text-buy" size={13} weight="fill" />
            <span>Each cat paper-trades its own live window through WebSocket data.</span>
            <span>Fleet settings persist locally.</span>
          </div>
        </section>
      </main>
    </div>
  );
}
