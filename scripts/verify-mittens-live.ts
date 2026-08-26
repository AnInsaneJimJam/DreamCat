import type { UnifiedOrder } from "@somnia-chain/markets-sdk";
import {
  deriveQuoteActions,
  foldQuoteOrder,
  type LiveQuoteBook,
  type QuoteSide,
  type RestingOrderRef,
} from "../lib/live-quotes";
import { deriveIntent } from "../lib/live-fleet";
import { QUOTE_MIN_INTERVAL_MS } from "../lib/fleet-runner";
import {
  applyConfirmedQuoteFill,
  initialSimState,
  stepSim,
  TEMPLATES,
  type MarketContext,
  type SimState,
  type StrategyConfig,
} from "../lib/strategy";
import type { BookSnapshot, Fill } from "../lib/dreamdex";

let failures = 0;
const check = (ok: boolean, label: string) => {
  if (!ok) {
    failures += 1;
    console.error(`  FAIL: ${label}`);
  }
  return ok;
};

const SYMBOL = "BTC-100000-31DEC26/USDC#YES";
const T0 = Date.UTC(2026, 7, 26, 12, 0, 0);
const MITTENS = TEMPLATES.find((t) => t.archetype === "marketmaker")!;

const cfg = (infer: boolean): StrategyConfig => ({
  archetype: "marketmaker",
  params: MITTENS.defaults,
  inferQuoteFills: infer,
});

const bookAt = (bid: number, ask: number, bidDepth = 50, askDepth = 50): BookSnapshot => ({
  bids: [{ price: bid, qty: bidDepth }],
  asks: [{ price: ask, qty: askDepth }],
  bidDepth,
  askDepth,
  mid: (bid + ask) / 2,
  spread: ask - bid,
  imbalance: bidDepth / (bidDepth + askDepth),
});

const ctxAt = (spot: number, strike: number, minsLeft: number, from = T0): MarketContext => ({
  asset: "BTC",
  strike,
  expiry: from + minsLeft * 60000,
  spot,
  spotPrev: spot,
  sigma: 0.0008,
});

// ── a stand-in for the venue: resting orders, cancels, and taker flow that crosses them ──

interface ChainOrder {
  id: string;
  side: QuoteSide;
  price: number;
  amount: number;
  filled: number;
  status: "open" | "closed" | "canceled";
}

class MockVenue {
  private seq = 0;
  private orders = new Map<string, ChainOrder>();
  placed = 0;
  cancelled = 0;

  place(side: QuoteSide, price: number, amount: number): ChainOrder {
    this.seq += 1;
    const order: ChainOrder = { id: `o${this.seq}`, side, price, amount, filled: 0, status: "open" };
    this.orders.set(order.id, order);
    this.placed += 1;
    return order;
  }

  cancel(id: string): void {
    const order = this.orders.get(id);
    if (!order || order.status !== "open") return;
    order.status = "canceled";
    this.cancelled += 1;
  }

  /** A taker crosses the book: sells into our bid at or below `price`, or lifts our ask. */
  cross(side: QuoteSide, price: number, qty: number): void {
    for (const order of this.orders.values()) {
      if (order.status !== "open" || order.side !== side) continue;
      const crosses = side === "bid" ? price <= order.price : price >= order.price;
      if (!crosses) continue;
      const room = order.amount - order.filled;
      const take = Math.min(room, qty);
      if (take <= 0) continue;
      order.filled += take;
      if (order.filled >= order.amount - 1e-9) order.status = "closed";
      return;
    }
  }

  private unify(order: ChainOrder): UnifiedOrder {
    return {
      id: order.id,
      symbol: SYMBOL,
      type: "limit",
      side: order.side === "bid" ? "buy" : "sell",
      price: order.price,
      amount: order.amount,
      filled: order.filled,
      remaining: order.amount - order.filled,
      status: order.status,
      info: null,
    } as UnifiedOrder;
  }

  openOrders(): UnifiedOrder[] {
    return [...this.orders.values()].filter((o) => o.status === "open").map((o) => this.unify(o));
  }

  history(id: string): UnifiedOrder | null {
    const order = this.orders.get(id);
    return order ? this.unify(order) : null;
  }

  openCount(): number {
    return [...this.orders.values()].filter((o) => o.status === "open").length;
  }
}

// ── one iteration of the runner's live quote loop, against the mock venue ──

interface LoopState {
  sim: SimState;
  resting: LiveQuoteBook;
  realized: number;
  fills: number;
  takerExits: number;
  submitAt: number;
}

const freshLoop = (): LoopState => ({
  sim: initialSimState,
  resting: { bid: null, ask: null },
  realized: 0,
  fills: 0,
  takerExits: 0,
  submitAt: 0,
});

function syncFills(loop: LoopState, venue: MockVenue, now: number): void {
  const open = new Map(venue.openOrders().map((row) => [row.id, row]));
  for (const side of ["bid", "ask"] as const) {
    const ref = loop.resting[side];
    if (!ref) continue;
    const row = open.get(ref.id) ?? venue.history(ref.id);
    const update = foldQuoteOrder(ref, row);
    if (!update.resolved) continue;
    if (update.event) {
      const before = loop.sim.realizedPnl;
      loop.sim = applyConfirmedQuoteFill(loop.sim, update.event.side, update.event.price, update.event.size, now);
      loop.realized += loop.sim.realizedPnl - before;
      loop.fills += 1;
    }
    loop.resting[side] = update.ref;
  }
}

function runTick(
  loop: LoopState,
  venue: MockVenue,
  book: BookSnapshot,
  fills: Fill[],
  now: number,
  ctx: MarketContext,
  policy: "shadow" | "single" | "dual" = "dual"
): void {
  syncFills(loop, venue, now);

  const proposed = stepSim(cfg(false), loop.sim, book, fills, now, ctx);
  const intent = deriveIntent(loop.sim, proposed, book);
  loop.sim = proposed;

  if (intent) {
    // A quoting cat only crosses to force-flatten. Pull the quotes, then take.
    for (const side of ["bid", "ask"] as const) {
      const ref = loop.resting[side];
      if (!ref) continue;
      venue.cancel(ref.id);
      loop.resting[side] = null;
    }
    loop.takerExits += 1;
    return;
  }

  const actions = deriveQuoteActions(proposed.quotes, loop.resting, { singleSided: policy === "single" });
  if (policy === "shadow" || !actions.length) return;

  const requoting = actions.some((action) => action.kind === "cancel" && action.reason === "requote");
  if (requoting && now - loop.submitAt < QUOTE_MIN_INTERVAL_MS) return;
  loop.submitAt = now;

  for (const action of actions) {
    if (action.kind === "cancel") {
      venue.cancel(action.order.id);
      if (loop.resting[action.side]?.id === action.order.id) loop.resting[action.side] = null;
      continue;
    }
    const order = venue.place(action.side, action.price, action.size);
    const ref: RestingOrderRef = {
      id: order.id,
      symbol: SYMBOL,
      side: action.side,
      price: action.price,
      size: action.size,
      filled: 0,
      placedAt: now,
    };
    loop.resting[action.side] = ref;
  }
}

// ═══ Phase 0 — planning, shadow mode, and the inference footgun ═══

console.log("phase 0 — quote planning and shadow mode\n");

{
  const book = bookAt(0.48, 0.52);
  const ctx = ctxAt(100000, 100000, 30);
  const desired = stepSim(cfg(false), initialSimState, book, [], T0, ctx);
  check(desired.quotes?.bid != null, "flat Mittens does not want a bid");
  check(desired.quotes?.ask != null, "flat Mittens does not want an ask");

  const empty: LiveQuoteBook = { bid: null, ask: null };
  const opening = deriveQuoteActions(desired.quotes, empty);
  check(opening.length === 2, `expected 2 opening places, got ${opening.length}`);
  check(opening.every((a) => a.kind === "place"), "opening plan contains a cancel");
  console.log(`  opening plan: ${opening.length} places, bid ${(desired.quotes!.bid!.price * 100).toFixed(1)}% / ask ${(desired.quotes!.ask!.price * 100).toFixed(1)}%`);

  const resting: LiveQuoteBook = {
    bid: { id: "a", symbol: SYMBOL, side: "bid", price: desired.quotes!.bid!.price, size: desired.quotes!.bid!.size, filled: 0, placedAt: T0 },
    ask: { id: "b", symbol: SYMBOL, side: "ask", price: desired.quotes!.ask!.price, size: desired.quotes!.ask!.size, filled: 0, placedAt: T0 },
  };
  check(deriveQuoteActions(desired.quotes, resting).length === 0, "an unchanged book still produced actions (requote churn)");
  console.log("  idempotent: unchanged quotes produce no transactions");

  const drifted = deriveQuoteActions({ bid: { ...desired.quotes!.bid!, price: desired.quotes!.bid!.price - 0.05 }, ask: desired.quotes!.ask! }, resting);
  check(drifted.length === 2, `drifted bid should cancel+place, got ${drifted.length}`);
  check(drifted[0].kind === "cancel" && drifted[1].kind === "place", "cancel must be planned before the replacement place");
  console.log("  requote plans cancel-then-place, releasing collateral first");

  const withdrawn = deriveQuoteActions({ bid: null, ask: null }, resting);
  check(withdrawn.length === 2 && withdrawn.every((a) => a.kind === "cancel"), "withdrawal did not cancel both sides");
  console.log("  withdrawal cancels both sides");

  const single = deriveQuoteActions(desired.quotes, empty, { singleSided: true });
  check(single.length === 1 && single[0].kind === "place" && single[0].side === "bid", "single-sided policy did not reduce to one bid");
  console.log("  single-sided policy rests one bid only");
}

{
  // The regression that kept Mittens paused: a public print crossing the quote price is
  // somebody else's fill. Inference must be off in live mode.
  const book = bookAt(0.48, 0.52);
  const ctx = ctxAt(100000, 100000, 30);
  const quoted = stepSim(cfg(false), initialSimState, book, [], T0, ctx);
  const bidPrice = quoted.quotes!.bid!.price;
  const crossing = bookAt(bidPrice - 0.01, bidPrice - 0.005);

  const inferred = stepSim(cfg(true), quoted, crossing, [], T0 + 1000, ctx);
  const authoritative = stepSim(cfg(false), quoted, crossing, [], T0 + 1000, ctx);
  check(inferred.position != null, "the dry-run simulator no longer infers a fill (sim behaviour changed)");
  check(authoritative.position == null, "live mode opened a position from a public print — the footgun is back");
  check(deriveIntent(quoted, authoritative, crossing) == null, "live mode produced a taker intent from a public print");
  console.log("  public tape crossing the quote: sim infers a fill, live mode does not");
}

// ═══ Phase 1 — single-sided lifecycle against the venue ═══

console.log("\nphase 1 — single-sided quoting, confirmed fills\n");

{
  const venue = new MockVenue();
  const loop = freshLoop();
  const ctx = ctxAt(100000, 100000, 30);
  const book = bookAt(0.48, 0.52);

  runTick(loop, venue, book, [], T0, ctx, "single");
  check(venue.openCount() === 1, `single-sided policy rested ${venue.openCount()} orders, expected 1`);
  check(loop.resting.bid != null && loop.resting.ask == null, "single-sided policy rested the wrong side");

  const bidRef = loop.resting.bid!;
  venue.cross("bid", bidRef.price, bidRef.size);
  runTick(loop, venue, book, [], T0 + 3000, ctx, "single");

  check(loop.sim.position?.side === "YES", `confirmed bid fill did not open a YES position (got ${loop.sim.position?.side ?? "none"})`);
  check(Math.abs((loop.sim.position?.entryPrice ?? 0) - bidRef.price) < 1e-9, "position entry does not match the confirmed fill price");
  check(loop.fills === 1, `expected 1 confirmed fill, counted ${loop.fills}`);
  console.log(`  BID HIT ${bidRef.size} YES @ ${(bidRef.price * 100).toFixed(1)}% · position opened from chain confirmation`);

  check(loop.resting.ask != null, "holding YES, Mittens did not rest an exit ask");
  check(loop.resting.bid == null, "holding YES, Mittens left its entry bid resting");
  console.log(`  exit ask rested @ ${((loop.resting.ask?.price ?? 0) * 100).toFixed(1)}%`);
}

{
  // A forced exit must cross, not rest — and must pull the quotes before it does.
  const venue = new MockVenue();
  const loop = freshLoop();
  const ctx = ctxAt(100000, 100000, 30);

  runTick(loop, venue, bookAt(0.48, 0.52), [], T0, ctx);
  const bidRef = loop.resting.bid!;
  venue.cross("bid", bidRef.price, bidRef.size);
  runTick(loop, venue, bookAt(0.48, 0.52), [], T0 + 3000, ctx);
  check(loop.sim.position != null, "could not open a position to test the forced exit");

  // Drop the market hard through the stop.
  runTick(loop, venue, bookAt(0.30, 0.34), [], T0 + 6000, ctx);
  check(loop.takerExits === 1, "a stop-loss did not produce a taker exit");
  check(loop.sim.position == null, "the position survived its stop-loss");
  check(venue.openCount() === 0, `${venue.openCount()} orders left resting after a forced exit`);
  console.log("  stop-loss: quotes pulled, position crossed out, nothing left resting");
}

// ═══ Phase 2 — two-sided reconciliation, partials, orphans, teardown ═══

console.log("\nphase 2 — two-sided reconciliation\n");

{
  const ref: RestingOrderRef = { id: "x", symbol: SYMBOL, side: "bid", price: 0.45, size: 5, filled: 0, placedAt: T0 };
  const row = (filled: number, status: "open" | "closed" | "canceled"): UnifiedOrder =>
    ({ id: "x", symbol: SYMBOL, type: "limit", side: "buy", price: 0.45, amount: 5, filled, remaining: 5 - filled, status, info: null }) as UnifiedOrder;

  const partial = foldQuoteOrder(ref, row(2, "open"));
  check(partial.event?.size === 2, "a partial fill did not report a size-2 event");
  check(partial.ref?.filled === 2, "a partially filled order stopped being tracked");

  const rest = foldQuoteOrder(partial.ref!, row(5, "closed"));
  check(rest.event?.size === 3, `the remainder should report 3, got ${rest.event?.size}`);
  check(rest.ref === null, "a fully filled order is still tracked as resting");

  const cancelled = foldQuoteOrder(ref, row(0, "canceled"));
  check(cancelled.event === null, "a cancelled order reported a phantom fill");
  check(cancelled.ref === null, "a cancelled order is still tracked as resting");

  const unknown = foldQuoteOrder(ref, null);
  check(unknown.resolved === false, "an unresolvable order claimed to be resolved");
  check(unknown.event === null && unknown.ref === ref, "an unresolvable order mutated tracking state");
  console.log("  order folding: partial, remainder, cancel, and unresolved all handled");
}

{
  const venue = new MockVenue();
  const loop = freshLoop();
  const ctx = ctxAt(100000, 100000, 30);
  const book = bookAt(0.48, 0.52);

  runTick(loop, venue, book, [], T0, ctx);
  check(venue.openCount() === 2, `two-sided policy rested ${venue.openCount()} orders, expected 2`);

  const bidRef = loop.resting.bid!;
  venue.cross("bid", bidRef.price, 2);
  runTick(loop, venue, book, [], T0 + 3000, ctx);
  check(Math.abs((loop.sim.position?.size ?? 0) - 2) < 1e-9, `partial fill gave size ${loop.sim.position?.size}, expected 2`);
  console.log(`  partial fill: ${loop.sim.position?.size} of ${bidRef.size} YES taken, position sized to the confirmation`);

  check(venue.openCount() <= 2, "reconciliation leaked orders after a partial fill");
  let ticks = 0;
  while (loop.resting.ask == null && ticks < 5) {
    ticks += 1;
    runTick(loop, venue, book, [], T0 + 3000 + ticks * 1000, ctx);
  }
  check(loop.resting.ask != null, "no exit ask was rested after the partial entry fill");

  const askRef = loop.resting.ask!;
  venue.cross("ask", askRef.price, askRef.size);
  runTick(loop, venue, book, [], T0 + 20000, ctx);
  check(loop.sim.position == null, "the exit ask filled but the position did not close");
  check(loop.realized > 0, `a spread round trip realized ${loop.realized.toFixed(4)}, expected a profit`);
  console.log(`  round trip closed on the resting ask · realized ${loop.realized >= 0 ? "+" : ""}${loop.realized.toFixed(3)} tUSDC`);
}

{
  // Long run: the reconciler must never leave more than one order per side resting,
  // and every resting order must match what the strategy currently wants.
  const venue = new MockVenue();
  const loop = freshLoop();
  let now = T0;
  let spot = 100000;

  for (let i = 0; i < 240; i += 1) {
    now += 1000;
    spot += Math.sin(i / 7) * 40 + Math.cos(i / 3) * 15;
    const mid = Math.min(0.9, Math.max(0.1, 0.5 + (spot - 100000) / 4000));
    const book = bookAt(Number((mid - 0.02).toFixed(4)), Number((mid + 0.02).toFixed(4)));
    const ctx = ctxAt(spot, 100000, 30 - i / 60, T0);

    if (i % 17 === 0 && loop.resting.bid) venue.cross("bid", loop.resting.bid.price, 5);
    if (i % 23 === 0 && loop.resting.ask) venue.cross("ask", loop.resting.ask.price, 5);

    runTick(loop, venue, book, [], now, ctx);

    if (!check(venue.openCount() <= 2, `tick ${i}: ${venue.openCount()} orders resting, never more than 2 allowed`)) break;
    const tracked = [loop.resting.bid, loop.resting.ask].filter(Boolean).length;
    if (!check(tracked === venue.openCount(), `tick ${i}: tracking ${tracked} refs but ${venue.openCount()} orders are open (leak)`)) break;
  }

  const txs = venue.placed + venue.cancelled;
  const perMinute = txs / 4;
  console.log(`  240 ticks (4 min): ${venue.placed} placed, ${venue.cancelled} cancelled, ${loop.fills} confirmed fills, ${loop.takerExits} taker exits`);
  console.log(`  realized ${loop.realized >= 0 ? "+" : ""}${loop.realized.toFixed(3)} tUSDC · ${venue.openCount()} orders still open`);
  console.log(`  transaction rate ${perMinute.toFixed(1)}/min on a book moving every second`);
  check(perMinute <= 60, `quote churn is ${perMinute.toFixed(1)} tx/min — the submission floor is not holding`);

  // Teardown: the desired book goes empty and everything must come off.
  const teardown = deriveQuoteActions({ bid: null, ask: null }, loop.resting);
  for (const action of teardown) {
    if (action.kind === "cancel") venue.cancel(action.order.id);
  }
  check(venue.openCount() === 0, `teardown left ${venue.openCount()} orders resting`);
  console.log("  teardown cancels every resting order");
}

{
  // Flatten-into-expiry: inside flattenSec the strategy must want nothing resting.
  const ctx = ctxAt(100000, 100000, 0.5);
  const book = bookAt(0.48, 0.52);
  const quoted = stepSim(cfg(false), initialSimState, book, [], T0, ctxAt(100000, 100000, 30));
  const flattened = stepSim(cfg(false), quoted, book, [], T0, ctx);
  check(!flattened.quotes?.bid && !flattened.quotes?.ask, "Mittens still wants quotes inside the flatten window");
  const actions = deriveQuoteActions(flattened.quotes, {
    bid: { id: "a", symbol: SYMBOL, side: "bid", price: 0.45, size: 5, filled: 0, placedAt: T0 },
    ask: null,
  });
  check(actions.length === 1 && actions[0].kind === "cancel", "the flatten window did not cancel the resting bid");
  console.log("  flatten window: quotes withdrawn before expiry");
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nMittens completes the full live quote lifecycle: rest, requote, fill, exit, tear down");
