"use client";

import type { Hex } from "viem";
import { getExchange, type BookSnapshot, type LiveMarketRow } from "./dreamdex";
import { serializeOrder } from "./order-queue";
import { resolveExecutableMarket } from "./trading";
import type { Archetype, SimState } from "./strategy";

export const LIVE_CAPABLE_ARCHETYPES: readonly Archetype[] = [
  "maker",
  "momentum",
  "fade",
  "fairvalue",
  "theta",
];

export function canTradeLive(archetype: Archetype): boolean {
  return LIVE_CAPABLE_ARCHETYPES.includes(archetype);
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

export interface ExecutedIntent {
  avgPrice: number;
  filled: number;
  hash?: string;
  status?: string;
  dust?: boolean;
}

export const LIVE_SLIPPAGE = 0.02;

export async function executeIntent(
  privateKey: Hex,
  market: LiveMarketRow,
  intent: LiveIntent
): Promise<ExecutedIntent> {
  return serializeOrder(async () => {
    const executable = await resolveExecutableMarket(market.id, intent.outcome);
    const exchange = getExchange();

    let size = intent.size;
    if (intent.kind === "close") {
      try {
        size = exchange.amountToPrecision(executable.symbol, intent.size);
      } catch {
        size = intent.size;
      }
      if (!(size > 0)) {
        return { avgPrice: intent.price, filled: 0, dust: true, status: "below one lot" };
      }
    }

    exchange.setSigner({ privateKey });
    const order = await exchange.createOrder(
      executable.symbol,
      "market",
      intent.kind === "open" ? "buy" : "sell",
      size,
      undefined,
      { slippage: LIVE_SLIPPAGE }
    );
    const filled = Number.isFinite(order.filled) && order.filled > 0 ? order.filled : 0;
    const requested = size;
    const avgPrice = order.price != null && Number.isFinite(order.price) && order.price > 0 ? order.price : intent.price;
    return { avgPrice, filled: Math.min(filled, requested), hash: order.txHash, status: order.status };
  });
}

export function realizedFromClose(entryPrice: number, exitPrice: number, size: number): number {
  return (exitPrice - entryPrice) * size;
}
