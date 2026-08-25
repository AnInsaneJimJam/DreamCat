import assert from "node:assert/strict";
import {
  aggregateSpotFlow,
  classifySpotFlow,
  mergeSpotFlowTrades,
  parseBinanceAggTrade,
  parseBinanceKline,
  spotTradesFromKline,
} from "../lib/spot-flow";

const kline = parseBinanceKline([
  100_000,
  "100",
  "102",
  "99",
  "101",
  "10",
  100_999,
  "1005",
  12,
  "6",
  "603",
  "0",
]);
assert(kline, "parses Binance 1s kline");
const historical = spotTradesFromKline(kline, "BTC");
const staleLive = parseBinanceAggTrade({ a: "20", p: "100", q: "1", T: 100_500, m: false }, "BTC");
const currentLive = parseBinanceAggTrade({ a: "21", p: "101", q: "1", T: 101_500, m: false }, "BTC");
assert(staleLive && currentLive, "parses REST-compatible aggTrades");

const merged = mergeSpotFlowTrades(
  [staleLive, currentLive],
  historical,
  102_000,
  { BTC: { start: 100_000, end: 100_999, buckets: 1, expectedBuckets: 1, complete: true, bucketStarts: [100_000] } },
);
assert(!merged.some((trade) => trade.id === staleLive.id), "removes live prints covered by historical kline");
assert(merged.some((trade) => trade.id === currentLive.id), "keeps current-second live prints");
assert(merged.some((trade) => trade.origin === "kline"), "keeps historical kline prints");

const hydrated = mergeSpotFlowTrades(
  [staleLive, currentLive],
  historical,
  102_000,
  { BTC: { start: 100_000, end: 100_999, buckets: 1, expectedBuckets: 1, complete: true, bucketStarts: [100_000] } },
);
const delayedCovered = parseBinanceAggTrade({ a: "22", p: "100", q: "1", T: 100_750, m: false }, "BTC");
assert(delayedCovered, "parses delayed covered live trade");
const afterHydration = mergeSpotFlowTrades(
  hydrated,
  [delayedCovered],
  102_000,
  { BTC: { start: 100_000, end: 100_999, buckets: 1, expectedBuckets: 1, complete: true, bucketStarts: [100_000] } },
);
assert(!afterHydration.some((trade) => trade.id === delayedCovered.id), "rejects delayed live trade inside covered kline second");

const partialCoverage = { start: 100_000, end: 101_999, buckets: 1, expectedBuckets: 2, complete: false, bucketStarts: [100_000] };
const missingSecondLive = parseBinanceAggTrade({ a: "23", p: "102", q: "1", T: 101_500, m: false }, "BTC");
assert(missingSecondLive, "parses live trade in missing partial-backfill second");
const partialMerge = mergeSpotFlowTrades(historical, [missingSecondLive], 102_000, { BTC: partialCoverage });
assert(partialMerge.some((trade) => trade.id === missingSecondLive.id), "retains live trade inside a missing backfill second");

const olderId = parseBinanceAggTrade({ a: "2", p: "100", q: "1", T: 200, m: false }, "BTC");
const newerId = parseBinanceAggTrade({ a: "10", p: "110", q: "1", T: 200, m: false }, "BTC");
assert(olderId && newerId, "parses numeric aggregate IDs");
const ordered = aggregateSpotFlow([newerId, olderId], 300, 200, "BTC");
assert.equal(ordered.lastPrice, 110, "orders aggregate IDs numerically within a timestamp");

const enriched = aggregateSpotFlow([
  { id: "buy-a", asset: "BTC", price: 100, quantity: 2, notional: 200, side: "buy", ts: 1_000, tradeCount: 2, openPrice: 100, highPrice: 101, lowPrice: 99, closePrice: 100.5 },
  { id: "sell-a", asset: "BTC", price: 100.5, quantity: 1, notional: 100.5, side: "sell", ts: 4_000, tradeCount: 1, openPrice: 100, highPrice: 101, lowPrice: 99, closePrice: 100.5 },
], 5_000, 5_000, "BTC");
assert.equal(enriched.grossQuoteVolume, 300.5, "sums gross quote volume");
assert.equal(enriched.averageTradeNotional, 100.16666666666667, "averages notional per trade");
assert.equal(enriched.quoteVolumePerSecond, 60.1, "calculates quote volume pace per second");
assert.equal(enriched.highLowRangePct, (2 / 99) * 100, "calculates high-low range percentage");
assert.equal(enriched.flowRead, "buyers lifting", "classifies buy flow with positive price response");
assert.equal(classifySpotFlow(150, 250, 0), "buy flow absorbed", "classifies buy flow without price response as absorbed");
assert.equal(classifySpotFlow(-150, 250, 0), "sell flow absorbed", "classifies sell flow without price response as absorbed");
assert.equal(classifySpotFlow(-150, 250, -0.1), "sellers pressing", "classifies sell flow with negative price response");
assert.equal(classifySpotFlow(10, 250, 0.1), "balanced/mixed", "keeps low delta share conservative");

console.log("spot-flow self-check: all assertions passed");
