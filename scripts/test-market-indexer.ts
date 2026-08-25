import assert from "node:assert/strict";
import {
  buildLogRanges,
  chainObservationToRow,
  dedupeObservations,
  mergeMarketRows,
  normalizeMarketCreatedLog,
  reconcileObservations,
} from "../lib/market-universe/indexer";
import type { ChainMarketObservation, LiveMarketRow } from "../lib/market-universe/types";

const baseArgs = {
  marketId: "0xmarket-1",
  market: "0x1111111111111111111111111111111111111111",
  pool: "0x2222222222222222222222222222222222222222",
  oracleQuestionId: "101",
  operatorId: "4",
  venueId: "0xvenue-1",
  creator: "0x3333333333333333333333333333333333333333",
  collateral: "0x4444444444444444444444444444444444444444",
  yesId: "201",
  noId: "202",
  nonce: "1",
  outcomeSlotCount: "2",
  marketType: "0",
  tradingStart: "1999999000",
  expiry: "2000001000",
  voidPolicy: "0",
  asset: "BTC",
  strike: "7750000",
  question: "Will BTC settle above 77,500?",
  context: "0x",
};

function observation(overrides: Partial<ChainMarketObservation["args"]> = {}, blockNumber = 100): ChainMarketObservation {
  return {
    chainId: 50312,
    address: "0x5555555555555555555555555555555555555555",
    blockNumber,
    blockHash: `0x${blockNumber.toString(16).padStart(64, "0")}`,
    transactionHash: `0x${(blockNumber + 1).toString(16).padStart(64, "0")}`,
    logIndex: 3,
    args: { ...baseArgs, ...overrides },
  };
}

function rawLog(): Parameters<typeof normalizeMarketCreatedLog>[0] {
  return {
    address: "0x3ecc694cef705358864a646142ac17a90e29e388",
    blockNumber: BigInt(123),
    blockHash: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    transactionHash: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    logIndex: 7,
    args: {
      marketId: "0xMARKET-RAW",
      market: "0x1111111111111111111111111111111111111111",
      pool: "0x2222222222222222222222222222222222222222",
      oracleQuestionId: BigInt(101),
      operatorId: 4,
      venueId: "0xVENUE-RAW",
      creator: "0x3333333333333333333333333333333333333333",
      collateral: "0x4444444444444444444444444444444444444444",
      yesId: BigInt(201),
      noId: BigInt(202),
      nonce: BigInt(1),
      outcomeSlotCount: 2,
      marketType: 0,
      tradingStart: BigInt(1999999000),
      expiry: BigInt(2000001000),
      voidPolicy: 0,
      asset: "BTC",
      strike: BigInt(7750000),
      question: "Will BTC settle above 77,500?",
      context: "0x",
    },
  } as unknown as Parameters<typeof normalizeMarketCreatedLog>[0];
}

function officialRow(id: string): LiveMarketRow {
  return {
    id: id.toLowerCase(),
    poolAddress: baseArgs.pool,
    asset: "BTC",
    kind: "ladder",
    strikeLabel: "77,500",
    windowLabel: "12:00 UTC",
    interval: "5m",
    expiry: 2_000_001_000_000,
    status: "Trading",
    question: baseArgs.question,
    volumeQuote: 42,
    tradeCount: 19,
    lastPrice: 0.62,
    yesSymbol: "BTC-YES-1",
    source: "indexer",
    trust: "attested",
    sdkReady: true,
    marketAddress: baseArgs.market,
    provenance: [{ source: "indexer", trust: "attested", observedAtSec: 1_999_999_000 }],
  };
}

const ranges = buildLogRanges(10, 2025);
assert.deepEqual(ranges, [
  { fromBlock: 10, toBlock: 1009 },
  { fromBlock: 1010, toBlock: 2009 },
  { fromBlock: 2010, toBlock: 2025 },
]);
assert.deepEqual(buildLogRanges(10, 2025, 2), ranges.slice(0, 2));
assert.deepEqual(buildLogRanges(20, 10), []);

const normalized = normalizeMarketCreatedLog(rawLog());
assert.equal(normalized.address, "0x3ecc694cef705358864a646142ac17a90e29e388");
assert.equal(normalized.args.marketId, "0xmarket-raw");
assert.equal(normalized.args.venueId, "0xvenue-raw");
assert.equal(normalized.args.oracleQuestionId, "101");
assert.equal(normalized.blockNumber, 123);
assert.throws(() => normalizeMarketCreatedLog({ ...rawLog(), address: baseArgs.market } as Parameters<typeof normalizeMarketCreatedLog>[0]), /unexpected module/);

const duplicate = observation({}, 101);
duplicate.logIndex = 4;
const older = observation({}, 99);
const unique = observation({ marketId: "0xmarket-2", market: "0x6666666666666666666666666666666666666666" }, 100);
const deduped = dedupeObservations([older, duplicate, unique]);
assert.equal(deduped.length, 2);
assert.equal(deduped[0]?.args.marketId, "0xmarket-2");
assert.equal(deduped[1]?.logIndex, 4);

const reorged = reconcileObservations(
  [observation({ marketId: "0xstale" }, 150), observation({ marketId: "0xstable" }, 80)],
  [{ fromBlock: 100, toBlock: 199 }],
  [observation({ marketId: "0xreplacement" }, 151)],
);
assert.deepEqual(reorged.map((item) => item.args.marketId), ["0xstable", "0xreplacement"]);

const chainOnly = chainObservationToRow(observation({ marketId: "0xchain-only", strike: "0" }));
assert.equal(chainOnly.source, "chain");
assert.equal(chainOnly.trust, "verified");
assert.equal(chainOnly.sdkReady, false);
assert.equal(chainOnly.kind, "open");
assert.equal(chainOnly.yesSymbol, "");
assert.equal(chainOnly.createdBlock, 100);

const merged = mergeMarketRows(
  [officialRow("0xMARKET-1")],
  [observation(), observation({ marketId: "0xchain-only", strike: "0" })],
  2_000_000_000_000,
);
assert.equal(merged.length, 2);
const mergedOfficial = merged.find((market) => market.id === "0xmarket-1");
assert(mergedOfficial);
assert.equal(mergedOfficial.source, "merged");
assert.equal(mergedOfficial.trust, "verified");
assert.equal(mergedOfficial.sdkReady, true);
assert.equal(mergedOfficial.volumeQuote, 42);
assert.equal(mergedOfficial.yesSymbol, "BTC-YES-1");
assert.equal(mergedOfficial.createdBlock, 100);
assert.equal(mergedOfficial.provenance?.length, 2);

const mergedChainOnly = merged.find((market) => market.id === "0xchain-only");
assert(mergedChainOnly);
assert.equal(mergedChainOnly.sdkReady, false);
assert.equal(mergedChainOnly.source, "chain");

const filtered = mergeMarketRows(
  [],
  [
    observation({ marketId: "0xfuture", tradingStart: "2000002000" }),
    observation({ marketId: "0xexpired", expiry: "1999998000" }),
  ],
  2_000_000_000_000,
);
assert.deepEqual(filtered, []);
assert.doesNotThrow(() => JSON.stringify(merged));

console.log("market indexer validation checks passed");
