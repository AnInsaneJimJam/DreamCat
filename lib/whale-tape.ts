"use client";

const STORAGE_KEY = "dreamcat-whale-tape-v1";
const MAX_PRINTS = 60;
const PERSIST_MS = 4000;
const RETRY_MS = 3000;
const STREAM_URL = "wss://stream.binance.com:9443/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade";

const THRESHOLDS: Record<string, number> = { BTC: 50000, ETH: 25000 };

export type WhaleStreamState = "connecting" | "live" | "reconnecting";

export interface WhalePrint {
  asset: string;
  price: number;
  notional: number;
  side: "buy" | "sell";
  ts: number;
}

export interface WhaleTapeState {
  prints: WhalePrint[];
  streamState: WhaleStreamState;
  seen: number;
  hydrated: boolean;
}

const INITIAL_STATE: WhaleTapeState = {
  prints: [],
  streamState: "connecting",
  seen: 0,
  hydrated: false,
};

let state: WhaleTapeState = INITIAL_STATE;
let socket: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let refCount = 0;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function commit(patch: Partial<WhaleTapeState>) {
  state = { ...state, ...patch };
  emit();
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ prints: state.prints.slice(0, MAX_PRINTS), seen: state.seen })
    );
  } catch {}
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persist();
  }, PERSIST_MS);
}

function isPrint(value: unknown): value is WhalePrint {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.asset === "string" &&
    typeof row.price === "number" &&
    typeof row.notional === "number" &&
    (row.side === "buy" || row.side === "sell") &&
    typeof row.ts === "number"
  );
}

export function hydrateWhaleTape(): void {
  if (state.hydrated || typeof window === "undefined") return;
  let prints: WhalePrint[] = [];
  let seen = 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { prints?: unknown; seen?: unknown };
      if (Array.isArray(parsed.prints)) prints = parsed.prints.filter(isPrint).slice(0, MAX_PRINTS);
      if (typeof parsed.seen === "number" && Number.isFinite(parsed.seen)) seen = parsed.seen;
    }
  } catch {}
  commit({ prints, seen: Math.max(seen, prints.length), hydrated: true });
}

function handleMessage(event: MessageEvent) {
  try {
    const msg = JSON.parse(event.data as string) as {
      data?: { s?: string; p?: string; q?: string; m?: boolean; T?: number };
    };
    const d = msg.data;
    if (!d?.s || !d.p || !d.q) return;
    const asset = d.s.replace("USDT", "");
    const price = Number(d.p);
    const qty = Number(d.q);
    if (!Number.isFinite(price) || !Number.isFinite(qty)) return;
    const notional = price * qty;
    const min = THRESHOLDS[asset] ?? Number.POSITIVE_INFINITY;
    if (notional < min) return;
    const print: WhalePrint = {
      asset,
      price,
      notional,
      side: d.m ? "sell" : "buy",
      ts: typeof d.T === "number" ? d.T : Date.now(),
    };
    commit({ prints: [print, ...state.prints].slice(0, MAX_PRINTS), seen: state.seen + 1 });
    schedulePersist();
  } catch {}
}

function connect() {
  if (typeof window === "undefined" || socket || refCount === 0) return;
  const ws = new WebSocket(STREAM_URL);
  socket = ws;
  ws.onopen = () => {
    if (socket === ws) commit({ streamState: "live" });
  };
  ws.onmessage = handleMessage;
  ws.onerror = () => {
    if (socket === ws) commit({ streamState: "reconnecting" });
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    persist();
    if (refCount === 0) return;
    commit({ streamState: "reconnecting" });
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, RETRY_MS);
  };
}

export function acquireWhaleTape(): () => void {
  hydrateWhaleTape();
  refCount += 1;
  if (refCount === 1) {
    if (state.streamState !== "live") commit({ streamState: "connecting" });
    connect();
  }
  return () => {
    refCount = Math.max(0, refCount - 1);
  };
}

export function subscribeWhaleTape(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWhaleTapeState(): WhaleTapeState {
  return state;
}

export function getWhaleTapeServerState(): WhaleTapeState {
  return INITIAL_STATE;
}
