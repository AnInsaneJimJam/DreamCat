import type { Archetype, BookSnapshot, SimState } from "./types.js";

export const LIVE_CAPABLE_ARCHETYPES: readonly Archetype[] = [
  "maker",
  "momentum",
  "fade",
  "fairvalue",
  "theta",
  "marketmaker",
];

export const QUOTING_ARCHETYPES: readonly Archetype[] = ["marketmaker"];

export function canTradeLive(archetype: Archetype): boolean {
  return LIVE_CAPABLE_ARCHETYPES.includes(archetype);
}

export function isQuotingArchetype(archetype: Archetype): boolean {
  return QUOTING_ARCHETYPES.includes(archetype);
}

export type LiveIntent =
  | { kind: "open"; outcome: "YES" | "NO"; size: number; price: number }
  | { kind: "close"; outcome: "YES" | "NO"; size: number; price: number };

export interface LiveCatState {
  status: "idle" | "submitting" | "error";
  realizedPnl: number;
  orders: number;
  fills: number;
  entryPrice: number | null;
  lastHash?: string;
  lastError?: string;
  shadowActions?: number;
  cancels?: number;
}

export const initialLiveCatState: LiveCatState = {
  status: "idle",
  realizedPnl: 0,
  orders: 0,
  fills: 0,
  entryPrice: null,
};

export function deriveIntent(before: SimState, after: SimState, book: BookSnapshot): LiveIntent | null {
  if (!before.position && after.position) {
    return {
      kind: "open",
      outcome: after.position.side,
      size: after.position.size,
      price: after.position.entryPrice,
    };
  }
  if (before.position && !after.position) {
    const bestBid = book.bids[0]?.price;
    const bestAsk = book.asks[0]?.price;
    const mark =
      before.position.side === "YES"
        ? bestBid
        : bestAsk == null
          ? undefined
          : 1 - bestAsk;
    return {
      kind: "close",
      outcome: before.position.side,
      size: before.position.size,
      price: mark ?? before.position.entryPrice,
    };
  }
  return null;
}

export function realizedFromClose(entryPrice: number, exitPrice: number, size: number): number {
  return (exitPrice - entryPrice) * size;
}
