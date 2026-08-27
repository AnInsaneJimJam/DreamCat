import {
  DEFAULT_TAPE_WINDOW_SEC,
  initialSimState,
  normCdf,
  stepSim,
  tapeSkew,
  TEMPLATES,
  type Archetype,
  type MarketContext,
  type SimState,
} from "../lib/strategy";
import { resolveFillSide, type BookSnapshot, type Fill, type LiveMarketRow } from "../lib/dreamdex";
import { intervalSpanMs, strikeUsd, windowStartFor } from "../lib/market-context";
import { ACCENTS, dedupeAccents, nextAccent, type FleetCat } from "../lib/fleet";

let failures = 0;
function assert(condition: boolean, label: string): void {
  if (condition) return;
  failures += 1;
  console.error(`FAIL: ${label}`);
}

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

const templateFor = (archetype: Archetype) => TEMPLATES.find((t) => t.archetype === archetype)!;
const bookAt = (bid: number, ask: number): BookSnapshot => ({
  bids: [{ price: bid, qty: 100 }],
  asks: [{ price: ask, qty: 100 }],
  bidDepth: 100,
  askDepth: 100,
  mid: (bid + ask) / 2,
  spread: ask - bid,
  imbalance: 0.5,
});

assert(Math.abs(normCdf(0) - 0.5) < 1e-9, "normCdf is centred at 0.5");
assert(Math.abs(normCdf(1.96) - 0.975) < 1e-3, "normCdf matches the 97.5% quantile");

const now = 1_000_000;
const wide: MarketContext = {
  asset: "BTC",
  strike: 100000,
  expiry: now + 30 * 60000,
  spot: 100600,
  spotPrev: 100500,
  sigma: 0.0008,
};
const late: MarketContext = { ...wide, expiry: now + 120000 };
const fairvalue = { archetype: "fairvalue" as const, params: templateFor("fairvalue").defaults };
const theta = { archetype: "theta" as const, params: templateFor("theta").defaults };

assert(stepSim(fairvalue, initialSimState, bookAt(0.4, 0.42), [], now, wide).position?.side === "YES", "fairvalue buys YES under model price");
assert(stepSim(fairvalue, initialSimState, bookAt(0.98, 0.99), [], now, wide).position?.side === "NO", "fairvalue buys NO over model price");
assert(stepSim(fairvalue, initialSimState, bookAt(0.4, 0.42), [], now).position === null, "fairvalue idles without market context");

assert(stepSim(theta, initialSimState, bookAt(0.85, 0.88), [], now, late).position?.side === "YES", "theta buys the settled side late in the window");
assert(stepSim(theta, initialSimState, bookAt(0.85, 0.95), [], now, late).position === null, "theta refuses entries above its price cap");
assert(stepSim(theta, initialSimState, bookAt(0.85, 0.88), [], now, wide).position === null, "theta waits for its entry window");

const marketmaker = { archetype: "marketmaker" as const, params: templateFor("marketmaker").defaults };
const mmNow = Date.UTC(2026, 7, 26, 11, 0, 0);
const mmCtx: MarketContext = { ...wide, spot: 100000, expiry: mmNow + 30 * 60000 };

const mm = stepSim(marketmaker, initialSimState, bookAt(0.45, 0.55), [], mmNow, mmCtx);
assert(mm.quotes?.bid != null && mm.quotes?.ask != null, "marketmaker rests a two-sided quote");
assert(mm.quotes!.bid!.price < mm.quotes!.ask!.price, "marketmaker quotes a positive spread");
assert(mm.quotes!.bid!.price > 0.45 && mm.quotes!.ask!.price < 0.55, "marketmaker quotes inside a wide book");
assert(mm.position === null && mm.trades === 0, "resting quotes are not a position");

const stale = stepSim(marketmaker, mm, bookAt(0.45, 0.55), [], mmNow + 2000, mmCtx);
assert(stale.quotes?.bid === mm.quotes?.bid && stale.quotes?.ask === mm.quotes?.ask, "quotes rest rather than requote on every tick");

const hitFill: Fill[] = [{ price: mm.quotes!.bid!.price - 0.005, qty: 5, side: "sell", ts: mmNow + 1000 }];
const hit = stepSim(marketmaker, mm, bookAt(0.45, 0.55), hitFill, mmNow + 2000, mmCtx);
assert(hit.position?.side === "YES" && hit.position.entryPrice === mm.quotes!.bid!.price, "a sell print through the resting bid fills it long YES");
assert(hit.quotes?.bid === null && hit.quotes?.ask === null, "quotes are pulled once one side fills");

const staleFill: Fill[] = [{ price: mm.quotes!.bid!.price - 0.005, qty: 5, side: "sell", ts: mmNow - 5000 }];
assert(stepSim(marketmaker, mm, bookAt(0.45, 0.55), staleFill, mmNow + 2000, mmCtx).position === null, "prints older than the quote never fill it");

const lift = stepSim(marketmaker, mm, bookAt(0.45, 0.55), [{ price: mm.quotes!.ask!.price + 0.005, qty: 5, side: "buy", ts: mmNow + 1000 }], mmNow + 2000, mmCtx);
assert(lift.position?.side === "NO", "a buy print through the resting ask leaves the maker short YES");
assert(Math.abs(lift.position!.entryPrice - (1 - mm.quotes!.ask!.price)) < 1e-9, "the short is booked as NO at one minus the ask");

const exiting = stepSim(marketmaker, hit, bookAt(0.45, 0.55), [], mmNow + 3000, mmCtx);
assert(exiting.quotes?.ask != null && exiting.quotes?.bid === null, "a long maker rests only an exit ask");
const exited = stepSim(marketmaker, exiting, bookAt(0.45, 0.55), [{ price: exiting.quotes!.ask!.price + 0.001, qty: 5, side: "buy", ts: mmNow + 4000 }], mmNow + 5000, mmCtx);
assert(exited.position === null && exited.trades === 1 && exited.realizedPnl > 0, "the round trip closes on the exit quote and earns the spread");

const crossed = stepSim(marketmaker, mm, bookAt(mm.quotes!.ask!.price + 0.01, 0.99), [], mmNow + 2000, mmCtx);
assert(crossed.position?.side === "NO", "a book that trades up through the resting ask fills it even with no tape");

const nearExpiry = stepSim(marketmaker, hit, bookAt(0.45, 0.55), [], mmNow + 3000, { ...mmCtx, expiry: mmNow + 5000 });
assert(nearExpiry.position === null && nearExpiry.log[0]?.detail.includes("flatten"), "the maker crosses out to flatten into expiry");

// The SDK resolves a binary fill through the outcome lens before we ever see it,
// so its own `side` outranks the book-relative raw fields underneath.
assert(
  resolveFillSide({ side: "sell", info: { takerIsBid: true, makerSide: "SELL_YES" } }) === "sell",
  "the SDK-resolved side wins over raw book-relative info"
);
assert(resolveFillSide({ side: "buy" }) === "buy", "an explicit buy is taken as-is");

// SELL_YES and SELL_NO are OPPOSITE trades; the old "SELL" prefix test collapsed them.
assert(resolveFillSide({ info: { takerSide: "BUY_YES" } }) === "buy", "takerSide BUY_YES is a buy");
assert(resolveFillSide({ info: { takerSide: "SELL_NO" } }) === "buy", "takerSide SELL_NO is a buy");
assert(resolveFillSide({ info: { takerSide: "SELL_YES" } }) === "sell", "takerSide SELL_YES is a sell");
assert(resolveFillSide({ info: { takerSide: "BUY_NO" } }) === "sell", "takerSide BUY_NO is a sell");

assert(resolveFillSide({ info: { makerSide: "SELL_YES" } }) === "buy", "makerSide SELL_YES means the taker bought YES");
assert(resolveFillSide({ info: { makerSide: "SELL_NO" } }) === "sell", "makerSide SELL_NO is the OPPOSITE of SELL_YES");
assert(resolveFillSide({ info: { makerSide: "BUY_YES" } }) === "sell", "makerSide BUY_YES means the taker sold");
assert(resolveFillSide({ info: { makerSide: "BUY_NO" } }) === "buy", "makerSide BUY_NO means the taker bought");

assert(resolveFillSide({ info: { takerIsBid: true } }) === "buy", "takerIsBid is the last resort");
assert(resolveFillSide({}) === null, "a trade with no usable side information is unclassifiable");

const tapeNow = Date.UTC(2026, 7, 26, 11, 0, 0);
const print = (side: "buy" | "sell", ageSec: number): Fill => ({ price: 0.5, qty: 1, side, ts: tapeNow - ageSec * 1000 });
const freshBuys = [print("buy", 10), print("buy", 20), print("buy", 30), print("buy", 40)];
assert(tapeSkew(freshBuys, 6, tapeNow, DEFAULT_TAPE_WINDOW_SEC) === 1, "recent one-sided flow still reads as full skew");
assert(tapeSkew(freshBuys.map((f) => ({ ...f, ts: tapeNow - 3600_000 })), 6, tapeNow, DEFAULT_TAPE_WINDOW_SEC) === 0, "hour-old prints are ignored entirely");
assert(tapeSkew([print("buy", 5), print("buy", 6)], 6, tapeNow, DEFAULT_TAPE_WINDOW_SEC) === 0, "too few recent prints is no signal rather than a strong one");
assert(tapeSkew([print("buy", 5), print("buy", 6), print("sell", 7), print("sell", 8)], 6, tapeNow, DEFAULT_TAPE_WINDOW_SEC) === 0, "balanced recent flow nets to flat");
assert(
  stepSim(momentum, initialSimState, book, freshBuys.map((f) => ({ ...f, ts: tapeNow - 7200_000 })), tapeNow).position === null,
  "momentum does not fire on a stale tape"
);

// Regression: unsided prints used to default to "buy", manufacturing skew out of
// venue metadata gaps and firing momentum on a tape that said nothing at all.
const unsided = (ageSec: number): Fill => ({ price: 0.5, qty: 1, side: null, ts: tapeNow - ageSec * 1000 });
assert(
  tapeSkew([unsided(5), unsided(6), unsided(7), unsided(8)], 6, tapeNow, DEFAULT_TAPE_WINDOW_SEC) === 0,
  "a tape of unsided prints carries no skew"
);
assert(
  tapeSkew([print("buy", 5), unsided(6), unsided(7), print("sell", 8)], 6, tapeNow, DEFAULT_TAPE_WINDOW_SEC) === 0,
  "unsided prints are skipped rather than counted as buys"
);
assert(
  stepSim(momentum, initialSimState, book, [unsided(5), unsided(6), unsided(7), unsided(8)], tapeNow).position === null,
  "momentum does not fire on an unsided tape"
);
assert(
  stepSim(momentum, initialSimState, book, freshBuys, tapeNow).position?.side === "YES",
  "momentum still fires on a genuinely buy-skewed tape"
);

const asRow = (partial: Partial<LiveMarketRow>) => partial as LiveMarketRow;
assert(strikeUsd(asRow({ kind: "ladder", strike: "7836955", strikeLabel: "78,369.55" })) === 78369.55, "strikeUsd reads the raw cents strike");
assert(strikeUsd(asRow({ kind: "ladder", strikeLabel: "78,369.55" })) === 78369.55, "strikeUsd falls back to the formatted label");
assert(strikeUsd(asRow({ kind: "open", strikeLabel: "vs open" })) === null, "strikeUsd rejects above-open windows");

assert(intervalSpanMs("15m") === 900000, "intervalSpanMs parses minutes");
assert(intervalSpanMs("4h") === 14400000, "intervalSpanMs parses hours");
assert(intervalSpanMs("24h") === 86400000, "intervalSpanMs parses day-length hour windows");
assert(intervalSpanMs("") === null, "intervalSpanMs rejects an empty label");
const expiryAt = Date.UTC(2026, 7, 26, 11, 0, 0);
assert(windowStartFor(asRow({ kind: "open", interval: "15m", expiry: expiryAt })) === expiryAt - 900000, "windowStartFor derives the start from expiry and interval");
assert(windowStartFor(asRow({ kind: "open", interval: "15m", expiry: expiryAt, tradingStart: 1787741100 })) === 1787741100000, "windowStartFor prefers tradingStart and normalises seconds");
assert(windowStartFor(asRow({ kind: "open", interval: "weekly", expiry: expiryAt })) === null, "windowStartFor gives up on an unparseable interval");

const asCat = (slot: number, accent: string) => ({ slot, accent, name: `c${slot}` }) as FleetCat;

assert(nextAccent([]) === ACCENTS[0], "the first cat takes the first accent");
assert(nextAccent([asCat(0, ACCENTS[0])]) === ACCENTS[1], "the next cat takes the next free accent");
assert(
  nextAccent([asCat(0, ACCENTS[0]), asCat(1, ACCENTS[2])]) === ACCENTS[1],
  "a gap left by a removed cat is reused before later colours"
);

const collided = dedupeAccents([asCat(0, ACCENTS[0]), asCat(5, ACCENTS[0]), asCat(6, "#f2b84b")]);
assert(new Set(collided.map((cat) => cat.accent)).size === 3, "duplicate and unknown accents are separated");
assert(collided.every((cat) => ACCENTS.includes(cat.accent)), "repaired accents come from the palette");
assert(collided[0].accent === ACCENTS[0], "the first holder of a colour keeps it");

const full = ACCENTS.map((accent, index) => asCat(index, accent));
assert(new Set(dedupeAccents(full).map((cat) => cat.accent)).size === ACCENTS.length, "a full distinct fleet is left alone");

if (failures > 0) {
  console.error(`engine self-check: ${failures} assertion${failures === 1 ? "" : "s"} failed`);
  process.exit(1);
}
console.log("engine self-check: all assertions passed");
