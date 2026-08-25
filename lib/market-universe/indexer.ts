import {
  SOMNIA_TESTNET_ADDRESSES,
  SomniaMarkets,
  binaryModuleReadAbi,
  isBinaryMarket,
} from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import {
  createPublicClient,
  decodeEventLog,
  http,
  parseAbi,
  parseAbiItem,
  type Address,
  type Hash,
  type Hex,
  type Log,
} from "viem";
import {
  finiteNumber,
  normalizeAddress,
  normalizeMarketId,
  scalarString,
  type ChainMarketEnrichment,
  type ChainMarketObservation,
  type ChainSyncResult,
  type LiveMarketRow,
  type LogRange,
  type MarketBookMetadata,
  type MarketOutcome,
  type MarketCreatedArgs,
  type MarketsResponse,
} from "./types";

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql";
const RPC_URL = process.env.SOMNIA_RPC_URL ?? "https://api.infra.testnet.somnia.network";
const WS_RPC_URL = process.env.NEXT_PUBLIC_WS_RPC_URL ?? "wss://api.infra.testnet.somnia.network/ws";
const MODULE_ADDRESS = SOMNIA_TESTNET_ADDRESSES.binaryModule;
const DEFAULT_START_BLOCK = 440_002_812;
const START_BLOCK = envInteger("DREAMDEX_MARKETS_START_BLOCK", DEFAULT_START_BLOCK);
const BACKFILL_CHUNKS = envInteger("DREAMDEX_MARKETS_BACKFILL_CHUNKS", 6);
const REORG_WINDOW_BLOCKS = envInteger(
  "DREAMDEX_MARKETS_REORG_WINDOW_BLOCKS",
  envInteger("DREAMDEX_MARKETS_RECENT_BLOCKS", 2_000),
);
const SYNC_TTL_MS = envInteger("DREAMDEX_MARKETS_SYNC_TTL_MS", 4_000);
const CHUNK_SIZE = 1_000;
const MARKET_STATUS_NAMES = ["Listed", "Trading", "Locked", "Settling", "Resolved", "Voided"] as const;

const metadataAbi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const binaryMarketStateAbi = parseAbi([
  "function outcomeToken() view returns (address)",
  "function status() view returns (uint8)",
  "function backing() view returns (uint256)",
  "function payoutNumerators() view returns (uint256[])",
  "function isResolved() view returns (bool)",
  "function isVoided() view returns (bool)",
]);

const binaryPoolStateAbi = parseAbi([
  "function getBookLevels(bool isBid, uint64 numLevels) view returns ((uint256 price, uint256 quantity)[])",
  "function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))",
]);

export const marketCreatedEvent = parseAbiItem(
  "event MarketCreated(bytes32 indexed marketId, address indexed market, address indexed pool, uint256 oracleQuestionId, uint32 operatorId, bytes32 venueId, address creator, address collateral, uint256 yesId, uint256 noId, uint64 nonce, uint8 outcomeSlotCount, uint8 marketType, uint64 tradingStart, uint64 expiry, uint8 voidPolicy, string asset, uint256 strike, string question, bytes context)",
);

type MarketCreatedLog = Log<bigint, number, false, typeof marketCreatedEvent>;

type UniverseState = {
  nextBlock: number;
  headBlock: number;
  observations: Map<string, ChainMarketObservation>;
  lastSyncAt: number;
  error: string | null;
};

const state: UniverseState = {
  nextBlock: START_BLOCK,
  headBlock: START_BLOCK - 1,
  observations: new Map(),
  lastSyncAt: 0,
  error: null,
};

let syncPromise: Promise<ChainSyncResult> | null = null;
let officialClient: SomniaMarkets | null = null;

function envInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown market indexer error";
}

function getOfficialClient(): SomniaMarkets {
  if (!officialClient) {
    officialClient = new SomniaMarkets({
      indexerUrl: INDEXER_URL,
      chain: somniaShannon,
      wsRpcUrl: WS_RPC_URL,
      addresses: SOMNIA_TESTNET_ADDRESSES,
    });
  }
  return officialClient;
}

const publicClient = createPublicClient({ chain: somniaShannon, transport: http(RPC_URL) });

const canonicalModuleAddress = normalizeAddress(MODULE_ADDRESS);

export function buildLogRanges(fromBlock: number, toBlock: number, limit = Number.POSITIVE_INFINITY): LogRange[] {
  if (!Number.isSafeInteger(fromBlock) || !Number.isSafeInteger(toBlock) || fromBlock < 0 || toBlock < fromBlock) return [];
  const ranges: LogRange[] = [];
  for (let from = fromBlock; from <= toBlock && ranges.length < limit; from += CHUNK_SIZE) {
    ranges.push({ fromBlock: from, toBlock: Math.min(from + CHUNK_SIZE - 1, toBlock) });
  }
  return ranges;
}

function required(value: unknown, label: string): string {
  const normalized = scalarString(value);
  if (normalized == null || normalized === "") throw new Error(`MarketCreated missing ${label}`);
  return normalized;
}

export function normalizeMarketCreatedLog(log: MarketCreatedLog): ChainMarketObservation {
  if (normalizeAddress(log.address) !== canonicalModuleAddress) {
    throw new Error(`MarketCreated log came from an unexpected module: ${log.address}`);
  }
  const args = log.args;
  const normalized: MarketCreatedArgs = {
    marketId: normalizeMarketId(required(args.marketId, "marketId")),
    market: normalizeAddress(required(args.market, "market")),
    pool: normalizeAddress(required(args.pool, "pool")),
    oracleQuestionId: required(args.oracleQuestionId, "oracleQuestionId"),
    operatorId: required(args.operatorId, "operatorId"),
    venueId: normalizeMarketId(required(args.venueId, "venueId")),
    creator: normalizeAddress(required(args.creator, "creator")),
    collateral: normalizeAddress(required(args.collateral, "collateral")),
    yesId: required(args.yesId, "yesId"),
    noId: required(args.noId, "noId"),
    nonce: required(args.nonce, "nonce"),
    outcomeSlotCount: required(args.outcomeSlotCount, "outcomeSlotCount"),
    marketType: required(args.marketType, "marketType"),
    tradingStart: required(args.tradingStart, "tradingStart"),
    expiry: required(args.expiry, "expiry"),
    voidPolicy: required(args.voidPolicy, "voidPolicy"),
    asset: required(args.asset, "asset"),
    strike: required(args.strike, "strike"),
    question: required(args.question, "question"),
    context: required(args.context, "context"),
  };
  return {
    chainId: somniaShannon.id,
    address: normalizeAddress(log.address),
    blockNumber: Number(log.blockNumber ?? BigInt(0)),
    blockHash: log.blockHash ?? null,
    transactionHash: log.transactionHash ?? "",
    logIndex: log.logIndex ?? 0,
    args: normalized,
  };
}

export function dedupeObservations(observations: readonly ChainMarketObservation[]): ChainMarketObservation[] {
  const byId = new Map<string, ChainMarketObservation>();
  for (const observation of observations) {
    const id = normalizeMarketId(observation.args.marketId);
    const current = byId.get(id);
    if (!current || isLaterObservation(observation, current)) {
      byId.set(id, observation);
    }
  }
  return [...byId.values()].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}

function isLaterObservation(left: ChainMarketObservation, right: ChainMarketObservation): boolean {
  if (left.blockNumber !== right.blockNumber) return left.blockNumber > right.blockNumber;
  if (left.logIndex !== right.logIndex) return left.logIndex > right.logIndex;
  return left.transactionHash > right.transactionHash;
}

function observationInRange(observation: ChainMarketObservation, range: LogRange): boolean {
  return observation.blockNumber >= range.fromBlock && observation.blockNumber <= range.toBlock;
}

export function reconcileObservations(
  existing: readonly ChainMarketObservation[],
  ranges: readonly LogRange[],
  incoming: readonly ChainMarketObservation[],
): ChainMarketObservation[] {
  const retained = existing.filter((observation) => !ranges.some((range) => observationInRange(observation, range)));
  return dedupeObservations([...retained, ...incoming]);
}

function storeObservations(incoming: readonly ChainMarketObservation[]): void {
  const reconciled = reconcileObservations([...state.observations.values()], [], incoming);
  state.observations.clear();
  for (const observation of reconciled) state.observations.set(observation.args.marketId, observation);
}

async function logsForRange(range: LogRange): Promise<ChainMarketObservation[]> {
  const logs = await publicClient.getLogs({
    address: MODULE_ADDRESS as Address,
    event: marketCreatedEvent,
    fromBlock: BigInt(range.fromBlock),
    toBlock: BigInt(range.toBlock),
  });
  return logs.map((log) => normalizeMarketCreatedLog(log));
}

async function observationFromTransaction(row: LiveMarketRow): Promise<ChainMarketObservation | null> {
  const transactionHash = row.createdTx;
  if (!transactionHash || !/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) return null;
  const receipt = await publicClient.getTransactionReceipt({ hash: transactionHash as Hash });
  for (const log of receipt.logs) {
    if (normalizeAddress(log.address) !== canonicalModuleAddress) continue;
    try {
      const decoded = decodeEventLog({
        abi: [marketCreatedEvent],
        data: log.data,
        topics: log.topics,
        strict: true,
      });
      if (decoded.eventName !== "MarketCreated") continue;
      const observation = normalizeMarketCreatedLog({
        ...log,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        transactionHash: receipt.transactionHash,
      } as unknown as MarketCreatedLog);
      if (observation.args.marketId === normalizeMarketId(row.id)) return observation;
    } catch {
      continue;
    }
  }
  return null;
}

export async function hydrateOfficialObservations(
  officialMarkets: readonly LiveMarketRow[],
  existing: readonly ChainMarketObservation[] = [],
  limit = 24,
): Promise<ChainMarketObservation[]> {
  const known = new Map(existing.map((observation) => [
    normalizeMarketId(observation.args.marketId),
    observation.transactionHash,
  ]));
  const observations: ChainMarketObservation[] = [];
  let attempted = 0;
  for (const market of officialMarkets) {
    if (attempted >= limit) break;
    const marketId = normalizeMarketId(market.id);
    if (!market.createdTx || known.get(marketId) === market.createdTx) continue;
    attempted += 1;
    try {
      const observation = await observationFromTransaction(market);
      if (observation) {
        known.set(observation.args.marketId, observation.transactionHash);
        observations.push(observation);
      }
    } catch {
      continue;
    }
  }
  return observations;
}

async function scanRanges(ranges: readonly LogRange[], replaceCoverage: boolean): Promise<number> {
  let chunks = 0;
  const incoming: ChainMarketObservation[] = [];
  for (const range of ranges) {
    const observations = await logsForRange(range);
    incoming.push(...observations);
    if (!replaceCoverage) {
      storeObservations(observations);
      state.nextBlock = range.toBlock + 1;
    }
    chunks += 1;
  }
  if (replaceCoverage && ranges.length > 0) {
    const reconciled = reconcileObservations([...state.observations.values()], ranges, incoming);
    state.observations.clear();
    for (const observation of reconciled) state.observations.set(observation.args.marketId, observation);
  }
  return chunks;
}

async function performSync(): Promise<ChainSyncResult> {
  let chunks = 0;
  let error: string | null = null;
  try {
    const headBlock = Number(await publicClient.getBlockNumber());
    state.headBlock = headBlock;
    const recentStart = Math.max(START_BLOCK, headBlock - REORG_WINDOW_BLOCKS + 1);
    chunks += await scanRanges(buildLogRanges(recentStart, headBlock), true);
    if (state.nextBlock <= headBlock) {
      const backfillEnd = Math.min(headBlock, state.nextBlock + BACKFILL_CHUNKS * CHUNK_SIZE - 1);
      chunks += await scanRanges(buildLogRanges(state.nextBlock, backfillEnd, BACKFILL_CHUNKS), false);
    }
    state.error = null;
  } catch (cause) {
    error = errorText(cause);
    state.error = error;
  }
  state.lastSyncAt = Date.now();
  return {
    events: dedupeObservations([...state.observations.values()]),
    headBlock: state.headBlock,
    nextBlock: state.nextBlock,
    complete: state.nextBlock > state.headBlock,
    chunks,
    error,
  };
}

export async function syncChainMarkets(): Promise<ChainSyncResult> {
  if (syncPromise) return syncPromise;
  if (state.lastSyncAt && Date.now() - state.lastSyncAt < SYNC_TTL_MS) {
    return {
      events: dedupeObservations([...state.observations.values()]),
      headBlock: state.headBlock,
      nextBlock: state.nextBlock,
      complete: state.nextBlock > state.headBlock,
      chunks: 0,
      error: state.error,
    };
  }
  syncPromise = performSync().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

function intervalLabel(startSec: number, expirySec: number): string {
  const duration = Math.max(0, expirySec - startSec);
  if (duration % 86_400 === 0) return `${duration / 86_400}d`;
  if (duration % 3_600 === 0) return `${duration / 3_600}h`;
  if (duration % 60 === 0) return `${duration / 60}m`;
  return `${duration}s`;
}

function strikeLabel(strike: string): string {
  const value = finiteNumber(strike);
  if (value == null || value <= 0) return "vs open";
  return (value / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function sanitizeSymbolPart(value: string): string {
  return value.replace(/[^A-Za-z0-9.]+/g, "");
}

function trimStrike(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/\.?0+$/, "");
}

function expiryCode(expirySec: number): string {
  const date = new Date(expirySec * 1000);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = MONTHS[date.getUTCMonth()] ?? "JAN";
  const year = String(date.getUTCFullYear() % 100).padStart(2, "0");
  const datePart = `${day}${month}${year}`;
  if (expirySec % 86_400 === 0) return datePart;
  return `${datePart}-${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function synthesizeChainMarketSymbol(
  asset: string,
  strike: string,
  expirySec: number,
  quoteSymbol: string,
): string {
  const base = sanitizeSymbolPart(asset) || "MKT";
  const strikePart = sanitizeSymbolPart(trimStrike(strike));
  const quote = sanitizeSymbolPart(quoteSymbol) || "QUOTE";
  return `${base}-${strikePart}-${expiryCode(expirySec)}/${quote}`;
}

function statusName(value: number | null, startSec: number, expirySec: number, nowSec = Math.floor(Date.now() / 1000)): string {
  if (value != null && MARKET_STATUS_NAMES[value]) return MARKET_STATUS_NAMES[value];
  if (nowSec < startSec) return "Listed";
  if (nowSec < expirySec) return "Trading";
  return "Settling";
}

function humanRaw(value: unknown, decimals: number): number | null {
  const raw = scalarString(value);
  if (raw == null) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const human = parsed / 10 ** decimals;
  return Number.isFinite(human) ? human : null;
}

function levelPrice(value: unknown, decimals: number): number | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0] as { price?: unknown } | undefined;
  return humanRaw(first?.price, decimals);
}

function marketSymbolWithSuffix(symbol: string, marketId: string): string {
  const suffix = `-${marketId.replace(/^0x/, "").slice(-4).toUpperCase()}`;
  const slash = symbol.lastIndexOf("/");
  return slash === -1 ? `${symbol}${suffix}` : `${symbol.slice(0, slash)}${suffix}${symbol.slice(slash)}`;
}

function outcomeMetadata(
  marketSymbol: string,
  yesId: string,
  noId: string,
): readonly MarketOutcome[] {
  return [
    { label: "YES", index: 0, tokenId: yesId, symbol: `${marketSymbol}#YES` },
    { label: "NO", index: 1, tokenId: noId, symbol: `${marketSymbol}#NO` },
  ];
}

function bookMetadata(
  poolAddress: string,
  marketSymbol: string,
  quoteDecimals: number,
  grid: { tickSize: string | null; lotSize: string | null; minQuantity: string | null },
  bestBid: number | null,
  bestAsk: number | null,
): MarketBookMetadata {
  return {
    poolAddress,
    yesSymbol: `${marketSymbol}#YES`,
    noSymbol: `${marketSymbol}#NO`,
    quoteDecimals,
    tickSize: grid.tickSize,
    lotSize: grid.lotSize,
    minQuantity: grid.minQuantity,
    bestBid,
    bestAsk,
    mid: bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : bestBid ?? bestAsk,
  };
}

async function readChainMarketEnrichment(observation: ChainMarketObservation): Promise<ChainMarketEnrichment> {
  const args = observation.args;
  const fallbackStart = finiteNumber(args.tradingStart) ?? 0;
  const fallbackExpiry = finiteNumber(args.expiry) ?? 0;
  const eventPool = normalizeAddress(args.pool);
  const eventMarket = normalizeAddress(args.market);
  const eventCollateral = normalizeAddress(args.collateral);
  const moduleRead = /^0x[0-9a-f]{64}$/i.test(args.marketId)
    ? await publicClient.readContract({
      address: MODULE_ADDRESS as Address,
      abi: binaryModuleReadAbi,
      functionName: "markets",
      args: [args.marketId as Hex],
    }).then((value) => value as readonly unknown[]).catch(() => null)
    : null;
  const collateral = normalizeAddress(scalarString(moduleRead?.[3]) ?? eventCollateral);
  const marketAddress = normalizeAddress(scalarString(moduleRead?.[8]) ?? eventMarket);
  const poolAddress = normalizeAddress(scalarString(moduleRead?.[9]) ?? eventPool);
  const yesTokenId = scalarString(moduleRead?.[10]) ?? args.yesId;
  const noTokenId = scalarString(moduleRead?.[11]) ?? args.noId;
  const tradingStart = finiteNumber(scalarString(moduleRead?.[12])) ?? fallbackStart;
  const expiry = finiteNumber(scalarString(moduleRead?.[13])) ?? fallbackExpiry;

  const [quoteSymbolRead, quoteDecimalsRead, nonceRead, stateRead, gridRead, bookRead] = await Promise.allSettled([
    /^0x[0-9a-f]{40}$/i.test(collateral)
      ? publicClient.readContract({ address: collateral as Address, abi: metadataAbi, functionName: "symbol" })
      : Promise.reject(new Error("invalid collateral address")),
    /^0x[0-9a-f]{40}$/i.test(collateral)
      ? publicClient.readContract({ address: collateral as Address, abi: metadataAbi, functionName: "decimals" })
      : Promise.reject(new Error("invalid collateral address")),
    /^0x[0-9a-f]{64}$/i.test(args.marketId)
      ? publicClient.readContract({
        address: MODULE_ADDRESS as Address,
        abi: binaryModuleReadAbi,
        functionName: "marketNonce",
        args: [args.marketId as Hex],
      })
      : Promise.reject(new Error("invalid market id")),
    /^0x[0-9a-f]{40}$/i.test(marketAddress)
      ? Promise.all([
        publicClient.readContract({ address: marketAddress as Address, abi: binaryMarketStateAbi, functionName: "outcomeToken" }),
        publicClient.readContract({ address: marketAddress as Address, abi: binaryMarketStateAbi, functionName: "status" }),
        publicClient.readContract({ address: marketAddress as Address, abi: binaryMarketStateAbi, functionName: "backing" }),
        publicClient.readContract({ address: marketAddress as Address, abi: binaryMarketStateAbi, functionName: "payoutNumerators" }),
        publicClient.readContract({ address: marketAddress as Address, abi: binaryMarketStateAbi, functionName: "isResolved" }),
        publicClient.readContract({ address: marketAddress as Address, abi: binaryMarketStateAbi, functionName: "isVoided" }),
      ])
      : Promise.reject(new Error("invalid market address")),
    /^0x[0-9a-f]{40}$/i.test(poolAddress)
      ? publicClient.readContract({ address: poolAddress as Address, abi: binaryPoolStateAbi, functionName: "getOrderBookParameters" })
      : Promise.reject(new Error("invalid pool address")),
    /^0x[0-9a-f]{40}$/i.test(poolAddress)
      ? Promise.all([
        publicClient.readContract({ address: poolAddress as Address, abi: binaryPoolStateAbi, functionName: "getBookLevels", args: [true, BigInt(1)] }),
        publicClient.readContract({ address: poolAddress as Address, abi: binaryPoolStateAbi, functionName: "getBookLevels", args: [false, BigInt(1)] }),
      ])
      : Promise.reject(new Error("invalid pool address")),
  ]);

  const quoteSymbol = quoteSymbolRead.status === "fulfilled" ? String(quoteSymbolRead.value) : null;
  const quoteDecimals = quoteDecimalsRead.status === "fulfilled" ? Number(quoteDecimalsRead.value) : 6;
  const marketSymbol = synthesizeChainMarketSymbol(args.asset, args.strike, expiry, quoteSymbol ?? collateral.slice(2, 8).toUpperCase());
  const state = stateRead.status === "fulfilled" ? stateRead.value : null;
  const outcomeToken = scalarString(state?.[0]);
  const onchainStatus = state ? finiteNumber(scalarString(state[1])) : null;
  const backing = scalarString(state?.[2]);
  const payout = Array.isArray(state?.[3]) ? state[3] : [];
  const isResolved = state?.[4] === true;
  const isVoided = state?.[5] === true;
  let winningOutcome: number | null = null;
  if (isResolved && payout.length > 0) {
    winningOutcome = 0;
    for (let index = 1; index < payout.length; index += 1) {
      if (BigInt(scalarString(payout[index]) ?? "0") > BigInt(scalarString(payout[winningOutcome]) ?? "0")) winningOutcome = index;
    }
  }
  const status = isVoided ? "Voided" : statusName(onchainStatus, tradingStart, expiry);
  const grid = gridRead.status === "fulfilled"
    ? {
      tickSize: scalarString(gridRead.value.tickSize),
      minQuantity: scalarString(gridRead.value.minQuantity),
      lotSize: scalarString(gridRead.value.lotSize),
    }
    : { tickSize: null, lotSize: null, minQuantity: null };
  const bestBid = bookRead.status === "fulfilled" ? levelPrice(bookRead.value[0], quoteDecimals) : null;
  const bestAsk = bookRead.status === "fulfilled" ? levelPrice(bookRead.value[1], quoteDecimals) : null;
  const book = bookMetadata(poolAddress, marketSymbol, quoteDecimals, grid, bestBid, bestAsk);
  const recordMatchesEvent = moduleRead != null
    && normalizeAddress(scalarString(moduleRead[8])) === eventMarket
    && normalizeAddress(scalarString(moduleRead[9])) === eventPool;
  const executionReady = recordMatchesEvent
    && stateRead.status === "fulfilled"
    && gridRead.status === "fulfilled"
    && /^0x[0-9a-f]{40}$/i.test(outcomeToken ?? "");
  const outcomes = outcomeMetadata(marketSymbol, yesTokenId, noTokenId);
  return {
    marketSymbol,
    yesSymbol: outcomes[0]?.symbol ?? `${marketSymbol}#YES`,
    noSymbol: outcomes[1]?.symbol ?? `${marketSymbol}#NO`,
    outcomes,
    quoteSymbol,
    quoteDecimals,
    status,
    marketAddress,
    poolAddress,
    collateral,
    outcomeToken,
    yesTokenId,
    noTokenId,
    nonce: nonceRead.status === "fulfilled" ? scalarString(nonceRead.value) : scalarString(args.nonce),
    tradingStart,
    expiry,
    isResolved,
    isVoided,
    winningOutcome,
    finalized: false,
    backing,
    executionReady,
    book,
  };
}

const enrichmentCache = new Map<string, { at: number; value: ChainMarketEnrichment }>();

async function enrichChainObservation(observation: ChainMarketObservation): Promise<ChainMarketEnrichment> {
  const key = `${normalizeMarketId(observation.args.marketId)}:${observation.transactionHash}`;
  const cached = enrichmentCache.get(key);
  if (cached && Date.now() - cached.at < SYNC_TTL_MS) return cached.value;
  const value = await readChainMarketEnrichment(observation);
  enrichmentCache.set(key, { at: Date.now(), value });
  return value;
}

async function enrichChainObservations(
  observations: readonly ChainMarketObservation[],
  nowMs = Date.now(),
): Promise<Map<string, ChainMarketEnrichment>> {
  const live = observations.filter((observation) => {
    const start = (finiteNumber(observation.args.tradingStart) ?? 0) * 1000;
    const expiry = (finiteNumber(observation.args.expiry) ?? 0) * 1000;
    return start <= nowMs && expiry > nowMs;
  });
  const settled = await Promise.allSettled(live.map(async (observation) => [
    normalizeMarketId(observation.args.marketId),
    await enrichChainObservation(observation),
  ] as const));
  const result = new Map<string, ChainMarketEnrichment>();
  for (const item of settled) if (item.status === "fulfilled") result.set(item.value[0], item.value[1]);
  return result;
}

export function chainObservationToRow(observation: ChainMarketObservation, enrichment?: ChainMarketEnrichment): LiveMarketRow {
  const startSec = finiteNumber(observation.args.tradingStart) ?? 0;
  const expirySec = finiteNumber(observation.args.expiry) ?? 0;
  const marketSymbol = enrichment?.marketSymbol ?? "";
  const outcomes = enrichment?.outcomes ?? outcomeMetadata(marketSymbol, observation.args.yesId, observation.args.noId);
  return {
    id: observation.args.marketId,
    poolAddress: enrichment?.poolAddress ?? observation.args.pool,
    asset: observation.args.asset,
    kind: Number(observation.args.strike) > 0 ? "ladder" : "open",
    strike: observation.args.strike,
    strikeLabel: strikeLabel(observation.args.strike),
    windowLabel: (enrichment?.expiry ?? expirySec) > 0 ? new Date((enrichment?.expiry ?? expirySec) * 1000).toISOString().slice(11, 16) + " UTC" : "",
    interval: intervalLabel(enrichment?.tradingStart ?? startSec, enrichment?.expiry ?? expirySec),
    expiry: (enrichment?.expiry ?? expirySec) * 1000,
    status: enrichment?.status ?? "Trading",
    question: observation.args.question,
    title: observation.args.question,
    volumeQuote: 0,
    tradeCount: 0,
    lastPrice: enrichment?.book?.mid ?? null,
    yesSymbol: enrichment?.yesSymbol ?? "",
    noSymbol: enrichment?.noSymbol ?? "",
    marketSymbol,
    outcomes,
    quoteSymbol: enrichment?.quoteSymbol ?? null,
    quoteDecimals: enrichment?.quoteDecimals,
    executionMode: "chain-pool",
    executionReady: enrichment?.executionReady ?? false,
    book: enrichment?.book ?? undefined,
    source: "chain",
    trust: "verified",
    sdkReady: false,
    marketAddress: enrichment?.marketAddress ?? observation.args.market,
    nonce: enrichment?.nonce ?? observation.args.nonce,
    collateral: enrichment?.collateral ?? observation.args.collateral,
    creator: observation.args.creator,
    operatorId: observation.args.operatorId,
    venueId: observation.args.venueId,
    yesTokenId: enrichment?.yesTokenId ?? observation.args.yesId,
    noTokenId: enrichment?.noTokenId ?? observation.args.noId,
    outcomeToken: enrichment?.outcomeToken ?? null,
    tradingStart: (enrichment?.tradingStart ?? startSec) * 1000,
    createdBlock: observation.blockNumber,
    createdTx: observation.transactionHash,
    isResolved: enrichment?.isResolved,
    isVoided: enrichment?.isVoided,
    winningOutcome: enrichment?.winningOutcome,
    finalized: enrichment?.finalized,
    backing: enrichment?.backing,
    provenance: [{
      source: "chain",
      trust: "verified",
      observedAtSec: startSec,
      blockNumber: observation.blockNumber,
      transactionHash: observation.transactionHash,
      logIndex: observation.logIndex,
    }],
  };
}

type LoadedMarket = Awaited<ReturnType<SomniaMarkets["loadMarkets"]>>[string];

export function officialMarketToRow(market: LoadedMarket): LiveMarketRow | null {
  if (!market.active || market.type !== "binary" || !isBinaryMarket(market.info)) return null;
  const info = market.info;
  const baseParts = market.base.split("-");
  const strike = Number(info.strike ?? baseParts[1] ?? 0);
  const windowPart = baseParts.find((part) => /^\d{4}$/.test(part)) ?? "";
  const yes = market.outcomes?.find((outcome) => outcome.label === "YES") ?? market.outcomes?.[0];
  const no = market.outcomes?.find((outcome) => outcome.label === "NO") ?? market.outcomes?.[1];
  const marketSymbol = market.symbol;
  const outcomes = (market.outcomes ?? []).map((outcome) => ({
    label: outcome.label,
    index: outcome.index,
    tokenId: outcome.label === "YES" ? scalarString(info.yesTokenId) : scalarString(info.noTokenId),
    symbol: outcome.symbol,
  }));
  return {
    id: normalizeMarketId(String(info.marketId ?? market.id)),
    poolAddress: normalizeAddress(info.poolAddress),
    asset: String(info.asset ?? baseParts[0] ?? ""),
    kind: strike > 0 ? "ladder" : "open",
    strike: scalarString(info.strike),
    strikeLabel: strike > 0 ? (strike / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "vs open",
    windowLabel: windowPart ? `${windowPart.slice(0, 2)}:${windowPart.slice(2)} UTC` : "",
    interval: String(info.interval ?? ""),
    expiry: (finiteNumber(scalarString(info.expiry)) ?? 0) * 1000,
    status: String(info.status),
    question: String(info.question ?? ""),
    title: String(info.question ?? ""),
    volumeQuote: Number(info.cumulativeQuoteVolume ?? 0) / 10 ** info.quoteDecimals,
    tradeCount: Number(info.tradeCount ?? 0),
    lastPrice: info.lastPrice == null ? null : Number(info.lastPrice) / 10 ** info.quoteDecimals,
    yesSymbol: yes?.symbol ?? "",
    noSymbol: no?.symbol ?? "",
    marketSymbol,
    outcomes,
    quoteSymbol: market.quote,
    quoteDecimals: info.quoteDecimals,
    executionMode: "sdk-symbol",
    executionReady: true,
    source: "indexer",
    trust: "attested",
    sdkReady: true,
    marketAddress: normalizeAddress(info.marketAddress),
    nonce: scalarString(info.nonce),
    collateral: normalizeAddress(info.collateral),
    creator: normalizeAddress(info.creator),
    operatorId: scalarString(info.operatorId),
    venueId: normalizeMarketId(info.venueId),
    yesTokenId: scalarString(info.yesTokenId),
    noTokenId: scalarString(info.noTokenId),
    tradingStart: (finiteNumber(scalarString(info.tradingStart)) ?? 0) * 1000,
    createdTx: info.createdByTx,
    provenance: [{
      source: "indexer",
      trust: "attested",
      observedAtSec: finiteNumber(scalarString(info.createdAtTimestamp)) ?? 0,
      transactionHash: info.createdByTx ?? undefined,
    }],
  };
}

export async function loadOfficialMarkets(): Promise<LiveMarketRow[]> {
  const markets = Object.values(await getOfficialClient().loadMarkets(true));
  return markets
    .map(officialMarketToRow)
    .filter((market): market is LiveMarketRow => market !== null && market.status === "Trading")
    .sort((a, b) => b.volumeQuote - a.volumeQuote);
}

export function mergeMarketRows(
  officialMarkets: readonly LiveMarketRow[],
  observations: readonly ChainMarketObservation[],
  nowMs = Date.now(),
  enrichments: ReadonlyMap<string, ChainMarketEnrichment> = new Map(),
): LiveMarketRow[] {
  const merged = new Map(officialMarkets.map((market) => [normalizeMarketId(market.id), market]));
  for (const observation of dedupeObservations(observations)) {
    const chain = chainObservationToRow(observation, enrichments.get(normalizeMarketId(observation.args.marketId)));
    const start = chain.tradingStart ?? 0;
    if (start > nowMs || chain.expiry <= nowMs || chain.isResolved || chain.isVoided || chain.status === "Resolved" || chain.status === "Voided" || chain.status === "Finalized") continue;
    const official = merged.get(chain.id);
    if (!official) {
      merged.set(chain.id, chain);
      continue;
    }
    merged.set(chain.id, {
      ...chain,
      ...official,
      source: "merged",
      trust: "verified",
      sdkReady: true,
      executionMode: official.executionMode ?? "sdk-symbol",
      executionReady: official.executionReady ?? true,
      marketAddress: chain.marketAddress || official.marketAddress,
      nonce: chain.nonce ?? official.nonce,
      collateral: chain.collateral || official.collateral,
      creator: chain.creator || official.creator,
      operatorId: chain.operatorId ?? official.operatorId,
      venueId: chain.venueId || official.venueId,
      yesTokenId: chain.yesTokenId ?? official.yesTokenId,
      noTokenId: chain.noTokenId ?? official.noTokenId,
      tradingStart: chain.tradingStart ?? official.tradingStart,
      createdBlock: chain.createdBlock ?? official.createdBlock,
      createdTx: chain.createdTx ?? official.createdTx,
      provenance: [...(official.provenance ?? []), ...(chain.provenance ?? [])],
    });
  }
  const rows = [...merged.values()];
  const bySymbol = new Map<string, LiveMarketRow[]>();
  for (const row of rows) {
    const symbol = row.marketSymbol ?? row.yesSymbol.replace(/#YES$/, "");
    if (!symbol) continue;
    const group = bySymbol.get(symbol) ?? [];
    group.push(row);
    bySymbol.set(symbol, group);
  }
  for (const [symbol, group] of bySymbol) {
    if (group.length < 2) continue;
    for (const row of group.filter((item) => item.source === "chain")) {
      const suffixed = marketSymbolWithSuffix(symbol, row.id);
      row.marketSymbol = suffixed;
      row.yesSymbol = `${suffixed}#YES`;
      row.noSymbol = `${suffixed}#NO`;
      row.outcomes = outcomeMetadata(suffixed, row.yesTokenId ?? "", row.noTokenId ?? "");
      if (row.book) row.book = { ...row.book, yesSymbol: row.yesSymbol, noSymbol: row.noSymbol };
    }
  }
  return rows.sort((a, b) => b.volumeQuote - a.volumeQuote || a.expiry - b.expiry);
}

const MARKETS_TTL_MS = envInteger("DREAMDEX_MARKETS_RESPONSE_TTL_MS", 4_000);

let lastResponse: { at: number; value: MarketsResponse } | null = null;
let universePromise: Promise<MarketsResponse> | null = null;

function staleCopy(entry: { at: number; value: MarketsResponse }): MarketsResponse {
  const now = Date.now();
  const markets = entry.value.markets.filter((market) => market.expiry > now);
  return {
    markets,
    meta: { ...entry.value.meta, mergedCount: markets.length, stale: true, ageMs: now - entry.at },
  };
}

function refreshMarketUniverse(): Promise<MarketsResponse> {
  if (!universePromise) {
    universePromise = computeMarketUniverse()
      .then((value) => {
        if (value.markets.length > 0 || lastResponse === null) lastResponse = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        universePromise = null;
      });
    universePromise.catch(() => undefined);
  }
  return universePromise;
}

export async function getMarketUniverse(): Promise<MarketsResponse> {
  const cached = lastResponse;
  if (cached && Date.now() - cached.at < MARKETS_TTL_MS) return cached.value;
  const refresh = refreshMarketUniverse();
  if (cached) return staleCopy(cached);
  try {
    return await refresh;
  } catch (cause) {
    const fallback = lastResponse;
    if (fallback) return staleCopy(fallback);
    throw cause;
  }
}

async function computeMarketUniverse(): Promise<MarketsResponse> {
  const [officialResult, chainResult] = await Promise.allSettled([loadOfficialMarkets(), syncChainMarkets()]);
  const official = officialResult.status === "fulfilled" ? officialResult.value : [];
  const chain = chainResult.status === "fulfilled"
    ? chainResult.value
    : { events: [], headBlock: state.headBlock, nextBlock: state.nextBlock, complete: false, chunks: 0, error: errorText(chainResult.reason) };
  const receiptObservations = official.length > 0
    ? await hydrateOfficialObservations(official, chain.events)
    : [];
  storeObservations(receiptObservations);
  const observations = dedupeObservations([...state.observations.values()]);
  const enrichments = await enrichChainObservations(observations);
  const markets = mergeMarketRows(official, observations, Date.now(), enrichments);
  const errors = [
    officialResult.status === "rejected" ? errorText(officialResult.reason) : null,
    chain.error,
  ].filter((value): value is string => Boolean(value));
  return {
    markets,
    meta: {
      officialCount: official.length,
      chainCount: observations.length,
      mergedCount: markets.length,
      headBlock: chain.headBlock >= 0 ? chain.headBlock : null,
      nextBlock: chain.nextBlock >= 0 ? chain.nextBlock : null,
      chainComplete: chain.complete,
      degraded: errors.length > 0 || officialResult.status === "rejected",
      error: errors.length ? errors.join("; ") : null,
      chainExecutionReadyCount: markets.filter((market) => market.source === "chain" && market.executionReady).length,
    },
  };
}
