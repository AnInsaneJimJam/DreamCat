"use client";

import { Info, Plus, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import StrategyParamFields, { Slider } from "@/components/StrategyParamFields";
import type { FleetCat } from "@/lib/fleet";
import type { Archetype, SimState, StrategyParams } from "@/lib/strategy";

const fmtProb = (n: number) => `${(n * 100).toFixed(1)}%`;

function EquityChart({ hist, accent }: { hist: number[]; accent: string }) {
  if (hist.length < 2) {
    return (
      <div className="flex h-32 items-center justify-center rounded-[var(--radius-control)] border border-dashed border-line text-xs text-text-3">
        Equity history appears once the fleet has run for a few ticks.
      </div>
    );
  }
  const min = Math.min(...hist, 0);
  const max = Math.max(...hist, 0.001);
  const range = max - min || 1;
  const y = (value: number) => 96 - ((value - min) / range) * 88 - 4;
  const points = hist.map((value, index) => `${(index / (hist.length - 1)) * 100},${y(value)}`);
  const zero = y(0);
  const last = hist[hist.length - 1];
  return (
    <div className="rounded-[var(--radius-control)] border border-line bg-surface-1 p-2">
      <div className="flex items-baseline justify-between gap-2 pb-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-text-3">Equity history</span>
        <span className={`num text-xs font-semibold ${last >= 0 ? "text-buy" : "text-sell"}`}>
          {last >= 0 ? "+" : ""}{last.toFixed(2)} tUSDC
        </span>
      </div>
      <svg aria-hidden="true" className="h-32 w-full" preserveAspectRatio="none" viewBox="0 0 100 96">
        <line stroke="currentColor" className="text-line" strokeDasharray="2 2" strokeWidth="0.5" x1="0" x2="100" y1={zero} y2={zero} />
        <polyline fill="none" points={points.join(" ")} stroke={accent} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex items-center justify-between pt-1">
        <span className="num text-[10px] text-text-3">{min.toFixed(2)}</span>
        <span className="num text-[10px] text-text-3">{hist.length} ticks</span>
        <span className="num text-[10px] text-text-3">{max.toFixed(2)}</span>
      </div>
    </div>
  );
}

function StatTiles({ sim }: { sim: SimState }) {
  const position = sim.position;
  const quotes = sim.quotes;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-[var(--radius-control)] border border-line bg-surface-1 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-text-3">Realized</p>
          <p className={`num mt-0.5 text-base font-semibold ${sim.realizedPnl >= 0 ? "text-buy" : "text-sell"}`}>
            {sim.realizedPnl >= 0 ? "+" : ""}{sim.realizedPnl.toFixed(2)}
          </p>
        </div>
        <div className="rounded-[var(--radius-control)] border border-line bg-surface-1 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-text-3">Trades</p>
          <p className="num mt-0.5 text-base font-semibold text-text-1">{sim.trades}</p>
        </div>
        <div className="rounded-[var(--radius-control)] border border-line bg-surface-1 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-text-3">Record</p>
          <p className="num mt-0.5 text-base font-semibold text-text-1">{sim.wins}W / {sim.trades - sim.wins}L</p>
        </div>
        <div className="rounded-[var(--radius-control)] border border-line bg-surface-1 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-text-3">Hit rate</p>
          <p className="num mt-0.5 text-base font-semibold text-text-1">
            {sim.trades === 0 ? "—" : `${Math.round((sim.wins / sim.trades) * 100)}%`}
          </p>
        </div>
      </div>
      <div className="rounded-[var(--radius-control)] border border-line bg-surface-1 px-2.5 py-2 text-xs">
        {position ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`font-semibold ${position.side === "YES" ? "text-buy" : "text-sell"}`}>
              Holding {position.side}
            </span>
            <span className="num text-text-2">{fmtProb(position.entryPrice)} entry · {position.size} contracts</span>
          </div>
        ) : quotes?.bid || quotes?.ask ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-brand">Resting quotes</span>
            <span className="num text-text-2">
              bid {quotes.bid ? fmtProb(quotes.bid.price) : "—"} · ask {quotes.ask ? fmtProb(quotes.ask.price) : "—"}
            </span>
          </div>
        ) : (
          <span className="text-text-2">Flat. Scanning for a signal.</span>
        )}
      </div>
    </div>
  );
}

function ActivityLog({ sim }: { sim: SimState }) {
  return (
    <div className="flex min-h-0 flex-col rounded-[var(--radius-control)] border border-line bg-surface-1">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-line px-2.5 py-2">
        <h3 className="text-[10px] uppercase tracking-[0.14em] text-text-3">Activity log</h3>
        <span className="num text-[10px] text-text-3">
          {sim.log.length === 0 ? "no entries" : `${sim.log.length} ${sim.log.length === 1 ? "entry" : "entries"}`}
        </span>
      </div>
      {sim.log.length === 0 ? (
        <p className="px-2.5 py-6 text-center text-[11px] text-text-3">
          No activity recorded yet. Entries appear as the cat quotes, fills and exits.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {sim.log.map((entry, index) => (
            <li key={`${entry.ts}-${index}`} className="flex gap-2 px-2.5 py-2 text-[11px] leading-5">
              <span className="num shrink-0 text-text-3">
                {new Date(entry.ts).toLocaleTimeString("en-GB", { hour12: false })}
              </span>
              <span className={`shrink-0 font-semibold ${entry.action === "open" ? "text-buy" : entry.action === "close" ? "text-sell" : "text-text-3"}`}>
                {entry.action.toUpperCase()}
              </span>
              <span className="min-w-0 break-words text-text-2">{entry.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface CatConfigModalProps {
  mode: "create" | "edit";
  catName: string;
  archetype: Archetype;
  blurb: string;
  accent: string;
  marketLabel: string;
  initialParams: StrategyParams;
  initialAllocPct: number;
  maxAllocPct: number;
  cat?: FleetCat;
  running?: boolean;
  live?: boolean;
  onSubmit: (params: StrategyParams, allocPct: number) => void;
  onClose: () => void;
}

export default function CatConfigModal({
  mode,
  catName,
  archetype,
  blurb,
  accent,
  marketLabel,
  initialParams,
  initialAllocPct,
  maxAllocPct,
  cat,
  running = false,
  live = false,
  onSubmit,
  onClose,
}: CatConfigModalProps) {
  const [params, setParams] = useState<StrategyParams>(initialParams);
  const [allocPct, setAllocPct] = useState(Math.min(initialAllocPct, Math.max(5, maxAllocPct)));
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const focus = setTimeout(() => closeRef.current?.focus(), 0);
    return () => clearTimeout(focus);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = useCallback(() => {
    onSubmit(params, allocPct);
  }, [onSubmit, params, allocPct]);

  const dirty =
    mode === "edit" &&
    (allocPct !== initialAllocPct || JSON.stringify(params) !== JSON.stringify(initialParams));

  const detail = mode === "edit" && cat != null;

  const parameters = (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Info aria-hidden="true" className="text-brand" size={15} />
        <h3 className="text-sm font-semibold">Parameters</h3>
      </div>
      <StrategyParamFields archetype={archetype} idPrefix="cat-modal-" params={params} onChange={setParams} />
      <Slider
        id="cat-modal-alloc"
        label="Capital share"
        value={Math.min(allocPct, Math.max(5, maxAllocPct))}
        min={5}
        max={Math.max(5, maxAllocPct)}
        step={5}
        format={(value) => `${value}%`}
        onChange={setAllocPct}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cat-config-title"
        className={`surface-shell max-h-[92dvh] w-full overflow-hidden sm:max-h-[88dvh] ${detail ? "max-w-5xl" : "max-w-lg"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="surface-frame flex max-h-[92dvh] flex-col sm:max-h-[88dvh]">
          <div className="flex items-start gap-3 border-b border-line p-4">
            <span aria-hidden="true" className="mt-1 h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
            <div className="min-w-0 flex-1">
              <h2 id="cat-config-title" className="truncate text-lg font-semibold leading-tight text-text-1">{catName}</h2>
              <p className="num text-[10px] uppercase tracking-[0.14em] text-text-3">{archetype}</p>
              <p className="mt-1 truncate text-[11px] text-text-2">{marketLabel}</p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text-1"
            >
              <X aria-hidden="true" size={17} />
            </button>
          </div>

          {detail ? (
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:overflow-hidden">
              <div className="min-w-0 space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
                <EquityChart accent={accent} hist={cat.equityHist} />
                <StatTiles sim={cat.sim} />
                <div className="border-t border-line pt-4">{parameters}</div>
              </div>
              <div className="flex min-h-[16rem] min-w-0 flex-col lg:min-h-0">
                <ActivityLog sim={cat.sim} />
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <p className="rounded-[var(--radius-control)] border border-line bg-surface-1 px-2.5 py-2 text-xs leading-5 text-text-2">
                {blurb}
              </p>
              <div className="border-t border-line pt-3">{parameters}</div>
            </div>
          )}

          <div className="flex shrink-0 flex-col gap-2 border-t border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-4 text-text-3">
              {mode === "create"
                ? "The cat starts flat and begins paper-trading when the fleet runs."
                : !running
                  ? "The fleet is paused, so the new values are saved and take effect when you deploy."
                  : live
                    ? cat?.sim.position
                      ? "Applying changes sells this position on chain first, then restarts the cat on the new values."
                      : "Applying changes pulls any resting orders and restarts this cat on the new values."
                    : "Applying changes flattens any open position at the current mark and restarts this cat on the new values."}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 cursor-pointer rounded-[var(--radius-control)] border border-line-strong px-3 text-xs font-semibold text-text-2 transition-colors duration-150 hover:text-text-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={mode === "edit" && !dirty}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] bg-brand px-3.5 text-xs font-semibold text-brand-ink transition-colors duration-150 hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
              >
                {mode === "create" ? <Plus aria-hidden="true" size={14} weight="bold" /> : null}
                {mode === "create" ? "Add to fleet" : "Apply changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
