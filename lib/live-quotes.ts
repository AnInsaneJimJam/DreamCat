"use client";

import type { UnifiedOrder } from "@somnia-chain/markets-sdk";
import type { Hex } from "viem";
import { getExchange, type LiveMarketRow } from "./dreamdex";
import { serializeOrder } from "./order-queue";
import { resolveExecutableMarket } from "./trading";
import type { QuoteBook } from "./strategy";

export type QuoteSide = "bid" | "ask";

export type QuotePolicy = "shadow" | "single" | "dual";

export const QUOTE_POLICIES: readonly QuotePolicy[] = ["shadow", "single", "dual"];

export interface RestingOrderRef {
  id: string;
  symbol: string;
  side: QuoteSide;
  price: number;
  size: number;
  filled: number;
  placedAt: number;
  hash?: string;
}

export interface LiveQuoteBook {
  bid: RestingOrderRef | null;
  ask: RestingOrderRef | null;
}

export const emptyLiveQuotes: LiveQuoteBook = { bid: null, ask: null };

export type QuoteAction =
  | { kind: "cancel"; side: QuoteSide; order: RestingOrderRef; reason: "withdrawn" | "requote" }
  | { kind: "place"; side: QuoteSide; price: number; size: number };

export const QUOTE_PRICE_EPSILON = 1e-6;
export const QUOTE_SIZE_EPSILON = 1e-9;

export interface QuotePlanOptions {
  singleSided?: boolean;
}

function matches(order: RestingOrderRef, price: number, size: number): boolean {
  return (
    Math.abs(order.price - price) <= QUOTE_PRICE_EPSILON &&
    Math.abs(order.size - size) <= QUOTE_SIZE_EPSILON
  );
}

/**
 * Diff the strategy's desired quote book against the orders actually resting on
 * chain. Cancels are emitted before places so collateral is released before it is
 * committed again.
 */
export function deriveQuoteActions(
  desired: QuoteBook | null | undefined,
  resting: LiveQuoteBook,
  options: QuotePlanOptions = {}
): QuoteAction[] {
  const wantBid = desired?.bid ?? null;
  let wantAsk = desired?.ask ?? null;
  if (options.singleSided && wantBid && wantAsk) wantAsk = null;

  const cancels: QuoteAction[] = [];
  const places: QuoteAction[] = [];

  for (const side of ["bid", "ask"] as const) {
    const want = side === "bid" ? wantBid : wantAsk;
    const have = resting[side];
    if (!want) {
      if (have) cancels.push({ kind: "cancel", side, order: have, reason: "withdrawn" });
      continue;
    }
    if (!(want.size > 0)) {
      if (have) cancels.push({ kind: "cancel", side, order: have, reason: "withdrawn" });
      continue;
    }
    if (have && matches(have, want.price, want.size)) continue;
    if (have) cancels.push({ kind: "cancel", side, order: have, reason: "requote" });
    places.push({ kind: "place", side, price: want.price, size: want.size });
  }

  return [...cancels, ...places];
}

export function describeQuoteAction(action: QuoteAction): string {
  if (action.kind === "cancel") {
    return `CANCEL ${action.side} ${action.order.size} @ ${(action.order.price * 100).toFixed(1)}% · ${action.reason}`;
  }
  return `PLACE ${action.side} ${action.size} @ ${(action.price * 100).toFixed(1)}%`;
}

export interface QuoteFillEvent {
  side: QuoteSide;
  price: number;
  size: number;
}

export interface QuoteOrderUpdate {
  event: QuoteFillEvent | null;
  ref: RestingOrderRef | null;
  resolved: boolean;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Fold one authoritative order row into a tracked reference. `row` is null when the
 * order was not in the open list and its final state is not known yet — the caller
 * then resolves it from order history before assuming anything about fills.
 */
export function foldQuoteOrder(ref: RestingOrderRef, row: UnifiedOrder | null): QuoteOrderUpdate {
  if (!row) return { event: null, ref, resolved: false };

  const filled = Math.max(ref.filled, finiteOr(row.filled, ref.filled));
  const delta = filled - ref.filled;
  const price = finiteOr(row.price, ref.price);
  const event: QuoteFillEvent | null =
    delta > QUOTE_SIZE_EPSILON ? { side: ref.side, price, size: delta } : null;

  const remaining = finiteOr(row.remaining, ref.size - filled);
  const stillResting = row.status === "open" && remaining > QUOTE_SIZE_EPSILON;
  return {
    event,
    ref: stillResting ? { ...ref, filled } : null,
    resolved: true,
  };
}

async function withSigner<T>(privateKey: Hex, task: () => Promise<T>): Promise<T> {
  return serializeOrder(async () => {
    getExchange().setSigner({ privateKey });
    return task();
  });
}

const SYMBOL_TTL_MS = 30_000;
const symbolCache = new Map<string, { symbol: string; at: number }>();

/**
 * `resolveExecutableMarket` reloads the whole SDK registry, which is far too heavy for
 * a quoting loop that requotes every few seconds. The symbol binding for a window does
 * not move, so cache it briefly and let the periodic re-resolve carry the liveness check.
 */
export async function quoteSymbolFor(market: LiveMarketRow): Promise<string> {
  const cached = symbolCache.get(market.id);
  if (cached && Date.now() - cached.at < SYMBOL_TTL_MS) return cached.symbol;
  const executable = await resolveExecutableMarket(market.id, "YES");
  symbolCache.set(market.id, { symbol: executable.symbol, at: Date.now() });
  return executable.symbol;
}

export function forgetQuoteSymbol(marketId: string): void {
  symbolCache.delete(marketId);
}

export interface PlacedQuote {
  ref: RestingOrderRef | null;
  filled: number;
  avgPrice: number;
  hash?: string;
  status: string;
}

export async function placeQuote(
  privateKey: Hex,
  market: LiveMarketRow,
  side: QuoteSide,
  price: number,
  size: number
): Promise<PlacedQuote> {
  const symbol = await quoteSymbolFor(market);
  return withSigner(privateKey, async () => {
    const exchange = getExchange();
    let limitPrice = price;
    let amount = size;
    try {
      limitPrice = exchange.priceToPrecision(symbol, price);
    } catch {
      limitPrice = price;
    }
    try {
      amount = exchange.amountToPrecision(symbol, size);
    } catch {
      amount = size;
    }
    if (!(amount > 0)) {
      return { ref: null, filled: 0, avgPrice: price, status: "below one lot" };
    }
    if (!(limitPrice > 0) || !(limitPrice < 1)) {
      return { ref: null, filled: 0, avgPrice: price, status: "price out of range" };
    }

    const order = await exchange.createOrder(
      symbol,
      "limit",
      side === "bid" ? "buy" : "sell",
      amount,
      limitPrice
    );

    const filled = Math.max(0, finiteOr(order.filled, 0));
    const remaining = finiteOr(order.remaining, amount - filled);
    const avgPrice = finiteOr(order.price, limitPrice);
    const resting = order.status === "open" && remaining > QUOTE_SIZE_EPSILON;

    return {
      ref: resting
        ? {
            id: order.id,
            symbol,
            side,
            price: limitPrice,
            size: amount,
            filled,
            placedAt: Date.now(),
            hash: order.txHash,
          }
        : null,
      filled,
      avgPrice,
      hash: order.txHash,
      status: order.status,
    };
  });
}

export async function cancelQuote(privateKey: Hex, order: RestingOrderRef): Promise<void> {
  await withSigner(privateKey, async () => {
    await getExchange().cancelOrder(order.id, order.symbol);
  });
}

export async function fetchOpenQuoteOrders(privateKey: Hex, symbol: string): Promise<UnifiedOrder[]> {
  return withSigner(privateKey, async () => getExchange().fetchOpenOrders(symbol, 50));
}

export async function resolveFinalOrder(
  privateKey: Hex,
  symbol: string,
  id: string
): Promise<UnifiedOrder | null> {
  const rows = await withSigner(privateKey, async () => getExchange().fetchOrders(symbol, undefined, 50));
  return rows.find((row) => row.id === id) ?? null;
}

/**
 * Cancel every order this wallet has resting on a symbol. The fleet burner is used
 * only by the fleet and every other archetype trades with market orders, so anything
 * resting here is an orphaned quote from a previous session.
 */
export async function sweepRestingOrders(privateKey: Hex, symbol: string): Promise<number> {
  const open = await fetchOpenQuoteOrders(privateKey, symbol);
  let cancelled = 0;
  for (const row of open) {
    if (row.status !== "open") continue;
    try {
      await withSigner(privateKey, async () => {
        await getExchange().cancelOrder(row.id, row.symbol || symbol);
      });
      cancelled += 1;
    } catch {
      continue;
    }
  }
  return cancelled;
}
