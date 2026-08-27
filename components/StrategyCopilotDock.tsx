"use client";

import { X } from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import StrategyCopilot from "@/components/StrategyCopilot";
import type { StrategyCopilotDraft, StrategyCopilotResponse } from "@/lib/strategy-copilot";

const DREAM_IMAGE = "/cats/Dream.png";

export default function StrategyCopilotDock({
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
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-end p-4 sm:p-6">
      <div className="pointer-events-auto flex w-full max-w-[380px] flex-col items-end gap-3">
        {open && (
          <div
            ref={panelRef}
            aria-label="Ms. Dream copilot"
            className="ease-terminal flex max-h-[min(560px,72dvh)] w-full flex-col overflow-hidden rounded-[var(--radius-shell)] border border-line-strong bg-surface-1 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.55)] transition-all duration-200 motion-safe:animate-[dock-in_200ms_cubic-bezier(0.32,0.72,0,1)]"
            role="dialog"
            tabIndex={-1}
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface-2 px-4 py-3">
              <span className="relative shrink-0">
                <Image alt="" className="h-9 w-9 rounded-[10px] object-cover" height={72} src={DREAM_IMAGE} width={72} />
                <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-2 bg-buy" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text-1">Ms. Dream</p>
                <p className="num text-[10px] uppercase tracking-[0.14em] text-text-3">Strategy copilot</p>
              </div>
              <button
                aria-label="Close copilot"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text-1"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <StrategyCopilot draft={draft} revision={revision} running={running} onApply={onApply} />
            </div>
          </div>
        )}

        <button
          aria-expanded={open}
          aria-label={open ? "Hide Ms. Dream copilot" : "Ask Ms. Dream, the strategy copilot"}
          className="ease-terminal group relative flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface-2 shadow-[0_12px_28px_-8px_rgba(0,0,0,0.5)] transition-transform duration-150 hover:scale-105 active:scale-95"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {open ? (
            <X aria-hidden="true" className="text-text-1" size={22} />
          ) : (
            <>
              <Image alt="" className="h-11 w-11 rounded-full object-cover" height={88} src={DREAM_IMAGE} width={88} />
              <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface-2 bg-brand" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
