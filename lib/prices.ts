import { SomniaMarkets } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { SOMNIA_TESTNET_PRICE_FEED } from "@somnia-chain/markets-sdk";

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql";
const WS_RPC_URL = process.env.NEXT_PUBLIC_WS_RPC_URL ?? "wss://api.infra.testnet.somnia.network/ws";

let pxClient: SomniaMarkets | null = null;
let activeSpotWatchers = 0;

function getPx() {
  if (!pxClient) {
    pxClient = new SomniaMarkets({
      indexerUrl: INDEXER_URL,
      chain: somniaShannon,
      wsRpcUrl: WS_RPC_URL,
      priceFeed: SOMNIA_TESTNET_PRICE_FEED,
    });
  }
  return pxClient;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  ticks: number;
}

export type NativeResolution = "M1" | "H1" | "D1";
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "1d";

const TF_MAP: Record<Timeframe, { native: NativeResolution; agg: number }> = {
  "1m": { native: "M1", agg: 1 },
  "5m": { native: "M1", agg: 5 },
  "15m": { native: "M1", agg: 15 },
  "1h": { native: "H1", agg: 1 },
  "1d": { native: "D1", agg: 1 },
};

export async function fetchCandles(asset: string, tf: Timeframe, limit = 300): Promise<Candle[]> {
  const { native, agg } = TF_MAP[tf];
  const raw = await getPx().client.fetchPriceCandles(asset, native, {
    limit: agg === 1 ? limit : Math.ceil(limit * agg) + agg,
  });
  const base: Candle[] = raw.map((c) => ({
    time: c.bucketStart,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    ticks: c.count ?? 0,
  }));
  if (agg === 1) return base;
  const out: Candle[] = [];
  const width = 60 * (native === "M1" ? agg : agg);
  for (const c of base) {
    const bucket = Math.floor(c.time / width) * width;
    const last = out[out.length - 1];
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.ticks += c.ticks;
    } else {
      out.push({ ...c, time: bucket });
    }
  }
  return out;
}

export interface SpotTick {
  asset: string;
  price: number;
  ts: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function watchSpot(asset: string, onTick: (t: SpotTick) => void): () => void {
  let alive = true;
  activeSpotWatchers += 1;
  (async () => {
    while (alive) {
      try {
        const live = await getPx().watchPrice(asset);
        if (!alive) return;
        onTick({ asset, price: Number(live.price), ts: Number(live.timestamp ?? Date.now()) });
      } catch {
        await sleep(2000);
      }
    }
  })();
  return () => {
    if (!alive) return;
    alive = false;
    activeSpotWatchers = Math.max(0, activeSpotWatchers - 1);
    if (activeSpotWatchers === 0 && pxClient) {
      const client = pxClient;
      pxClient = null;
      void client.close();
    }
  };
}

export function bucketStartFor(tf: Timeframe, ts: number): number {
  const { native, agg } = TF_MAP[tf];
  const sec = native === "M1" ? 60 : native === "H1" ? 3600 : 86400;
  return Math.floor(ts / (sec * agg)) * sec * agg;
}
