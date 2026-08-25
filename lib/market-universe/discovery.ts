import { SOMNIA_TESTNET_ADDRESSES, SomniaMarkets, isBinaryMarket } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import {
  finiteNumber,
  normalizeAddress,
  normalizeMarketId,
  scalarString,
  type LiveMarketRow,
  type MarketOutcome,
} from "./types";

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql";
const WS_RPC_URL = process.env.NEXT_PUBLIC_WS_RPC_URL ?? "wss://api.infra.testnet.somnia.network/ws";
const DISCOVERY_LIMIT = 200;
const DISCOVERY_TIMEOUT_MS = 12_000;

const PRIMARY_OPERATOR_IDS = new Set(
  (process.env.DREAMDEX_PRIMARY_OPERATOR_IDS ?? "4")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

export interface DiscoveryRow {
  marketId: string;
  marketAddress: string;
  poolAddress: string;
  creator: string | null;
  operatorId: string | null;
  venueId: string | null;
  asset: string;
  strike: string | null;
  question: string;
  tradingStart: number;
  expiry: number;
  quoteDecimals: number;
  yesTokenId: string | null;
  noTokenId: string | null;
  lastPrice: string | null;
  cumulativeQuoteVolume: string | null;
  tradeCount: string | null;
  createdAtBlock: string | null;
  createdAtTimestamp: string | null;
  createdByTx: string | null;
  nonce: string | null;
  collateral: string | null;
}

const LIVE_MARKETS_QUERY = `query DreamCatLiveMarkets($now: numeric!, $limit: Int!) {
  Market(
    where: {
      marketType: { _eq: "BINARY" }
      finalized: { _eq: false }
      voided: { _eq: false }
      clobStatus: { _eq: "Trading" }
      expiry: { _gt: $now }
    }
    order_by: { expiry: asc }
    limit: $limit
  ) {
    marketId marketAddress poolAddress creator operatorId venueId asset strike question
    tradingStart expiry quoteDecimals yesTokenId noTokenId lastPrice
    cumulativeQuoteVolume tradeCount createdAtBlock createdAtTimestamp createdByTx nonce collateral
  }
}`;

let client: SomniaMarkets | null = null;

function getClient(): SomniaMarkets {
  if (!client) {
    client = new SomniaMarkets({
      indexerUrl: INDEXER_URL,
      chain: somniaShannon,
      wsRpcUrl: WS_RPC_URL,
      addresses: SOMNIA_TESTNET_ADDRESSES,
    });
  }
  return client;
}

export async function fetchLiveMarketRows(nowMs = Date.now()): Promise<DiscoveryRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: LIVE_MARKETS_QUERY,
        variables: { now: Math.floor(nowMs / 1000), limit: DISCOVERY_LIMIT },
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Indexer discovery HTTP ${response.status}`);
    const payload = (await response.json()) as { data?: { Market?: DiscoveryRow[] }; errors?: { message: string }[] };
    if (payload.errors?.length) throw new Error(payload.errors.map((e) => e.message).join("; "));
    const rows = payload.data?.Market ?? [];
    return rows.filter((row) => Boolean(row?.marketId) && Boolean(row?.poolAddress));
  } finally {
    clearTimeout(timeout);
  }
}

function attributionFor(operatorId: string | null): "primary" | "third-party" {
  return operatorId != null && PRIMARY_OPERATOR_IDS.has(String(operatorId)) ? "primary" : "third-party";
}

function windowLabelFor(expirySec: number): string {
  if (!Number.isFinite(expirySec) || expirySec <= 0) return "";
  const date = new Date(expirySec * 1000);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")} UTC`;
}

function intervalLabelFor(startSec: number, expirySec: number): string {
  const duration = Math.max(0, expirySec - startSec);
  if (duration === 0) return "";
  if (duration % 86_400 === 0) return `${duration / 86_400}d`;
  if (duration % 3_600 === 0) return `${duration / 3_600}h`;
  if (duration % 60 === 0) return `${duration / 60}m`;
  return `${duration}s`;
}

function outcomesFor(marketSymbol: string, yesTokenId: string | null, noTokenId: string | null): MarketOutcome[] {
  return [
    { label: "YES", index: 0, tokenId: yesTokenId, symbol: `${marketSymbol}#YES` },
    { label: "NO", index: 1, tokenId: noTokenId, symbol: `${marketSymbol}#NO` },
  ];
}

export function discoveryRowToLiveRow(row: DiscoveryRow): LiveMarketRow {
  const expirySec = finiteNumber(row.expiry) ?? 0;
  const startSec = finiteNumber(row.tradingStart) ?? 0;
  const quoteDecimals = finiteNumber(row.quoteDecimals) ?? 6;
  const strikeRaw = finiteNumber(row.strike) ?? 0;
  const marketId = normalizeMarketId(row.marketId);
  const fallbackSymbol = `${(row.asset || "MKT").toUpperCase()}-${marketId.slice(-6)}`;
  return {
    id: marketId,
    poolAddress: normalizeAddress(row.poolAddress),
    asset: String(row.asset ?? ""),
    kind: strikeRaw > 0 ? "ladder" : "open",
    strike: scalarString(row.strike),
    strikeLabel: strikeRaw > 0 ? (strikeRaw / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "vs open",
    windowLabel: windowLabelFor(expirySec),
    interval: intervalLabelFor(startSec, expirySec),
    expiry: expirySec * 1000,
    status: "Trading",
    question: String(row.question ?? ""),
    title: String(row.question ?? ""),
    volumeQuote: Number(row.cumulativeQuoteVolume ?? 0) / 10 ** quoteDecimals,
    tradeCount: Number(row.tradeCount ?? 0),
    lastPrice: row.lastPrice == null ? null : Number(row.lastPrice) / 10 ** quoteDecimals,
    yesSymbol: `${fallbackSymbol}#YES`,
    noSymbol: `${fallbackSymbol}#NO`,
    marketSymbol: fallbackSymbol,
    outcomes: outcomesFor(fallbackSymbol, scalarString(row.yesTokenId), scalarString(row.noTokenId)),
    quoteSymbol: null,
    quoteDecimals,
    executionMode: "chain-pool",
    executionReady: false,
    source: "chain",
    trust: "verified",
    attribution: attributionFor(row.operatorId == null ? null : String(row.operatorId)),
    sdkReady: false,
    marketAddress: normalizeAddress(row.marketAddress),
    nonce: scalarString(row.nonce),
    collateral: normalizeAddress(row.collateral),
    creator: normalizeAddress(row.creator),
    operatorId: scalarString(row.operatorId),
    venueId: normalizeMarketId(row.venueId),
    yesTokenId: scalarString(row.yesTokenId),
    noTokenId: scalarString(row.noTokenId),
    tradingStart: startSec * 1000,
    createdBlock: finiteNumber(row.createdAtBlock),
    createdTx: row.createdByTx,
    isResolved: false,
    isVoided: false,
    finalized: false,
    provenance: [{
      source: "indexer",
      trust: "verified",
      observedAtSec: finiteNumber(row.createdAtTimestamp) ?? 0,
      blockNumber: finiteNumber(row.createdAtBlock) ?? undefined,
      transactionHash: row.createdByTx ?? undefined,
    }],
  };
}

type LoadedMarket = Awaited<ReturnType<SomniaMarkets["loadMarkets"]>>[string];

export interface RegistryEntry {
  marketSymbol: string;
  yesSymbol: string;
  noSymbol: string;
  outcomes: MarketOutcome[];
  quoteSymbol: string | null;
  quoteDecimals: number;
  interval: string;
  windowLabel: string;
}

function registryEntryFor(market: LoadedMarket): [string, RegistryEntry] | null {
  if (market.type !== "binary" || !isBinaryMarket(market.info)) return null;
  const info = market.info;
  const id = normalizeMarketId(String(info.marketId ?? market.id));
  if (!id) return null;
  const yes = market.outcomes?.find((outcome) => outcome.label === "YES") ?? market.outcomes?.[0];
  const no = market.outcomes?.find((outcome) => outcome.label === "NO") ?? market.outcomes?.[1];
  const baseParts = market.base.split("-");
  const windowPart = baseParts.find((part) => /^\d{4}$/.test(part)) ?? "";
  return [id, {
    marketSymbol: market.symbol,
    yesSymbol: yes?.symbol ?? "",
    noSymbol: no?.symbol ?? "",
    outcomes: (market.outcomes ?? []).map((outcome) => ({
      label: outcome.label,
      index: outcome.index,
      tokenId: outcome.label === "YES" ? scalarString(info.yesTokenId) : scalarString(info.noTokenId),
      symbol: outcome.symbol,
    })),
    quoteSymbol: market.quote,
    quoteDecimals: info.quoteDecimals,
    interval: String(info.interval ?? ""),
    windowLabel: windowPart ? `${windowPart.slice(0, 2)}:${windowPart.slice(2)} UTC` : "",
  }];
}

let registryCache: Map<string, RegistryEntry> | null = null;
let registryPromise: Promise<Map<string, RegistryEntry>> | null = null;

async function loadRegistry(reload: boolean): Promise<Map<string, RegistryEntry>> {
  const markets = Object.values(await getClient().loadMarkets(reload));
  const next = new Map<string, RegistryEntry>();
  for (const market of markets) {
    const entry = registryEntryFor(market);
    if (entry) next.set(entry[0], entry[1]);
  }
  registryCache = next;
  return next;
}

/**
 * Symbols come from the SDK registry, but `loadMarkets(true)` fires one pool read per
 * non-finalized market (hundreds), so a full reload only happens when discovery surfaces
 * a marketId the cached registry has never seen.
 */
export async function resolveRegistry(
  marketIds: readonly string[],
  deadlineMs = 3_000,
): Promise<Map<string, RegistryEntry> | null> {
  const cached = registryCache;
  if (cached && marketIds.every((id) => cached.has(id))) return cached;
  if (!registryPromise) {
    registryPromise = loadRegistry(cached !== null)
      .catch(() => cached ?? new Map<string, RegistryEntry>())
      .finally(() => {
        registryPromise = null;
      });
  }
  // A full SDK reload reads book params for every non-finalized pool and can take
  // minutes. Never block discovery on it: serve what we have and let the in-flight
  // load land in the registry cache for the next poll.
  const pending = registryPromise;
  const raced = await Promise.race([
    pending,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), deadlineMs)),
  ]);
  return raced ?? cached;
}

/**
 * Kick the first (slow) registry load as soon as the module is imported so symbols are
 * already cached by the time the first poll needs them, instead of every early poll
 * racing a multi-minute load and giving up.
 */
export function warmRegistry(): void {
  if (registryCache || registryPromise) return;
  void resolveRegistry([], 0).catch(() => undefined);
}

export function applyRegistry(row: LiveMarketRow, entry: RegistryEntry | undefined): LiveMarketRow {
  if (!entry || !entry.yesSymbol) return row;
  return {
    ...row,
    marketSymbol: entry.marketSymbol,
    yesSymbol: entry.yesSymbol,
    noSymbol: entry.noSymbol,
    outcomes: entry.outcomes.length > 0 ? entry.outcomes : row.outcomes,
    quoteSymbol: entry.quoteSymbol,
    quoteDecimals: entry.quoteDecimals || row.quoteDecimals,
    interval: entry.interval || row.interval,
    windowLabel: entry.windowLabel || row.windowLabel,
    source: "merged",
    executionMode: "sdk-symbol",
    executionReady: true,
    sdkReady: true,
  };
}
