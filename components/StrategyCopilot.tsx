"use client";

import { ArrowRight, Check, CircleNotch, Sparkle, WarningCircle, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  applyStrategyCopilotProposal,
  copilotWritableParamKeys,
  normalizeStrategyCopilotResponse,
  type CopilotFieldPath,
  type StrategyCopilotDraft,
  type StrategyCopilotFieldNote,
  type StrategyCopilotResponse,
  type StrategyCopilotTurn,
} from "@/lib/strategy-copilot";
import { TEMPLATES } from "@/lib/strategy";

const QUICK_PROMPTS = ["Explain this setup", "Make it conservative", "Build a fair-value setup"];

interface ProposalState {
  response: StrategyCopilotResponse;
  draft: StrategyCopilotDraft;
  revision: number;
}

const FIELD_LABELS: Record<CopilotFieldPath, string> = {
  archetype: "Strategy",
  "params.orderSize": "Order size",
  "params.entryEdge": "Entry signal",
  "params.takeProfit": "Take profit",
  "params.stopLoss": "Stop loss",
  "params.lookback": "Tape lookback",
  "params.maxHoldSec": "Time stop",
  "params.edgeThreshold": "Model edge",
  "params.settleSigmas": "Settled distance",
  "params.maxEntryPrice": "Max entry price",
  "params.tauGateSec": "Entry window",
  "params.quoteSpread": "Quote half-width",
  "params.maxQuoteAgeSec": "Quote lifetime",
  "params.flattenSec": "Flatten before expiry",
  "params.tapeWindowSec": "Tape recency",
};

type DiffValue = number | string | undefined;
type DiffKind = "suggested" | "template" | "removed" | "strategy";

interface ProposalField {
  path: CopilotFieldPath;
  before: DiffValue;
  after: DiffValue;
  kind: DiffKind;
  note?: StrategyCopilotFieldNote;
}

function strategyLabel(value: string): string {
  const template = TEMPLATES.find((candidate) => candidate.archetype === value);
  return template ? `${template.cat} · ${template.archetype}` : value;
}

function changedFields(proposal: ProposalState): ProposalField[] {
  const next = applyStrategyCopilotProposal(proposal.draft, proposal.response);
  const targetKeys = copilotWritableParamKeys(next.archetype);
  const currentKeys = copilotWritableParamKeys(proposal.draft.archetype);
  const fields: ProposalField[] = [];
  if (next.archetype !== proposal.draft.archetype) {
    const path: CopilotFieldPath = "archetype";
    fields.push({ path, before: proposal.draft.archetype, after: next.archetype, kind: "strategy", note: proposal.response.fieldNotes.find((item) => item.path === path) });
  }
  for (const key of targetKeys) {
    const before = proposal.draft.params[key];
    const after = next.params[key];
    if (before !== after) {
      const path = `params.${key}` as CopilotFieldPath;
      fields.push({
        path,
        before,
        after,
        kind: next.archetype !== proposal.draft.archetype && proposal.response.patch.params[key] === null ? "template" : "suggested",
        note: proposal.response.fieldNotes.find((item) => item.path === path),
      });
    }
  }
  for (const key of currentKeys) {
    if (targetKeys.includes(key)) continue;
    const before = proposal.draft.params[key];
    if (before !== undefined) {
      const path = `params.${key}` as CopilotFieldPath;
      fields.push({ path, before, after: undefined, kind: "removed", note: proposal.response.fieldNotes.find((item) => item.path === path) });
    }
  }
  return fields;
}

function displayValue(path: CopilotFieldPath, value: DiffValue, side: "before" | "after"): string {
  if (value === undefined) return side === "after" ? "cleared" : "not set";
  if (typeof value === "string") return path === "archetype" ? strategyLabel(value) : value;
  const key = path.replace("params.", "");
  if (["entryEdge", "takeProfit", "stopLoss", "edgeThreshold", "maxEntryPrice", "quoteSpread", "requoteThreshold", "sigmaFloor"].includes(key)) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (["maxHoldSec", "tauGateSec", "maxQuoteAgeSec", "flattenSec", "tapeWindowSec"].includes(key)) return `${value}s`;
  if (key === "settleSigmas") return `${value.toFixed(1)}σ`;
  return String(value);
}

function fieldKindLabel(kind: DiffKind): string {
  if (kind === "strategy") return "Strategy change";
  if (kind === "template") return "Template default";
  if (kind === "removed") return "Cleared";
  return "Suggested";
}

function fieldKindClass(kind: DiffKind): string {
  if (kind === "removed") return "text-sell";
  if (kind === "template") return "text-text-3";
  return "text-brand";
}

function errorMessage(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "The copilot could not answer. Try again.";
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" && message.length < 240 ? message : "The copilot could not answer. Try again.";
}

export default function StrategyCopilot({
  draft,
  revision,
  running,
  onApply,
}: {
  draft: StrategyCopilotDraft;
  revision: number;
  running: boolean;
  onApply: (response: StrategyCopilotResponse, revision: number) => void;
}) {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<StrategyCopilotTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [proposal, setProposal] = useState<ProposalState | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const submit = useCallback(async (nextMessage?: string) => {
    const text = (nextMessage ?? message).trim();
    if (!text || pending) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const draftAtSend = { archetype: draft.archetype, params: { ...draft.params } };
    const revisionAtSend = revision;
    setMessage("");
    setError("");
    setNotice("");
    setQuestions([]);
    setProposal(null);
    setPending(true);
    const userTurn: StrategyCopilotTurn = { role: "user", content: text };
    setTurns((current) => [...current, userTurn].slice(-8));
    try {
      const response = await fetch("/api/strategy-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ message: text, draft: draftAtSend, revision: revisionAtSend, history: turns.slice(-8) }),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) throw new Error(errorMessage(body));
      const normalized = normalizeStrategyCopilotResponse(body, draftAtSend);
      if (!normalized.ok) throw new Error("The copilot returned an invalid response. Try again.");
      const assistantTurn: StrategyCopilotTurn = { role: "assistant", content: normalized.value.reply };
      setTurns((current) => [...current, assistantTurn].slice(-8));
      setQuestions(normalized.value.questions);
      if (normalized.value.intent === "configure" && changedFields({ response: normalized.value, draft: draftAtSend, revision: revisionAtSend }).length > 0) {
        setProposal({ response: normalized.value, draft: draftAtSend, revision: revisionAtSend });
      }
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setMessage(text);
        setError(caught instanceof Error ? caught.message : "The copilot could not answer. Try again.");
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setPending(false);
      }
    }
  }, [draft, message, pending, revision, turns]);

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };

  const applyProposal = () => {
    if (!proposal || running || proposal.revision !== revision) return;
    onApply(proposal.response, proposal.revision);
    setProposal(null);
    setNotice("Proposal applied. The stopped rehearsal state, metrics, and log were reset.");
  };

  return (
    <aside aria-label="Strategy copilot" aria-busy={pending} className="min-w-0">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 pb-1">
          <p className="text-xs leading-5 text-text-2">Build the strategy with guidance.</p>
          <span className="num shrink-0 text-[10px] uppercase tracking-[0.12em] text-text-3">review first</span>
        </div>

        <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1" aria-live="polite">
          {!turns.length && <p className="rounded-[var(--radius-control)] border border-line bg-surface-1 p-3 text-xs leading-5 text-text-2">Ask what a control does, describe the behavior you want, or ask for a complete bounded setup. Nothing changes until you apply a proposal.</p>}
          {turns.map((turn, index) => (
            <div key={`${turn.role}-${index}`} className={`rounded-[var(--radius-control)] border px-3 py-2 text-xs leading-5 ${turn.role === "user" ? "border-line bg-surface-1 text-text-1" : "border-brand/20 bg-brand/[0.05] text-text-2"}`}>
              <p className="num mb-1 text-[10px] uppercase tracking-[0.14em] text-text-3">{turn.role === "user" ? "You" : "Copilot"}</p>
              <p className="whitespace-pre-wrap break-words">{turn.content}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((prompt) => (
            <button key={prompt} type="button" disabled={pending} onClick={() => void submit(prompt)} className="min-h-11 cursor-pointer rounded-[var(--radius-control)] bg-brand px-2.5 text-[11px] font-semibold text-black transition-colors duration-150 hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40">
              {prompt}
            </button>
          ))}
        </div>

        <form onSubmit={submitForm} className="mt-3 flex flex-col gap-2">
          <label htmlFor="strategy-copilot-message" className="sr-only">Ask the strategy copilot</label>
          <textarea
            id="strategy-copilot-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="e.g. Keep risk tight and use the last 10 prints..."
            className="w-full resize-y rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-3 py-2.5 text-xs leading-5 text-text-1 outline-none transition-colors duration-150 placeholder:text-text-3 focus:border-brand"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="num text-[10px] text-text-3">{message.length}/2000</span>
            <button type="submit" disabled={pending || !message.trim()} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] bg-brand px-3.5 text-xs font-semibold text-black transition-colors duration-150 hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40">
              {pending ? <CircleNotch aria-hidden="true" className="animate-spin" size={15} /> : <Sparkle aria-hidden="true" size={15} weight="fill" />}
              {pending ? "Thinking" : "Ask copilot"}
            </button>
          </div>
        </form>

        {error && <div role="alert" className="mt-3 flex items-start gap-2 rounded-[var(--radius-control)] border border-sell/40 bg-sell/[0.06] p-3 text-xs leading-5 text-sell"><WarningCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} weight="fill" /><span>{error}</span></div>}
        {notice && <div role="status" className="mt-3 flex items-start gap-2 rounded-[var(--radius-control)] border border-buy/30 bg-buy/[0.06] p-3 text-xs leading-5 text-buy"><Check aria-hidden="true" className="mt-0.5 shrink-0" size={16} weight="bold" /><span>{notice}</span></div>}
        {questions.length > 0 && <div className="mt-3 rounded-[var(--radius-control)] border border-line bg-surface-1 p-3"><p className="section-kicker">Ms. Dream asks</p><div className="mt-2 space-y-1.5">{questions.map((question) => <button key={question} type="button" disabled={pending} onClick={() => void submit(question)} className="flex w-full cursor-pointer items-start gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-xs leading-5 text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"><ArrowRight aria-hidden="true" className="mt-1 shrink-0 text-brand" size={12} />{question}</button>)}</div></div>}
        {running && <p className="mt-3 text-[11px] leading-5 text-text-3">Stop the dry run before applying a copilot proposal. The assistant cannot alter an active simulation.</p>}

        {proposal && (() => {
          const fields = changedFields(proposal);
          const stale = proposal.revision !== revision;
          return (
            <div className="mt-3 rounded-[var(--radius-control)] border border-brand/40 bg-brand/[0.06] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="section-kicker">Suggested changes</p>
                  <p className="mt-1 text-xs leading-5 text-text-2">Review the bounded diff before it fills the controls.</p>
                </div>
                <button type="button" aria-label="Dismiss proposal" onClick={() => setProposal(null)} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-text-3 hover:bg-surface-3 hover:text-text-1"><X aria-hidden="true" size={15} /></button>
              </div>
              {proposal.response.patch.archetype && proposal.response.patch.archetype !== proposal.draft.archetype && (
                <p className="mt-3 rounded-[var(--radius-control)] border border-line bg-surface-1 p-2.5 text-[11px] leading-4 text-text-2">
                  Switching to {strategyLabel(proposal.response.patch.archetype)} loads that strategy&apos;s template defaults. Controls that the target strategy does not use are cleared.
                </p>
              )}
              <div className="mt-3 space-y-2">
                {fields.map((field) => (
                  <div key={field.path} className="rounded-[var(--radius-control)] border border-line bg-surface-1 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-text-1">{FIELD_LABELS[field.path]}</span>
                      <span className={`num text-[10px] uppercase tracking-[0.12em] ${fieldKindClass(field.kind)}`}>{fieldKindLabel(field.kind)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="num text-text-2">{displayValue(field.path, field.before, "before")}</span>
                      <ArrowRight aria-hidden="true" className={field.kind === "removed" ? "text-sell" : "text-brand"} size={13} />
                      <span className={`num font-semibold ${field.kind === "removed" ? "text-sell" : "text-brand"}`}>{displayValue(field.path, field.after, "after")}</span>
                    </div>
                    {field.note?.reason && <p className="mt-1.5 text-[11px] leading-4 text-text-3">{field.note.reason}</p>}
                  </div>
                ))}
              </div>
              {proposal.response.warnings.map((warning) => <p key={warning} className="mt-2 text-[11px] leading-4 text-sell">{warning}</p>)}
              {stale && <p className="mt-3 text-[11px] leading-4 text-sell">The draft changed while Luna was thinking. Ask again to generate a current proposal.</p>}
              <div className="mt-3 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setProposal(null)} className="min-h-11 cursor-pointer rounded-[var(--radius-control)] px-3 text-xs font-medium text-text-2 hover:bg-surface-3 hover:text-text-1">Dismiss</button>
                <button type="button" onClick={applyProposal} disabled={running || pending || stale} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] bg-brand px-3.5 text-xs font-semibold text-black hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40">
                  <Check aria-hidden="true" size={15} weight="bold" />
                  Apply proposal
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </aside>
  );
}
