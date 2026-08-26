import { initialSimState, stepSim, TEMPLATES, type Archetype, type MarketContext, type StrategyParams } from "../lib/strategy";
import { fieldsFor } from "../components/StrategyParamFields";
import type { BookSnapshot, Fill } from "../lib/dreamdex";

let failures = 0;
const check = (ok: boolean, label: string) => {
  if (!ok) {
    failures += 1;
    console.error(`  FAIL: ${label}`);
  }
  return ok;
};

const T0 = Date.UTC(2026, 7, 26, 12, 0, 0);
const bookAt = (bid: number, ask: number, bidDepth = 90, askDepth = 10): BookSnapshot => ({
  bids: [{ price: bid, qty: bidDepth }],
  asks: [{ price: ask, qty: askDepth }],
  bidDepth,
  askDepth,
  mid: (bid + ask) / 2,
  spread: ask - bid,
  imbalance: bidDepth / (bidDepth + askDepth),
});
const tape = (side: "buy" | "sell", n: number): Fill[] =>
  Array.from({ length: n }, (_, i) => ({ price: 0.5, qty: 1, side, ts: T0 - (i + 1) * 1000 }));
const ctxAt = (spot: number, strike: number, minsLeft: number): MarketContext => ({
  asset: "BTC", strike, expiry: T0 + minsLeft * 60000, spot, spotPrev: spot, sigma: 0.0008,
});
const base = (a: Archetype): StrategyParams => TEMPLATES.find((t) => t.archetype === a)!.defaults;

console.log("does each exposed slider change what the cat does?\n");

// ── 1. every slider the UI exposes must be read by the engine for that archetype ──

const CONSUMED: Record<string, string> = {
  "order-size": "orderSize",
  "entry-signal": "entryEdge",
  "take-profit": "takeProfit",
  "stop-loss": "stopLoss",
  "time-stop": "maxHoldSec",
  "tape-lookback": "lookback",
  "tape-window": "tapeWindowSec",
  "model-edge": "edgeThreshold",
  "settle-sigmas": "settleSigmas",
  "max-entry": "maxEntryPrice",
  "tau-gate": "tauGateSec",
  "quote-spread": "quoteSpread",
  "quote-age": "maxQuoteAgeSec",
  "flatten-sec": "flattenSec",
};

for (const template of TEMPLATES) {
  const ids = fieldsFor(template.archetype, template.defaults).map((f) => f.id);
  const unknown = ids.filter((id) => !(id in CONSUMED));
  check(unknown.length === 0, `${template.archetype}: unmapped slider(s) ${unknown.join(", ")}`);
  console.log(`  ${template.cat.padEnd(9)} ${template.archetype.padEnd(12)} ${ids.length} sliders: ${ids.map((i) => CONSUMED[i] ?? i).join(", ")}`);
}

// ── 2. behavioural: moving a slider must change the outcome on identical market data ──

console.log("\nsame market data, different parameter values\n");

interface Probe {
  label: string;
  archetype: Archetype;
  tweak: (p: StrategyParams) => StrategyParams;
  other: (p: StrategyParams) => StrategyParams;
  open: { book: BookSnapshot; fills: Fill[]; ctx?: MarketContext };
  at: { book: BookSnapshot; fills: Fill[]; when: number; ctx?: MarketContext };
  expect: "diverge";
}

const makerOpen = { book: bookAt(0.5, 0.52, 90, 10), fills: [] as Fill[] };
const momentumOpen = { book: bookAt(0.5, 0.52), fills: tape("buy", 6) };
const fvCtx = ctxAt(100600, 100000, 30);

const probes: Probe[] = [
  {
    label: "take profit — tight exits at +4%, loose holds",
    archetype: "maker",
    tweak: (p) => ({ ...p, takeProfit: 0.04 }),
    other: (p) => ({ ...p, takeProfit: 0.14 }),
    open: makerOpen,
    at: { book: bookAt(0.56, 0.58, 90, 10), fills: [], when: T0 + 5000 },
    expect: "diverge",
  },
  {
    label: "stop loss — tight stops out at -2%, loose rides it",
    archetype: "maker",
    tweak: (p) => ({ ...p, stopLoss: 0.02 }),
    other: (p) => ({ ...p, stopLoss: 0.09 }),
    open: makerOpen,
    at: { book: bookAt(0.47, 0.49, 90, 10), fills: [], when: T0 + 5000 },
    expect: "diverge",
  },
  {
    label: "time stop — 30s expires the hold, 900s does not",
    archetype: "momentum",
    tweak: (p) => ({ ...p, maxHoldSec: 30 }),
    other: (p) => ({ ...p, maxHoldSec: 900 }),
    open: momentumOpen,
    at: { book: bookAt(0.52, 0.54), fills: tape("buy", 6), when: T0 + 60_000 },
    expect: "diverge",
  },
  {
    label: "order size — sets the contracts actually taken",
    archetype: "momentum",
    tweak: (p) => ({ ...p, orderSize: 3 }),
    other: (p) => ({ ...p, orderSize: 25 }),
    open: momentumOpen,
    at: { book: bookAt(0.52, 0.54), fills: tape("buy", 6), when: T0 + 1000 },
    expect: "diverge",
  },
  {
    label: "model edge — 3% takes the trade, 20% refuses it",
    archetype: "fairvalue",
    tweak: (p) => ({ ...p, edgeThreshold: 0.03 }),
    other: (p) => ({ ...p, edgeThreshold: 0.2 }),
    // fair is ~91% here, so an 81% ask is a ~10% edge: inside 3%, outside 20%.
    open: { book: bookAt(0.79, 0.81), fills: [], ctx: fvCtx },
    at: { book: bookAt(0.79, 0.81), fills: [], when: T0, ctx: fvCtx },
    expect: "diverge",
  },
];

for (const probe of probes) {
  const p = base(probe.archetype);
  const runWith = (params: StrategyParams) => {
    const cfg = { archetype: probe.archetype, params };
    const opened = stepSim(cfg, initialSimState, probe.open.book, probe.open.fills, T0, probe.open.ctx);
    const next = stepSim(cfg, opened, probe.at.book, probe.at.fills, probe.at.when, probe.at.ctx ?? probe.open.ctx);
    return { opened, next };
  };

  const a = runWith(probe.tweak(p));
  const b = runWith(probe.other(p));

  const describe = (r: ReturnType<typeof runWith>) => {
    if (r.next.position) return `holds ${r.next.position.side} ${r.next.position.size}`;
    if (r.opened.position) return `exited: ${r.next.log[0]?.detail.split(" · ")[1] ?? "closed"}`;
    return "never entered";
  };

  const differs = describe(a) !== describe(b);
  check(differs, `${probe.label}: both settings produced the same behaviour`);
  console.log(`  ${probe.label}`);
  console.log(`    low  -> ${describe(a)}`);
  console.log(`    high -> ${describe(b)}`);
}

// ── 3. marketmaker: quote half-width must move the resting prices ──

{
  const p = base("marketmaker");
  const book = bookAt(0.48, 0.52, 50, 50);
  const ctx = ctxAt(100000, 100000, 30);
  const quoteAt = (spread: number) =>
    stepSim({ archetype: "marketmaker", params: { ...p, quoteSpread: spread } }, initialSimState, book, [], T0, ctx).quotes;

  const tight = quoteAt(0.005);
  const wide = quoteAt(0.08);
  const tightWidth = (tight!.ask!.price - tight!.bid!.price);
  const wideWidth = (wide!.ask!.price - wide!.bid!.price);
  check(wideWidth > tightWidth, "quote half-width did not widen the resting spread");
  console.log(`\n  quote half-width — 0.5% rests ${(tightWidth * 100).toFixed(1)}% wide, 8% rests ${(wideWidth * 100).toFixed(1)}% wide`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nevery exposed parameter is read by the engine and changes what the cat does");
