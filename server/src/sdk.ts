import { SOMNIA_TESTNET_ADDRESSES, SomniaMarkets, isBinaryMarket } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { env } from "./env.js";
import type { BookLevel, BookSnapshot, Fill, LiveMarketRow } from "./types.js";

let client: SomniaMarkets | null = null;

export function getServerClient(): SomniaMarkets {
  if (!client) {
    client = new SomniaMarkets({
      indexerUrl: env.INDEXER_URL,
      chain: somniaShannon,
      wsRpcUrl: env.WS_RPC_URL,
      addresses: SOMNIA_TESTNET_ADDRESSES,
    });
  }
  return client;
}

const REGISTRY_TTL_MS = 30_000;
const REGISTRY_RELOAD_MS = 300_000;

let registryPromise: Promise<unknown> | null = null;
let registryLoadedAt = 0;
let registryReloadedAt = 0;

export async function ensureServerRegistry(): Promise<void> {
  if (registryPromise && Date.now() - registryLoadedAt < REGISTRY_TTL_MS) {
    await registryPromise;
    return;
  }
  const now = Date.now();
  const reload = registryReloadedAt === 0 || now - registryReloadedAt >= REGISTRY_RELOAD_MS;
  registryLoadedAt = now;
  if (reload) registryReloadedAt = now;
  registryPromise = getServerClient().loadMarkets(reload).catch((error) => {
    registryPromise = null;
    registryLoadedAt = 0;
    registryReloadedAt = 0;
    throw error;
  });
  await registryPromise;
}

export function snapshotFrom(bids: BookLevel[], asks: BookLevel[]): BookSnapshot {
  const bidDepth = bids.reduce((s, l) => s + l.qty, 0);
  const askDepth = asks.reduce((s, l) => s + l.qty, 0);
  const bestBid = bids[0]?.price;
  const bestAsk = asks[0]?.price;
  const mid = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : (bestBid ?? bestAsk ?? null);
  return {
    bids,
    asks,
    bidDepth,
    askDepth,
    mid,
    spread: bestBid != null && bestAsk != null ? bestAsk - bestBid : null,
    imbalance: bidDepth + askDepth > 0 ? bidDepth / (bidDepth + askDepth) : null,
  };
}

export async function fetchServerBook(yesSymbol: string): Promise<BookSnapshot> {
  if (!yesSymbol) throw new Error("Market execution metadata is still indexing");
  await ensureServerRegistry();
  const raw = await getServerClient().fetchOrderBook(yesSymbol, 8);
  return snapshotFrom(
    raw.bids.map(([price, qty]: [number, number]) => ({ price, qty })),
    raw.asks.map(([price, qty]: [number, number]) => ({ price, qty }))
  );
}

const TAKER_BUY_SIDES = new Set(["BUY_YES", "SELL_NO"]);
const MAKER_BUY_SIDES = new Set(["SELL_YES", "BUY_NO"]);

function resolveFillSide(trade: unknown): "buy" | "sell" | null {
  const row = trade as {
    side?: unknown;
    info?: { takerSide?: unknown; makerSide?: unknown; takerIsBid?: unknown };
  };
  if (row.side === "buy" || row.side === "sell") return row.side;
  const takerSide = row.info?.takerSide;
  if (typeof takerSide === "string" && takerSide.length) {
    return TAKER_BUY_SIDES.has(takerSide.toUpperCase()) ? "buy" : "sell";
  }
  const makerSide = row.info?.makerSide;
  if (typeof makerSide === "string" && makerSide.length) {
    return MAKER_BUY_SIDES.has(makerSide.toUpperCase()) ? "buy" : "sell";
  }
  const takerIsBid = row.info?.takerIsBid;
  if (typeof takerIsBid === "boolean") return takerIsBid ? "buy" : "sell";
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function watchServerBook(
  yesSymbol: string,
  onBook: (b: BookSnapshot) => void,
): () => void {
  if (!yesSymbol) return () => {};
  let alive = true;
  (async () => {
    while (alive) {
      try {
        await ensureServerRegistry();
        const raw = await getServerClient().watchOrderBook(yesSymbol, 8);
        if (!alive) return;
        onBook(
          snapshotFrom(
            (raw.bids ?? []).map(([price, qty]: [number, number]) => ({ price, qty })),
            (raw.asks ?? []).map(([price, qty]: [number, number]) => ({ price, qty }))
          )
        );
      } catch {
        await sleep(2000);
      }
    }
  })();
  return () => {
    alive = false;
  };
}

export function watchServerFills(yesSymbol: string, onFills: (f: Fill[]) => void): () => void {
  if (!yesSymbol) return () => {};
  let alive = true;
  (async () => {
    while (alive) {
      try {
        await ensureServerRegistry();
        const raw = await getServerClient().watchTrades(yesSymbol, 20);
        if (!alive) return;
        onFills(
          raw.map((t) => ({
            price: t.price,
            qty: t.amount,
            side: resolveFillSide(t),
            ts: Number(t.timestamp ?? Date.now()),
          }))
        );
      } catch {
        await sleep(2000);
      }
    }
  })();
  return () => {
    alive = false;
  };
}

type LoadedMarket = Awaited<ReturnType<SomniaMarkets["loadMarkets"]>>[string];

function parseRow(m: LoadedMarket): LiveMarketRow | null {
  if (!m.active || m.type !== "binary" || !isBinaryMarket(m.info)) return null;
  const i = m.info;
  const baseParts = m.base.split("-");
  const asset = baseParts[0];
  const strikeRaw = Number(baseParts[1] ?? 0);
  const windowPart = baseParts.find((p) => /^\d{4}$/.test(p)) ?? "";
  const yes = m.outcomes?.find((o) => o.label === "YES") ?? m.outcomes?.[0];
  return {
    id: String(i.marketId ?? m.id),
    poolAddress: i.poolAddress,
    asset,
    kind: strikeRaw > 0 ? "ladder" : "open",
    strikeLabel: strikeRaw > 0 ? (strikeRaw / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "vs open",
    windowLabel: windowPart ? `${windowPart.slice(0, 2)}:${windowPart.slice(2)} UTC` : "",
    interval: String(i.interval ?? ""),
    expiry: Number(i.expiry) * 1000,
    status: String(i.status),
    question: String(i.question ?? ""),
    volumeQuote: Number(i.cumulativeQuoteVolume ?? 0) / 10 ** (i.quoteDecimals ?? 6),
    tradeCount: Number(i.tradeCount ?? 0),
    lastPrice: i.lastPrice == null ? null : Number(i.lastPrice) / 10 ** (i.quoteDecimals ?? 6),
    yesSymbol: yes?.symbol ?? "",
    source: "indexer",
    trust: "attested",
    sdkReady: true,
    executionMode: "sdk-symbol",
    executionReady: Boolean(yes?.symbol),
  };
}

export async function listServerMarkets(): Promise<LiveMarketRow[]> {
  await ensureServerRegistry();
  const markets = Object.values(await getServerClient().loadMarkets(false));
  return markets
    .map(parseRow)
    .filter((r): r is LiveMarketRow => r !== null && r.status === "Trading")
    .sort((a, b) => b.volumeQuote - a.volumeQuote);
}
