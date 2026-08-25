"use client";

import { SOMNIA_TESTNET_ADDRESSES, SomniaMarkets, isBinaryMarket } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { fetchChainOrderBook, resolveChainExecutionMarket } from "./market-universe/chain-execution";
import type { LiveMarketRow, MarketsResponse } from "./market-universe/types";

export type { LiveMarketRow } from "./market-universe/types";

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql";
const WS_RPC_URL = process.env.NEXT_PUBLIC_WS_RPC_URL ?? "wss://api.infra.testnet.somnia.network/ws";

let client: SomniaMarkets | null = null;

function getClient() {
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

export function getExchange(): SomniaMarkets {
  return getClient();
}

const REGISTRY_TTL_MS = 30_000;

let registryPromise: Promise<unknown> | null = null;
let registryLoadedAt = 0;

async function ensureRegistryLoaded(): Promise<void> {
  if (registryPromise && Date.now() - registryLoadedAt < REGISTRY_TTL_MS) {
    await registryPromise;
    return;
  }
  registryLoadedAt = Date.now();
  registryPromise = getClient().loadMarkets(true).catch((error) => {
    registryPromise = null;
    registryLoadedAt = 0;
    throw error;
  });
  await registryPromise;
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

async function listSdkMarkets(): Promise<LiveMarketRow[]> {
  const markets = Object.values(await getClient().loadMarkets(true));
  return markets
    .map(parseRow)
    .filter((r): r is LiveMarketRow => r !== null && r.status === "Trading")
    .sort((a, b) => b.volumeQuote - a.volumeQuote);
}

export async function listLiveMarkets(): Promise<LiveMarketRow[]> {
  if (typeof window !== "undefined") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/markets", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) {
        const data = await response.json() as MarketsResponse;
        if (Array.isArray(data.markets)) {
          if (data.meta?.degraded && data.markets.length === 0) {
            throw new Error(data.meta.error ?? "DreamDEX market discovery is degraded.");
          }
          return data.markets;
        }
      }
    } catch {
    } finally {
      clearTimeout(timeout);
    }
  }
  return listSdkMarkets();
}

export interface BookLevel {
  price: number;
  qty: number;
}

export interface BookSnapshot {
  bids: BookLevel[];
  asks: BookLevel[];
  bidDepth: number;
  askDepth: number;
  mid: number | null;
  spread: number | null;
  imbalance: number | null;
}

function snapshotFrom(bids: BookLevel[], asks: BookLevel[]): BookSnapshot {
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

export async function fetchBook(yesSymbol: string): Promise<BookSnapshot> {
  if (!yesSymbol) throw new Error("Market execution metadata is still indexing");
  await ensureRegistryLoaded();
  const raw = await getClient().fetchOrderBook(yesSymbol, 8);
  return snapshotFrom(
    raw.bids.map(([price, qty]) => ({ price, qty })),
    raw.asks.map(([price, qty]) => ({ price, qty }))
  );
}

export interface Fill {
  price: number;
  qty: number;
  side: "buy" | "sell";
  ts: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function watchBook(
  yesSymbol: string,
  onBook: (b: BookSnapshot) => void,
  market?: LiveMarketRow,
): () => void {
  if (market?.executionMode === "chain-pool" && market.executionReady) {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pump = async () => {
      try {
        const resolved = await resolveChainExecutionMarket(market.id, market);
        const book = await fetchChainOrderBook(resolved);
        if (alive) onBook(book);
      } catch {
      } finally {
        if (alive) timer = setTimeout(pump, 2_000);
      }
    };
    void pump();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }
  if (!yesSymbol) return () => {};
  let alive = true;
  (async () => {
    while (alive) {
      try {
        await ensureRegistryLoaded();
        const raw = await getClient().watchOrderBook(yesSymbol, 8);
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

export function watchFills(yesSymbol: string, onFills: (f: Fill[]) => void): () => void {
  if (!yesSymbol) return () => {};
  let alive = true;
  (async () => {
    while (alive) {
      try {
        await ensureRegistryLoaded();
        const raw = await getClient().watchTrades(yesSymbol, 20);
        if (!alive) return;
        onFills(
          raw.map((t) => ({
            price: t.price,
            qty: t.amount,
            side: t.side === "sell" ? "sell" : "buy",
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
