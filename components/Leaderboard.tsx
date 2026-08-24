"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowClockwise,
  ArrowUpRight,
  Check,
  CircleNotch,
  Database,
  Trophy,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import AppChrome from "@/components/AppChrome";
import { TEMPLATES } from "@/lib/strategy";
import type { LeaderboardEntry } from "@/lib/store";
import { useNow } from "@/lib/use-now";

type SortKey = "pnl" | "trades" | "winRate" | "age";
type LoadState = "loading" | "ready" | "error";

const fmtProb = (n: number) => `${(n * 100).toFixed(1)}%`;

function ageLabel(ts: number, now: number) {
  const minutes = Math.max(0, Math.round((now - ts) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function pnlLabel(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} tUSDC`;
}

function sortLabel(key: SortKey) {
  if (key === "pnl") return "PnL";
  if (key === "trades") return "Trades";
  if (key === "winRate") return "Win rate";
  return "Newest";
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`surface-shell min-w-0 ${className}`}>
      <div className="surface-frame min-w-0 overflow-hidden">{children}</div>
    </section>
  );
}

function CloneButton({ cloned, onClone }: { cloned: boolean; onClone: () => void }) {
  return (
    <button
      type="button"
      onClick={onClone}
      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong bg-surface-3 px-3 text-[11px] font-semibold text-brand transition-colors duration-150 hover:border-brand hover:bg-brand/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 md:min-h-9"
    >
      {cloned ? <Check aria-hidden="true" size={14} weight="bold" /> : <ArrowUpRight aria-hidden="true" size={14} weight="bold" />}
      {cloned ? "Cloned" : "Clone"}
    </button>
  );
}

function FeedState({ state, entries, onRetry }: { state: LoadState; entries: LeaderboardEntry[]; onRetry: () => void }) {
  if (state === "loading") {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center gap-2 px-5 text-center" role="status" aria-live="polite">
        <CircleNotch className="animate-spin text-brand" aria-hidden="true" size={20} />
        <p className="text-xs text-text-2">Loading published runs</p>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-5 text-center" role="alert">
        <WarningCircle className="text-sell" aria-hidden="true" size={22} />
        <div>
          <p className="text-xs font-semibold text-text-1">Leaderboard unavailable</p>
          <p className="pt-1 text-[11px] text-text-2">The registry did not respond. Your fleet runs are still safe.</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong px-3 text-[11px] font-semibold text-text-1 transition-colors hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 md:min-h-9"
        >
          <ArrowClockwise aria-hidden="true" size={14} />
          Retry
        </button>
      </div>
    );
  }
  if (!entries.length) {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-5 text-center" role="status">
        <Trophy className="text-text-3" aria-hidden="true" size={24} />
        <div>
          <p className="text-xs font-semibold text-text-1">No published runs yet</p>
          <p className="pt-1 text-[11px] text-text-2">Deploy a cat in Fleet, run it, then publish the result here.</p>
        </div>
        <Link
          href="/fleet"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] bg-brand px-3 text-[11px] font-semibold text-brand-ink transition-colors hover:bg-brand-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 md:min-h-9"
        >
          Open Fleet
          <ArrowUpRight aria-hidden="true" size={14} weight="bold" />
        </Link>
      </div>
    );
  }
  return null;
}

function EntryMeta({ entry, now }: { entry: LeaderboardEntry; now: number }) {
  const winRate = entry.trades ? entry.wins / entry.trades : null;
  return (
    <>
      <span className="text-text-2">{entry.marketLabel || "Market window unavailable"}</span>
      <span className="text-text-3">{entry.archetype}</span>
      <span className="num text-text-3">{ageLabel(entry.publishedAt, now)} old</span>
      {winRate != null && <span className="num text-text-3">{fmtProb(winRate)} wins</span>}
    </>
  );
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [mode, setMode] = useState<string>("local");
  const [cloned, setCloned] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("pnl");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const now = useNow(5000);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!res.ok) throw new Error("Leaderboard request failed");
      const json = (await res.json()) as { mode?: string; entries?: LeaderboardEntry[] };
      if (!Array.isArray(json.entries)) throw new Error("Leaderboard response was invalid");
      setEntries(json.entries);
      setMode(json.mode ?? "local");
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    const kick = setTimeout(load, 0);
    const refresh = setInterval(load, 5000);
    return () => {
      clearTimeout(kick);
      clearInterval(refresh);
    };
  }, [load]);

  const sortedEntries = useMemo(() => {
    const next = [...entries];
    next.sort((a, b) => {
      if (sortKey === "trades") return b.trades - a.trades || b.pnl - a.pnl;
      if (sortKey === "winRate") {
        const aRate = a.trades ? a.wins / a.trades : 0;
        const bRate = b.trades ? b.wins / b.trades : 0;
        return bRate - aRate || b.pnl - a.pnl;
      }
      if (sortKey === "age") return b.publishedAt - a.publishedAt;
      return b.pnl - a.pnl || b.publishedAt - a.publishedAt;
    });
    return next;
  }, [entries, sortKey]);

  const summary = useMemo(() => {
    const best = sortedEntries[0]?.pnl ?? 0;
    const totalTrades = entries.reduce((sum, entry) => sum + entry.trades, 0);
    const totalWins = entries.reduce((sum, entry) => sum + entry.wins, 0);
    return { best, totalTrades, winRate: totalTrades ? totalWins / totalTrades : null };
  }, [entries, sortedEntries]);

  const clone = useCallback((entry: LeaderboardEntry) => {
    const template = TEMPLATES.find((item) => item.archetype === entry.archetype) ?? TEMPLATES[0];
    const cat = {
      slot: Date.now() % 100000,
      name: entry.catName,
      accent: "#f2b84b",
      archetype: template.archetype,
      params: { ...template.defaults, ...entry.params },
      marketId: "",
      allocPct: 20,
      sim: { position: null, realizedPnl: entry.pnl, trades: entry.trades, wins: entry.wins, log: [] },
      equityHist: [],
    };
    try {
      localStorage.setItem("dreamcat-pending-clone", JSON.stringify(cat));
    } catch {}
    setCloned(entry.id);
  }, []);

  return (
    <div className="min-h-dvh min-w-0 overflow-x-hidden bg-canvas pb-24 md:pb-0">
      <AppChrome current="leaderboard" />
      <main className="mx-auto min-w-0 max-w-[1440px] space-y-5 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <header className="flex min-w-0 flex-col justify-between gap-5 border-b border-line pb-6 md:flex-row md:items-end">
          <div className="min-w-0">
            <p className="section-kicker">Shared performance registry</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.045em] text-text-1 sm:text-5xl">Leaderboard</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-2">Compare published paper-trading runs, then send a proven strategy back to your fleet.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px] text-text-2">
            <Database aria-hidden="true" size={15} className="text-brand" />
            <span>{mode === "upstash" ? "Shared registry" : "Local demo registry"}</span>
          </div>
        </header>

        <Panel>
          <div className="grid grid-cols-2 divide-x divide-line border-b border-line sm:grid-cols-4">
            <div className="min-w-0 px-4 py-3 sm:px-5"><p className="section-kicker">Published</p><p className="num mt-1 text-xl font-semibold text-text-1">{entries.length}</p><p className="mt-0.5 text-[10px] text-text-3">top runs shown</p></div>
            <div className="min-w-0 px-4 py-3 sm:px-5"><p className="section-kicker">Best PnL</p><p className={`num mt-1 text-xl font-semibold ${summary.best >= 0 ? "text-buy" : "text-sell"}`}>{pnlLabel(summary.best)}</p><p className="mt-0.5 text-[10px] text-text-3">current ranking</p></div>
            <div className="min-w-0 px-4 py-3 sm:px-5"><p className="section-kicker">Win rate</p><p className="num mt-1 text-xl font-semibold text-text-1">{summary.winRate == null ? "Unavailable" : fmtProb(summary.winRate)}</p><p className="mt-0.5 text-[10px] text-text-3">across published trades</p></div>
            <div className="min-w-0 px-4 py-3 sm:px-5"><p className="section-kicker">Trade count</p><p className="num mt-1 text-xl font-semibold text-text-1">{summary.totalTrades}</p><p className="mt-0.5 text-[10px] text-text-3">paper executions</p></div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2 text-[11px] text-text-2"><UsersThree aria-hidden="true" size={15} className="text-brand" /><span>Ranked by {sortLabel(sortKey).toLowerCase()}</span></div>
            <div className="flex min-w-0 flex-wrap gap-1" role="group" aria-label="Leaderboard sort">
              {(["pnl", "trades", "winRate", "age"] as SortKey[]).map((key) => (
                <button key={key} type="button" onClick={() => setSortKey(key)} aria-pressed={sortKey === key} className={`min-h-11 rounded-[var(--radius-control)] px-3 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 md:min-h-9 ${sortKey === key ? "bg-brand text-brand-ink" : "text-text-2 hover:bg-surface-3 hover:text-text-1"}`}>
                  {sortLabel(key)}
                </button>
              ))}
            </div>
          </div>

          {loadState !== "ready" || !sortedEntries.length ? (
            <FeedState state={loadState} entries={sortedEntries} onRetry={load} />
          ) : (
            <>
              <div className="hidden min-w-0 overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-left text-xs" aria-label="Published strategy leaderboard">
                  <thead><tr className="border-b border-line text-[10px] uppercase tracking-[0.16em] text-text-3"><th scope="col" className="px-5 py-3 font-medium">Rank</th><th scope="col" className="px-3 py-3 font-medium">Cat</th><th scope="col" className="px-3 py-3 font-medium">Window</th><th scope="col" className="px-3 py-3 text-right font-medium">PnL</th><th scope="col" className="px-3 py-3 text-right font-medium">Trades</th><th scope="col" className="px-3 py-3 text-right font-medium">Win rate</th><th scope="col" className="px-3 py-3 text-right font-medium">Age</th><th scope="col" className="px-5 py-3 text-right font-medium">Action</th></tr></thead>
                  <tbody>
                    {sortedEntries.map((entry, index) => {
                      const winRate = entry.trades ? entry.wins / entry.trades : null;
                      return <tr key={entry.id} className="h-14 border-b border-line transition-colors hover:bg-surface-1"><td className="num px-5 py-3 text-text-3">{String(index + 1).padStart(2, "0")}</td><td className="px-3 py-3"><div className="font-semibold text-text-1">{entry.catName}</div><div className="pt-0.5 text-[10px] text-text-3">{entry.archetype}</div></td><td className="max-w-[220px] truncate px-3 py-3 text-text-2">{entry.marketLabel || "Market window unavailable"}</td><td className={`num px-3 py-3 text-right font-semibold ${entry.pnl >= 0 ? "text-buy" : "text-sell"}`}>{pnlLabel(entry.pnl)}</td><td className="num px-3 py-3 text-right text-text-2">{entry.trades}</td><td className="num px-3 py-3 text-right text-text-2">{winRate == null ? "Unavailable" : fmtProb(winRate)}</td><td className="num px-3 py-3 text-right text-text-3">{ageLabel(entry.publishedAt, now)}</td><td className="px-5 py-3 text-right"><CloneButton cloned={cloned === entry.id} onClone={() => clone(entry)} /></td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-line md:hidden" aria-label="Published strategy leaderboard cards">
                {sortedEntries.map((entry, index) => {
                  const winRate = entry.trades ? entry.wins / entry.trades : null;
                  return <article key={entry.id} className="min-w-0 px-4 py-4 sm:px-5"><div className="flex min-w-0 items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="num pt-0.5 text-[11px] text-text-3">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-text-1">{entry.catName}</h2><div className="flex flex-wrap gap-x-2 gap-y-1 pt-1 text-[10px]"><EntryMeta entry={entry} now={now} /></div></div></div><CloneButton cloned={cloned === entry.id} onClone={() => clone(entry)} /></div><dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-[10px]"><div><dt className="text-text-3">PnL</dt><dd className={`num pt-1 font-semibold ${entry.pnl >= 0 ? "text-buy" : "text-sell"}`}>{pnlLabel(entry.pnl)}</dd></div><div><dt className="text-text-3">Trades</dt><dd className="num pt-1 text-text-1">{entry.trades}</dd></div><div><dt className="text-text-3">Win rate</dt><dd className="num pt-1 text-text-1">{winRate == null ? "Unavailable" : fmtProb(winRate)}</dd></div></dl></article>;
                })}
              </div>
            </>
          )}
        </Panel>
        <p className="px-1 text-[11px] leading-5 text-text-3">Clone writes the strategy config into Fleet Deck. Review the target market and capital allocation before deploying.</p>
      </main>
    </div>
  );
}
