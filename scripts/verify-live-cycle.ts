import { deriveIntent, canTradeLive, realizedFromClose, type LiveIntent } from "../lib/live-fleet";
import { initialSimState, stepSim, TEMPLATES, type Archetype, type MarketContext, type SimState, type StrategyParams } from "../lib/strategy";
import type { BookSnapshot, Fill } from "../lib/dreamdex";

let failures = 0;
const check = (ok: boolean, label: string) => {
  if (!ok) { failures += 1; console.error(`  FAIL: ${label}`); }
  return ok;
};

const bookAt = (bid: number, ask: number, bidDepth = 50, askDepth = 50): BookSnapshot => ({
  bids: [{ price: bid, qty: bidDepth }],
  asks: [{ price: ask, qty: askDepth }],
  bidDepth,
  askDepth,
  mid: (bid + ask) / 2,
  spread: ask - bid,
  imbalance: bidDepth / (bidDepth + askDepth),
});

const T0 = Date.UTC(2026, 7, 26, 12, 0, 0);
const tape = (side: "buy" | "sell", n: number): Fill[] =>
  Array.from({ length: n }, (_, i) => ({ price: 0.5, qty: 1, side, ts: T0 - (i + 1) * 1000 }));

const ctxAt = (spot: number, strike: number, minsLeft: number): MarketContext => ({
  asset: "BTC", strike, expiry: T0 + minsLeft * 60000, spot, spotPrev: spot, sigma: 0.0008,
});

const params = (a: Archetype): StrategyParams => TEMPLATES.find((t) => t.archetype === a)!.defaults;

interface Case {
  archetype: Archetype;
  label: string;
  book: BookSnapshot;
  fills: Fill[];
  ctx?: MarketContext;
  expect: "YES" | "NO";
  exit: { book: BookSnapshot; at: number; ctx?: MarketContext };
}

const cases: Case[] = [
  { archetype: "maker", label: "bid-dominant book", book: bookAt(0.50, 0.52, 90, 10), fills: [], expect: "YES",
    exit: { book: bookAt(0.58, 0.60, 90, 10), at: T0 + 5000 } },
  { archetype: "maker", label: "ask-dominant book", book: bookAt(0.50, 0.52, 10, 90), fills: [], expect: "NO",
    exit: { book: bookAt(0.40, 0.42, 10, 90), at: T0 + 5000 } },
  { archetype: "momentum", label: "buy-skewed tape", book: bookAt(0.50, 0.52), fills: tape("buy", 6), expect: "YES",
    exit: { book: bookAt(0.60, 0.62), at: T0 + 5000 } },
  { archetype: "fade", label: "buy-skewed tape", book: bookAt(0.50, 0.52), fills: tape("buy", 6), expect: "NO",
    exit: { book: bookAt(0.40, 0.42), at: T0 + 5000 } },
  { archetype: "fairvalue", label: "contract under model", book: bookAt(0.38, 0.40), fills: [], ctx: ctxAt(100600, 100000, 30), expect: "YES",
    exit: { book: bookAt(0.52, 0.54), at: T0 + 5000, ctx: ctxAt(100600, 100000, 29) } },
  { archetype: "fairvalue", label: "contract over model", book: bookAt(0.98, 0.99), fills: [], ctx: ctxAt(100600, 100000, 30), expect: "NO",
    exit: { book: bookAt(0.80, 0.82), at: T0 + 5000, ctx: ctxAt(100600, 100000, 29) } },
  { archetype: "theta", label: "settled above strike, held into expiry", book: bookAt(0.85, 0.88), fills: [], ctx: ctxAt(100600, 100000, 2), expect: "YES",
    exit: { book: bookAt(0.95, 0.97), at: T0 + 5000, ctx: { ...ctxAt(100900, 100000, 2), expiry: T0 + 6000 } } },
  { archetype: "theta", label: "settled below strike, held into expiry", book: bookAt(0.12, 0.15), fills: [], ctx: ctxAt(99400, 100000, 2), expect: "NO",
    exit: { book: bookAt(0.03, 0.05), at: T0 + 5000, ctx: { ...ctxAt(99100, 100000, 2), expiry: T0 + 6000 } } },
];

console.log("live buy/sell cycle per archetype\n");
const rows: string[] = [];

for (const c of cases) {
  const cfg = { archetype: c.archetype, params: params(c.archetype) };
  console.log(`${c.archetype} — ${c.label}`);

  const opened = stepSim(cfg, initialSimState, c.book, c.fills, T0, c.ctx);
  const openIntent = deriveIntent(initialSimState, opened, c.book);
  const okOpen =
    check(openIntent != null, "no open intent produced") &&
    check(openIntent!.kind === "open", "open intent has wrong kind") &&
    check(openIntent!.outcome === c.expect, `expected ${c.expect}, got ${openIntent?.outcome}`) &&
    check(openIntent!.size > 0, "open size not positive") &&
    check(openIntent!.price > 0 && openIntent!.price < 1, `open price out of range: ${openIntent?.price}`);

  let okClose = false;
  let closeIntent: LiveIntent | null = null;
  if (okOpen) {
    const held: SimState = opened;
    const closed = stepSim(cfg, held, c.exit.book, c.fills, c.exit.at, c.exit.ctx ?? c.ctx);
    closeIntent = deriveIntent(held, closed, c.exit.book);
    okClose =
      check(closeIntent != null, "no close intent produced — the cat cannot sell") &&
      check(closeIntent!.kind === "close", "close intent has wrong kind") &&
      check(closeIntent!.outcome === c.expect, "close sells a different outcome than it bought") &&
      check(Math.abs(closeIntent!.size - openIntent!.size) < 1e-9, "close size does not match the position") &&
      check(closeIntent!.price > 0 && closeIntent!.price < 1, `close price out of range: ${closeIntent?.price}`);
  }

  if (okOpen && okClose) {
    const pnl = realizedFromClose(openIntent!.price, closeIntent!.price, closeIntent!.size);
    check(pnl > 0, `a favourable exit produced non-positive PnL: ${pnl.toFixed(4)}`);
    console.log(`  BUY  ${openIntent!.size} ${openIntent!.outcome} @ ${(openIntent!.price * 100).toFixed(1)}%`);
    console.log(`  SELL ${closeIntent!.size} ${closeIntent!.outcome} @ ${(closeIntent!.price * 100).toFixed(1)}%  ->  ${pnl >= 0 ? "+" : ""}${pnl.toFixed(3)} tUSDC`);
    rows.push(`${c.archetype.padEnd(11)} ${c.expect.padEnd(4)} buy ok  sell ok  pnl ${pnl >= 0 ? "+" : ""}${pnl.toFixed(3)}`);
  } else {
    rows.push(`${c.archetype.padEnd(11)} ${c.expect.padEnd(4)} ${okOpen ? "buy ok  SELL FAILED" : "BUY FAILED"}`);
  }
  console.log("");
}

console.log("summary");
for (const r of rows) console.log("  " + r);
console.log("");
for (const t of TEMPLATES) {
  console.log(`  ${t.cat.padEnd(9)} ${t.archetype.padEnd(12)} live-capable: ${canTradeLive(t.archetype)}`);
}

console.log("\nexit conditions that must produce a sell\n");

interface ExitCase {
  archetype: Archetype;
  reason: string;
  open: { book: BookSnapshot; fills: Fill[]; ctx?: MarketContext };
  exit: { book: BookSnapshot; fills: Fill[]; at: number; ctx?: MarketContext };
}

const wideCtx = ctxAt(100600, 100000, 30);
const tapeOpen = { book: bookAt(0.50, 0.52), fills: tape("buy", 6) };

const exitCases: ExitCase[] = [
  { archetype: "momentum", reason: "take-profit", open: tapeOpen, exit: { book: bookAt(0.60, 0.62), fills: tape("buy", 6), at: T0 + 5000 } },
  { archetype: "momentum", reason: "stop-loss", open: tapeOpen, exit: { book: bookAt(0.48, 0.50), fills: tape("buy", 6), at: T0 + 5000 } },
  { archetype: "momentum", reason: "time-stop", open: tapeOpen, exit: { book: bookAt(0.52, 0.54), fills: tape("buy", 6), at: T0 + 400_000 } },
  { archetype: "momentum", reason: "tape-flip", open: tapeOpen, exit: { book: bookAt(0.52, 0.54), fills: tape("sell", 6), at: T0 + 5000 } },
  { archetype: "maker", reason: "take-profit", open: { book: bookAt(0.50, 0.52, 90, 10), fills: [] }, exit: { book: bookAt(0.58, 0.60, 90, 10), fills: [], at: T0 + 5000 } },
  { archetype: "maker", reason: "stop-loss", open: { book: bookAt(0.50, 0.52, 90, 10), fills: [] }, exit: { book: bookAt(0.47, 0.49, 90, 10), fills: [], at: T0 + 5000 } },
  { archetype: "fade", reason: "take-profit", open: tapeOpen, exit: { book: bookAt(0.42, 0.44), fills: tape("buy", 6), at: T0 + 5000 } },
  { archetype: "fairvalue", reason: "take-profit", open: { book: bookAt(0.38, 0.40), fills: [], ctx: wideCtx }, exit: { book: bookAt(0.46, 0.48), fills: [], at: T0 + 5000, ctx: wideCtx } },
  { archetype: "fairvalue", reason: "stop-loss", open: { book: bookAt(0.38, 0.40), fills: [], ctx: wideCtx }, exit: { book: bookAt(0.34, 0.36), fills: [], at: T0 + 5000, ctx: wideCtx } },
  { archetype: "fairvalue", reason: "expiry", open: { book: bookAt(0.38, 0.40), fills: [], ctx: wideCtx }, exit: { book: bookAt(0.40, 0.42), fills: [], at: T0 + 5000, ctx: { ...wideCtx, expiry: T0 + 20_000 } } },
  { archetype: "theta", reason: "stop-loss", open: { book: bookAt(0.85, 0.88), fills: [], ctx: ctxAt(100600, 100000, 2) }, exit: { book: bookAt(0.80, 0.82), fills: [], at: T0 + 5000, ctx: ctxAt(100600, 100000, 1.9) } },
  { archetype: "theta", reason: "strike-recross", open: { book: bookAt(0.85, 0.88), fills: [], ctx: ctxAt(100600, 100000, 2) }, exit: { book: bookAt(0.86, 0.89), fills: [], at: T0 + 5000, ctx: ctxAt(100000.5, 100000, 1.9) } },
  { archetype: "theta", reason: "expiry", open: { book: bookAt(0.85, 0.88), fills: [], ctx: ctxAt(100600, 100000, 2) }, exit: { book: bookAt(0.95, 0.97), fills: [], at: T0 + 5000, ctx: { ...ctxAt(100900, 100000, 2), expiry: T0 + 6000 } } },
];

for (const e of exitCases) {
  const cfg = { archetype: e.archetype, params: params(e.archetype) };
  const held = stepSim(cfg, initialSimState, e.open.book, e.open.fills, T0, e.open.ctx);
  if (!check(held.position != null, `${e.archetype}/${e.reason}: could not open a position to test the exit`)) continue;
  const closed = stepSim(cfg, held, e.exit.book, e.exit.fills, e.exit.at, e.exit.ctx ?? e.open.ctx);
  const intent = deriveIntent(held, closed, e.exit.book);
  const ok = check(intent?.kind === "close", `${e.archetype}/${e.reason}: no sell produced`);
  const detail = closed.log[0]?.detail ?? "";
  console.log(`  ${e.archetype.padEnd(11)} ${e.reason.padEnd(14)} ${ok ? "sell ok" : "NO SELL"}  ${detail.split(" · ").slice(1, 2).join("")}`);
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nall archetypes complete a buy and a sell");
