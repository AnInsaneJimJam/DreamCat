"use client";

import {
  ArrowRight,
  Binoculars,
  Check,
  ClipboardText,
  DownloadSimple,
  Flask,
  Gauge,
  LockKey,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Strategy,
  Target,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AppChrome from "@/components/AppChrome";
import {
  BOT_CONFIG_VERSION,
  DEFAULT_RISK_LIMITS,
  STRATEGY_TEMPLATES,
  botConfigHash,
  defaultBotConfig,
  exportBotEnv,
  serializeBotConfig,
  validateBotConfig,
  type BotBuilderDraft,
  type BotConfig,
  type BotConfigIssue,
  type BotMarketType,
  type BotMode,
  type BotNetwork,
  type GlobalRiskLimits,
  type StrategyId,
} from "@/lib/bot-builder";
import { listLiveMarkets, type LiveMarketRow } from "@/lib/dreamdex";

const STORAGE_KEY = "dreamcat-bot-draft-v1";

const STRATEGY_NOTES: Record<StrategyId, { group: string; edge: string; regime: string; risk: string }> = {
  starter: { group: "Quote", edge: "Two-sided baseline", regime: "Orderly books", risk: "Adverse selection" },
  "market-maker": { group: "Quote", edge: "Spread and inventory skew", regime: "Stable two-way flow", risk: "One-way repricing" },
  grid: { group: "Capture", edge: "Repeated range capture", regime: "Mean-reverting probability", risk: "Trend through the grid" },
  "mean-reversion": { group: "Capture", edge: "Fade stretched probability", regime: "Overreaction and repair", risk: "A justified regime shift" },
  momentum: { group: "Follow", edge: "Tape and price agreement", regime: "Directional repricing", risk: "Late entry or reversal" },
  twap: { group: "Schedule", edge: "Lower timing concentration", regime: "Planned execution", risk: "Trading through deterioration" },
  ensemble: { group: "Blend", edge: "Signal agreement", regime: "Mixed observable flow", risk: "Correlated bad inputs" },
};

const RISK_FIELDS = [
  ["maxCapital", "Capital ceiling", "tUSDC", 1, 1000000, 1],
  ["maxPosition", "Position ceiling", "contracts", 1, 100000, 1],
  ["maxConcurrentPositions", "Concurrent positions", "bots", 1, 100, 1],
  ["maxLoss", "Session loss stop", "tUSDC", 1, 100000, 1],
  ["maxDrawdownPct", "Drawdown stop", "%", 0.1, 100, 0.1],
  ["expiryHeadroomSec", "Stop before expiry", "sec", 0, 604800, 1],
  ["cooldownSec", "Cooldown after exit", "sec", 0, 604800, 1],
] as const;

const PLAYBOOK_ORDER: StrategyId[] = ["starter", "market-maker", "grid", "mean-reversion", "momentum", "twap", "ensemble"];

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`surface-shell min-w-0 ${className}`}><div className="surface-frame min-w-0 p-3.5">{children}</div></div>;
}

function SectionTitle({ index, icon, title, copy }: { index: string; icon: ReactNode; title: string; copy: string }) {
  return <div className="flex items-start gap-3 border-b border-line pb-3"><span className="num mt-0.5 text-[10px] text-brand">{index}</span><span className="mt-0.5 text-brand">{icon}</span><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-0.5 text-[11px] leading-4 text-text-3">{copy}</p></div></div>;
}

function issueFor(issues: readonly BotConfigIssue[], path: string) {
  return issues.find((issue) => issue.path === path)?.message;
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-[11px] leading-4 text-sell">{message}</p> : null;
}

function marketLabel(market: LiveMarketRow) {
  const level = market.kind === "ladder" ? `above $${market.strikeLabel}` : "above open";
  return `${market.asset} ${level} · ${market.windowLabel || market.interval}`;
}

function restoreDraft(value: unknown): BotBuilderDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const strategy = STRATEGY_TEMPLATES.find((item) => item.id === candidate.strategy)?.id;
  if (!strategy || candidate.version !== BOT_CONFIG_VERSION) return null;
  const base = defaultBotConfig(strategy, "event");
  const params = candidate.params && typeof candidate.params === "object" && !Array.isArray(candidate.params) ? candidate.params as Record<string, unknown> : {};
  const risk = candidate.risk && typeof candidate.risk === "object" && !Array.isArray(candidate.risk) ? candidate.risk as Record<string, unknown> : {};
  const market = candidate.market && typeof candidate.market === "object" && !Array.isArray(candidate.market) ? candidate.market as Record<string, unknown> : {};
  const template = STRATEGY_TEMPLATES.find((item) => item.id === strategy)!;
  const safeParams = Object.fromEntries(template.fields.map((field) => [field.key, typeof params[field.key] === "number" ? params[field.key] : (base.params as unknown as Record<string, number>)[field.key]]));
  const safeRisk = Object.fromEntries(Object.entries(DEFAULT_RISK_LIMITS).map(([key, fallback]) => [key, typeof risk[key] === "number" ? risk[key] : fallback])) as unknown as GlobalRiskLimits;
  return {
    ...base,
    name: typeof candidate.name === "string" ? candidate.name.slice(0, 60) : base.name,
    params: safeParams as unknown as BotConfig["params"],
    risk: safeRisk,
    marketType: candidate.marketType === "spot" ? "spot" : "event",
    network: candidate.network === "mainnet" ? "mainnet" : "testnet",
    mode: candidate.mode === "live" ? "live" : "dry-run",
    market: {
      ...(candidate.marketType === "spot"
        ? {
          symbol: typeof market.symbol === "string" ? market.symbol.slice(0, 160) : "",
          ...(typeof market.poolAddress === "string" ? { poolAddress: market.poolAddress.slice(0, 42) } : {}),
        }
        : {
          marketId: typeof market.marketId === "string" ? market.marketId.slice(0, 66) : "",
          outcome: market.outcome === "NO" || market.outcome === "BOTH" ? market.outcome : "YES",
          ...(typeof market.symbol === "string" ? { symbol: market.symbol.slice(0, 160) } : {}),
        }),
    },
  };
}

export default function BotBuilder() {
  const [draft, setDraft] = useState<BotBuilderDraft>(() => defaultBotConfig("grid", "event"));
  const [markets, setMarkets] = useState<LiveMarketRow[]>([]);
  const [marketState, setMarketState] = useState<"loading" | "ready" | "error">("loading");
  const [advanced, setAdvanced] = useState(false);
  const [exportOpen, setExportOpen] = useState<"json" | "env" | null>(null);
  const [copyState, setCopyState] = useState<"json" | "env" | "error" | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    const kick = setTimeout(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const candidate = restoreDraft(JSON.parse(stored) as unknown);
          if (candidate) setDraft(candidate);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
      hydratedRef.current = true;
      setStorageReady(true);
    }, 0);
    return () => clearTimeout(kick);
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || !storageReady) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [draft, storageReady]);

  useEffect(() => {
    const kick = setTimeout(() => {
      void listLiveMarkets().then((rows) => {
        const executable = rows.filter((market) => market.executionReady !== false && (market.executionMode === "chain-pool" || Boolean(market.yesSymbol)));
        setMarkets(executable);
        setMarketState("ready");
        setDraft((current) => {
          const currentId = current.market && "marketId" in current.market ? current.market.marketId : "";
          if (current.marketType === "spot" || currentId || !executable[0]) return current;
          return { ...current, market: { marketId: executable[0].id, outcome: "YES", symbol: executable[0].yesSymbol } };
        });
      }).catch(() => setMarketState("error"));
    }, 0);
    return () => clearTimeout(kick);
  }, []);

  const strategy = draft.strategy ?? "grid";
  const marketType = draft.marketType ?? "event";
  const network = draft.network ?? "testnet";
  const mode = draft.mode ?? "dry-run";
  const template = useMemo(() => STRATEGY_TEMPLATES.find((item) => item.id === strategy) ?? STRATEGY_TEMPLATES[0], [strategy]);
  const issues = useMemo(() => validateBotConfig(draft), [draft]);
  const configReady = issues.length === 0;
  const rehearsalReady = configReady && network === "testnet" && mode === "dry-run";
  const currentMarketId = draft.market && "marketId" in draft.market ? draft.market.marketId : "";
  const currentOutcome = draft.market && "outcome" in draft.market ? draft.market.outcome : "YES";
  const currentSpotSymbol = draft.market && "symbol" in draft.market ? draft.market.symbol ?? "" : "";
  const currentPoolAddress = draft.market && "poolAddress" in draft.market ? draft.market.poolAddress ?? "" : "";
  const selectedMarket = markets.find((market) => market.id === currentMarketId);
  const basicFields = template.fields.filter((field) => !field.advanced);
  const advancedFields = template.fields.filter((field) => field.advanced);
  const configHash = useMemo(() => {
    if (!configReady) return "--------";
    try { return botConfigHash(draft); } catch { return "--------"; }
  }, [configReady, draft]);
  const capital = draft.risk?.maxCapital ?? 0;
  const positionShare = capital > 0 ? Math.min(999, ((draft.risk?.maxPosition ?? 0) / capital) * 100) : 0;
  const lossShare = capital > 0 ? Math.min(999, ((draft.risk?.maxLoss ?? 0) / capital) * 100) : 0;
  const readiness = [
    { label: "Strategy parameters", ready: !issues.some((issue) => issue.path.startsWith("params") || issue.path === "name") },
    { label: "Market target", ready: !issues.some((issue) => issue.path.startsWith("market")) },
    { label: "Risk envelope", ready: !issues.some((issue) => issue.path.startsWith("risk")) },
    { label: "Execution selection", ready: network === "testnet" && mode === "dry-run" },
  ];

  const selectStrategy = (id: StrategyId) => {
    const next = defaultBotConfig(id, "event");
    setDraft((current) => ({ ...next, name: `${STRATEGY_TEMPLATES.find((item) => item.id === id)?.name ?? "Bot"} / BTC-ETH`, marketType: current.marketType, market: current.market, network: current.network, mode: current.mode, risk: current.risk ?? { ...DEFAULT_RISK_LIMITS } }));
    setAdvanced(false);
  };
  const setParam = (key: string, value: number) => setDraft((current) => ({ ...current, params: { ...(current.params as object), [key]: value } as unknown as BotConfig["params"] }));
  const setRisk = (key: keyof GlobalRiskLimits, value: number) => setDraft((current) => ({ ...current, risk: { ...(current.risk ?? DEFAULT_RISK_LIMITS), [key]: value } }));
  const setMarket = (marketId: string) => {
    const market = markets.find((item) => item.id === marketId);
    setDraft((current) => ({ ...current, market: { marketId, outcome: current.market && "outcome" in current.market ? current.market.outcome : "YES", ...(market?.yesSymbol ? { symbol: market.yesSymbol } : {}) } }));
  };
  const setOutcome = (outcome: "YES" | "NO" | "BOTH") => setDraft((current) => ({ ...current, market: { marketId: current.market && "marketId" in current.market ? current.market.marketId : "", outcome, ...(current.market && "symbol" in current.market && current.market.symbol ? { symbol: current.market.symbol } : {}) } }));
  const setMarketType = (nextType: BotMarketType) => setDraft((current) => ({ ...current, marketType: nextType, market: nextType === "event" ? { marketId: "", outcome: "YES" } : { symbol: "" } }));
  const setNetwork = (nextNetwork: BotNetwork) => setDraft((current) => ({ ...current, network: nextNetwork }));
  const setMode = (nextMode: BotMode) => setDraft((current) => ({ ...current, mode: nextMode }));
  const exportText = useCallback((kind: "json" | "env") => {
    if (!configReady) return "";
    try { return kind === "json" ? serializeBotConfig(draft) : exportBotEnv(draft); } catch { return ""; }
  }, [configReady, draft]);
  const copyExport = async (kind: "json" | "env") => {
    const value = exportText(kind);
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(kind);
    } catch {
      setCopyState("error");
    }
    setTimeout(() => setCopyState(null), 1600);
  };
  const downloadExport = (kind: "json" | "env") => {
    const value = exportText(kind);
    if (!value) return;
    const href = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `dreamcat-${strategy}-${configHash}.${kind === "json" ? "json" : "env"}`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="min-h-dvh min-w-0 overflow-x-clip bg-canvas pb-24 text-text-1 md:pb-0">
      <AppChrome current="lab" />
      <header className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 pb-4 pt-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div><p className="section-kicker">Bot Lab / Strategy workbench</p><h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Shape the logic. Keep the limits in view.</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-text-2">Build a repeatable event-contract bot without surrendering a key or losing context between screens.</p></div>
        <div className="flex flex-wrap items-center gap-2"><span className="flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface-1 px-3 text-[11px] text-text-2"><span className={`h-1.5 w-1.5 rounded-full ${storageReady ? "bg-buy" : "bg-text-3"}`} />{storageReady ? "Draft saved locally" : "Loading draft"}</span><Link href="/fleet" className="flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-3 text-xs font-semibold hover:border-brand/60 hover:text-brand">Open Fleet<ArrowRight aria-hidden="true" size={14} /></Link></div>
      </header>

      <main id="main-content" className="mx-auto grid w-full max-w-[1600px] min-w-0 items-start gap-3 px-4 pb-10 sm:px-6 lg:px-8 xl:grid-cols-[220px_minmax(0,1fr)_330px]">
        <aside aria-label="Strategy playbook" className="min-w-0 xl:sticky xl:top-20">
          <Panel>
            <div className="flex items-center gap-2 border-b border-line pb-3"><Strategy aria-hidden="true" size={17} className="text-brand" /><div><p className="section-kicker">Playbook</p><p className="mt-1 text-xs text-text-2">Choose an operating idea</p></div></div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 xl:block xl:space-y-1">
              {PLAYBOOK_ORDER.map((id, index) => {
                const item = STRATEGY_TEMPLATES.find((candidate) => candidate.id === id)!;
                const selected = item.id === strategy;
                const notes = STRATEGY_NOTES[item.id];
                const newGroup = index === 0 || STRATEGY_NOTES[PLAYBOOK_ORDER[index - 1]].group !== notes.group;
                return <div key={item.id} className="shrink-0 xl:block">{newGroup ? <p className="hidden px-2 pb-1 pt-3 text-[9px] uppercase tracking-[0.18em] text-text-3 first:pt-1 xl:block">{notes.group}</p> : null}<button type="button" aria-pressed={selected} onClick={() => selectStrategy(item.id)} className={`relative min-h-14 w-44 rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors xl:w-full ${selected ? "border-brand/55 bg-brand/[0.08]" : "border-transparent hover:border-line hover:bg-surface-3"}`}><span className={`absolute inset-y-2 left-0 w-0.5 rounded-full ${selected ? "bg-brand" : "bg-transparent"}`} /><span className={`block text-xs font-semibold ${selected ? "text-brand" : "text-text-1"}`}>{item.name}</span><span className="mt-1 block truncate text-[10px] text-text-3">{notes.edge}</span></button></div>;
              })}
            </div>
            <div className="mt-3 border-t border-line pt-3"><p className="text-[9px] uppercase tracking-[0.16em] text-text-3">Best regime</p><p className="mt-1 text-[11px] leading-4 text-text-2">{STRATEGY_NOTES[strategy].regime}</p><p className="mt-3 text-[9px] uppercase tracking-[0.16em] text-text-3">Failure mode</p><p className="mt-1 text-[11px] leading-4 text-sell">{STRATEGY_NOTES[strategy].risk}</p></div>
          </Panel>
        </aside>

        <div className="min-w-0 space-y-3">
          <Panel>
            <SectionTitle index="01" icon={<Binoculars aria-hidden="true" size={17} />} title="Observe" copy="Define the market and contract exposure the bot is allowed to read." />
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2"><p className="text-xs text-text-2">Market surface</p><div className="mt-1.5 grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-line bg-surface-1 p-1">{(["event", "spot"] as const).map((type) => <button key={type} type="button" aria-pressed={marketType === type} onClick={() => setMarketType(type)} className={`min-h-10 rounded-[var(--radius-control)] text-xs font-semibold ${marketType === type ? "bg-surface-3 text-brand" : "text-text-3 hover:text-text-1"}`}>{type === "event" ? "Event contracts" : "Spot"}</button>)}</div></div>
              <label className="text-xs text-text-2"><span>Bot name</span><input type="text" value={draft.name ?? ""} maxLength={60} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-3 text-sm text-text-1 outline-none focus:border-brand" /><FieldError message={issueFor(issues, "name")} /></label>
              {marketType === "event" ? <><label className="text-xs text-text-2"><span>Indexed event window</span><select value={selectedMarket ? currentMarketId : ""} onChange={(event) => setMarket(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-3 text-sm text-text-1 outline-none focus:border-brand"><option value="">{marketState === "loading" ? "Loading markets..." : marketState === "error" ? "Market feed unavailable" : markets.length ? "Choose a market" : "No indexed windows available"}</option>{markets.map((market) => <option key={market.id} value={market.id}>{marketLabel(market)}</option>)}</select></label><label className="text-xs text-text-2 md:col-span-2"><span>On-chain market ID</span><input type="text" spellCheck="false" placeholder="0x... bytes32 market ID" value={currentMarketId} onChange={(event) => setMarket(event.target.value.trim())} className="num mt-1.5 min-h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-3 text-xs text-text-1 outline-none focus:border-brand" /><p className="mt-1 text-[10px] leading-4 text-text-3">Choose an indexed market or paste any DreamDEX market ID discovered on-chain.</p><FieldError message={issueFor(issues, "market.marketId")} /></label><div className="md:col-span-2"><p className="text-xs text-text-2">Outcome exposure</p><div className="mt-1.5 grid grid-cols-3 gap-1 rounded-[var(--radius-control)] border border-line bg-surface-1 p-1">{(["YES", "NO", "BOTH"] as const).map((outcome) => <button key={outcome} type="button" aria-pressed={currentOutcome === outcome} onClick={() => setOutcome(outcome)} className={`num min-h-10 rounded-[var(--radius-control)] text-xs font-semibold ${currentOutcome === outcome ? "bg-surface-3 text-brand" : "text-text-3 hover:text-text-1"}`}>{outcome}</button>)}</div><FieldError message={issueFor(issues, "market.outcome")} /></div></> : <><label className="text-xs text-text-2"><span>Spot symbol</span><input type="text" spellCheck="false" placeholder="SOM:USDso" value={currentSpotSymbol} onChange={(event) => setDraft((current) => ({ ...current, market: { symbol: event.target.value, ...(currentPoolAddress ? { poolAddress: currentPoolAddress } : {}) } }))} className="num mt-1.5 min-h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-3 text-sm text-text-1 outline-none focus:border-brand" /><FieldError message={issueFor(issues, "market.symbol")} /></label><label className="text-xs text-text-2 md:col-span-2"><span>Pool address <span className="text-text-3">optional</span></span><input type="text" spellCheck="false" placeholder="0x... pool address" value={currentPoolAddress} onChange={(event) => setDraft((current) => ({ ...current, market: { symbol: currentSpotSymbol, ...(event.target.value ? { poolAddress: event.target.value.trim() } : {}) } }))} className="num mt-1.5 min-h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-3 text-xs text-text-1 outline-none focus:border-brand" /><FieldError message={issueFor(issues, "market.poolAddress")} /></label></>}
            </div>
          </Panel>

          <Panel>
            <SectionTitle index="02" icon={<SlidersHorizontal aria-hidden="true" size={17} />} title={`Decide with ${template.name}`} copy={`${STRATEGY_NOTES[strategy].edge}. Parameters are bounded and validated as you type.`} />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{basicFields.map((field) => <label key={field.key} className="rounded-[var(--radius-control)] border border-line bg-surface-1 p-3 text-xs text-text-2"><span className="flex justify-between gap-2"><span>{field.label}</span><span className="num text-text-3">{field.unit}</span></span><input type="number" min={field.min} max={field.max} step={field.step} value={(draft.params as unknown as Record<string, number> | undefined)?.[field.key] ?? ""} onChange={(event) => setParam(field.key, Number(event.target.value))} className="num mt-2 min-h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface-2 px-3 text-sm text-text-1 outline-none focus:border-brand" /><p className="mt-1 text-[10px] leading-4 text-text-3">{field.description}</p><FieldError message={issueFor(issues, `params.${field.key}`)} /></label>)}</div>
            {advancedFields.length ? <div className="mt-2"><button type="button" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)} className="min-h-11 text-xs font-semibold text-brand">{advanced ? "Hide" : "Show"} advanced controls ({advancedFields.length})</button>{advanced ? <div className="grid gap-2 sm:grid-cols-2">{advancedFields.map((field) => <label key={field.key} className="rounded-[var(--radius-control)] border border-line bg-surface-1 p-3 text-xs text-text-2"><span className="flex justify-between gap-2"><span>{field.label}</span><span className="num text-text-3">{field.unit}</span></span><input type="number" min={field.min} max={field.max} step={field.step} value={(draft.params as unknown as Record<string, number> | undefined)?.[field.key] ?? ""} onChange={(event) => setParam(field.key, Number(event.target.value))} className="num mt-2 min-h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface-2 px-3 text-sm text-text-1 outline-none focus:border-brand" /><p className="mt-1 text-[10px] leading-4 text-text-3">{field.description}</p><FieldError message={issueFor(issues, `params.${field.key}`)} /></label>)}</div> : null}</div> : null}
          </Panel>

          <Panel>
            <SectionTitle index="03" icon={<ShieldCheck aria-hidden="true" size={17} />} title="Protect" copy="Set the maximum blast radius before the bot can enter a rehearsal." />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{RISK_FIELDS.map(([key, label, unit, min, max, step]) => <label key={key} className="rounded-[var(--radius-control)] border border-line bg-surface-1 p-3 text-xs text-text-2"><span className="flex justify-between gap-2"><span>{label}</span><span className="num text-text-3">{unit}</span></span><input type="number" value={draft.risk?.[key] ?? DEFAULT_RISK_LIMITS[key]} min={min} max={max} step={step} onChange={(event) => setRisk(key, Number(event.target.value))} className="num mt-2 min-h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface-2 px-3 text-sm text-text-1 outline-none focus:border-brand" /><FieldError message={issueFor(issues, `risk.${key}`)} /></label>)}</div>
          </Panel>

          <Panel>
            <SectionTitle index="04" icon={<Play aria-hidden="true" size={17} />} title="Execute" copy="Choose the deployment target explicitly. Rehearsal remains a separate paper sandbox." />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{(["testnet", "mainnet"] as const).map((value) => <button key={value} type="button" aria-pressed={network === value} onClick={() => setNetwork(value)} className={`min-h-14 rounded-[var(--radius-control)] border px-3 text-left ${network === value ? "border-brand/55 bg-brand/[0.08]" : "border-line bg-surface-1 hover:border-line-strong"}`}><span className={`block text-xs font-semibold ${network === value ? "text-brand" : "text-text-1"}`}>{value === "testnet" ? "Somnia Shannon" : "Mainnet"}</span><span className="mt-1 block text-[10px] text-text-2">{value === "testnet" ? "Connected test market index" : "Export for operator deployment"}</span></button>)}{(["dry-run", "live"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`min-h-14 rounded-[var(--radius-control)] border px-3 text-left ${mode === value ? value === "dry-run" ? "border-buy/35 bg-buy/[0.05]" : "border-sell/40 bg-sell/[0.05]" : "border-line bg-surface-1 hover:border-line-strong"}`}><span className={`block text-xs font-semibold ${mode === value ? value === "dry-run" ? "text-buy" : "text-sell" : "text-text-1"}`}>{value === "dry-run" ? "Dry run" : "Live orders"}</span><span className="mt-1 block text-[10px] text-text-2">{value === "dry-run" ? "No signature or transaction" : "Requires an external operator key"}</span></button>)}</div>
            {network === "mainnet" || mode === "live" ? <div role="alert" className="mt-2 flex items-start gap-2 rounded-[var(--radius-control)] border border-sell/35 bg-sell/[0.05] p-3 text-[11px] leading-4 text-text-2"><WarningCircle aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-sell" />This builder can export this target, but it does not sign or submit orders. Review the manifest in an isolated bot wallet.</div> : null}
            <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface-1 p-3 text-[11px] text-text-2"><LockKey aria-hidden="true" size={15} className="shrink-0 text-buy" />This browser never requests, stores, or transmits a private key.</div>
          </Panel>
        </div>

        <aside aria-label="Bot preflight" className="min-w-0 xl:sticky xl:top-20">
          <Panel>
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3"><div><p className="section-kicker">Preflight</p><h2 className="mt-1.5 text-sm font-semibold">{rehearsalReady ? "Ready to rehearse" : configReady ? "Ready to export" : "Action required"}</h2></div><span className={`flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] ${configReady ? "bg-buy/10 text-buy" : "bg-sell/10 text-sell"}`}>{configReady ? <Check aria-hidden="true" size={16} weight="bold" /> : <WarningCircle aria-hidden="true" size={17} weight="fill" />}</span></div>
            <div className="mt-3 space-y-1">{readiness.map((item) => <div key={item.label} className="flex min-h-8 items-center justify-between gap-3 rounded-[var(--radius-control)] px-2 text-[11px]"><span className="text-text-2">{item.label}</span><span className={item.ready ? "text-buy" : "text-sell"}>{item.ready ? "Ready" : "Fix"}</span></div>)}</div>
            {!configReady ? <div role="alert" className="mt-3 rounded-[var(--radius-control)] border border-sell/35 bg-sell/[0.05] p-3"><p className="text-[11px] font-semibold text-sell">{issues.length} configuration {issues.length === 1 ? "issue" : "issues"}</p><ul className="mt-1 space-y-1 text-[10px] leading-4 text-text-2">{issues.slice(0, 4).map((issue) => <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>)}</ul></div> : null}
            <section className="mt-3 border-t border-line pt-3"><div className="flex items-center gap-2"><Target aria-hidden="true" size={15} className="text-brand" /><h3 className="text-xs font-semibold">What the bot sees</h3></div><dl className="mt-2 space-y-2 text-[11px]"><div className="flex justify-between gap-3"><dt className="text-text-3">Target</dt><dd className="max-w-[190px] truncate text-right">{marketType === "spot" ? currentSpotSymbol || "No symbol" : selectedMarket ? marketLabel(selectedMarket) : currentMarketId ? "Manual on-chain market" : "No market"}</dd></div><div className="flex justify-between gap-3"><dt className="text-text-3">Exposure</dt><dd className="num text-brand">{marketType === "spot" ? "SPOT" : currentOutcome}</dd></div><div className="flex justify-between gap-3"><dt className="text-text-3">Decision</dt><dd>{template.name}</dd></div><div className="flex justify-between gap-3"><dt className="text-text-3">Mode</dt><dd className={mode === "dry-run" ? "text-buy" : "text-sell"}>{network} · {mode}</dd></div></dl></section>
            <section className="mt-3 border-t border-line pt-3"><div className="flex items-center gap-2"><Gauge aria-hidden="true" size={15} className="text-brand" /><h3 className="text-xs font-semibold">Risk budget</h3></div><dl className="mt-2 grid grid-cols-2 gap-2"><div className="rounded-[var(--radius-control)] bg-surface-1 p-2"><dt className="text-[9px] uppercase tracking-[0.12em] text-text-3">Position / capital</dt><dd className="num mt-1 text-sm">{positionShare.toFixed(1)}%</dd></div><div className="rounded-[var(--radius-control)] bg-surface-1 p-2"><dt className="text-[9px] uppercase tracking-[0.12em] text-text-3">Loss / capital</dt><dd className="num mt-1 text-sm text-sell">{lossShare.toFixed(1)}%</dd></div><div className="rounded-[var(--radius-control)] bg-surface-1 p-2"><dt className="text-[9px] uppercase tracking-[0.12em] text-text-3">Drawdown stop</dt><dd className="num mt-1 text-sm">{draft.risk?.maxDrawdownPct ?? 0}%</dd></div><div className="rounded-[var(--radius-control)] bg-surface-1 p-2"><dt className="text-[9px] uppercase tracking-[0.12em] text-text-3">Parallel cap</dt><dd className="num mt-1 text-sm">{draft.risk?.maxConcurrentPositions ?? 0}</dd></div></dl></section>
            <section className="mt-3 border-t border-line pt-3"><p className="text-[9px] uppercase tracking-[0.16em] text-text-3">Known failure mode</p><p className="mt-1 text-[11px] leading-4 text-sell">{STRATEGY_NOTES[strategy].risk}</p></section>
            <div className="mt-3 grid gap-2"><Link href="/lab/rehearse" aria-disabled={!rehearsalReady} tabIndex={rehearsalReady ? undefined : -1} className={`flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-3 text-xs font-semibold ${rehearsalReady ? "bg-brand text-brand-ink hover:bg-brand-strong" : "pointer-events-none bg-surface-3 text-text-3"}`}><Flask aria-hidden="true" size={15} weight="fill" />Open rehearsal sandbox</Link><div className="grid grid-cols-2 gap-1">{(["json", "env"] as const).map((kind) => <button key={kind} type="button" disabled={!configReady} onClick={() => setExportOpen((value) => value === kind ? null : kind)} className="min-h-10 rounded-[var(--radius-control)] border border-line-strong bg-surface-1 text-[11px] font-semibold uppercase text-text-2 hover:border-brand/60 hover:text-brand disabled:cursor-not-allowed disabled:opacity-35">{kind} config</button>)}</div></div>
            {exportOpen ? <section className="mt-2 rounded-[var(--radius-control)] border border-line bg-canvas p-2"><div className="flex items-center justify-between gap-2"><p className="text-[10px] text-text-3">Secret-free · v{BOT_CONFIG_VERSION} / <span className="num">{configHash}</span></p><div className="flex"><button type="button" onClick={() => void copyExport(exportOpen)} aria-label={`Copy ${exportOpen} config`} className="flex min-h-10 min-w-10 items-center justify-center rounded-[var(--radius-control)] text-text-2 hover:bg-surface-3 hover:text-text-1"><ClipboardText aria-hidden="true" size={15} /></button><button type="button" onClick={() => downloadExport(exportOpen)} aria-label={`Download ${exportOpen} config`} className="flex min-h-10 min-w-10 items-center justify-center rounded-[var(--radius-control)] text-text-2 hover:bg-surface-3 hover:text-text-1"><DownloadSimple aria-hidden="true" size={15} /></button></div></div><pre className="num mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[9px] leading-4 text-text-3">{exportText(exportOpen)}</pre></section> : null}
            <details className="mt-2 rounded-[var(--radius-control)] border border-line bg-surface-1"><summary className="cursor-pointer px-3 py-3 text-[11px] font-semibold text-text-2 hover:text-text-1">Deployment handoff</summary><div className="border-t border-line px-3 py-3 text-[10px] leading-5 text-text-3"><p>Download the environment manifest, then place it in an isolated DreamDEX Bot Kit runner. Add the operator key only on that runner.</p><pre className="num mt-2 overflow-x-auto rounded-[var(--radius-control)] bg-canvas p-2 text-text-2">npm install{"\n"}npm run dev -w {strategy}</pre><p className="mt-2">Use a dedicated bot wallet. Never commit the environment file.</p></div></details>
            {copyState ? <p role="status" className={`mt-2 text-[10px] ${copyState === "error" ? "text-sell" : "text-buy"}`}>{copyState === "error" ? "Copy failed. Download the file instead." : `${copyState.toUpperCase()} copied`}</p> : null}
          </Panel>
        </aside>
      </main>
    </div>
  );
}
