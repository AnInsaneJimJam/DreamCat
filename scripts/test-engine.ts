import { assert } from "node:console";
import { initialSimState, stepSim, TEMPLATES, type SimState } from "../lib/strategy";
import type { BookSnapshot, Fill } from "../lib/dreamdex";

const book: BookSnapshot = {
  bids: [{ price: 0.6, qty: 100 }],
  asks: [{ price: 0.62, qty: 100 }],
  bidDepth: 100,
  askDepth: 100,
  mid: 0.61,
  spread: 0.02,
  imbalance: 0.5,
};
const buySkew: Fill[] = Array.from({ length: 6 }, () => ({ price: 0.62, qty: 5, side: "buy", ts: 0 }));

const momentum = { archetype: "momentum" as const, params: TEMPLATES[1].defaults };

let s: SimState = initialSimState;
s = stepSim(momentum, s, book, buySkew, 1000);
assert(s.position?.side === "YES" && s.position.entryPrice === 0.62, "momentum opens YES on buy skew");

s = stepSim(momentum, s, book, buySkew, 2000);
assert(s.position !== null, "holds while no exit condition");

const winBook: BookSnapshot = { ...book, bids: [{ price: 0.68, qty: 100 }] };
s = stepSim(momentum, s, winBook, buySkew, 3000);
assert(s.position === null && s.realizedPnl > 0 && s.trades === 1 && s.wins === 1, "closes at take-profit with profit");

const fade = { archetype: "fade" as const, params: TEMPLATES[2].defaults };
let f: SimState = initialSimState;
f = stepSim(fade, f, book, buySkew, 1000);
assert(f.position?.side === "NO", "fade opens NO against buy skew");
f = stepSim(fade, f, book, buySkew, 2000);
assert(f.position?.side === "NO", "NO holds while buy skew persists (no churn)");
f = stepSim(fade, f, book, buySkew, 1000 + TEMPLATES[2].defaults.maxHoldSec * 1000 + 5000);
assert(f.position === null, "NO exits via time-stop");

const quiet: Fill[] = [];
let m: SimState = initialSimState;
m = stepSim(momentum, m, book, quiet, 1000);
assert(m.position === null && m.log.length === 0, "no entry without signal");

console.log("engine self-check: all assertions passed");
