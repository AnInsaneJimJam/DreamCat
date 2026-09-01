"use client";

import type { Hex } from "viem";
import type { FleetCat, FleetCatInput } from "./fleet";
import type { StrategyParams } from "./strategy";
import type { FleetRunnerState, FleetMode } from "./fleet-runner";
import type { QuotePolicy } from "./live-quotes";

function fleetServerUrl(): string {
  return process.env.NEXT_PUBLIC_FLEET_SERVER_URL ?? "http://localhost:4000";
}

const INITIAL_STATE: FleetRunnerState = {
  cats: [],
  running: false,
  mode: "dry" as FleetMode,
  bankroll: 1000,
  live: {},
  hydrated: false,
  storageError: false,
  droppedPositions: 0,
  burnerReady: false,
  quotePolicy: "dual" as QuotePolicy,
  orphanQuotes: 0,
};

export class FleetServerConnection {
  private baseUrl: string;
  private sessionId: string;
  private eventSource: EventSource | null = null;
  private state: FleetRunnerState = { ...INITIAL_STATE };
  private listeners = new Set<() => void>();
  private disconnectListeners = new Set<() => void>();
  private reconnectListeners = new Set<() => void>();
  private connected = false;
  private wasConnected = false;

  constructor(baseUrl: string, sessionId: string) {
    this.baseUrl = baseUrl;
    this.sessionId = sessionId;
  }

  async connect(): Promise<void> {
    if (this.eventSource) return;

    const url = `${this.baseUrl}/fleet/stream?token=${encodeURIComponent(this.sessionId)}`;
    const es = new EventSource(url);
    this.eventSource = es;

    es.addEventListener("state", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      this.state = {
        ...this.state,
        cats: data.cats ?? [],
        running: data.running ?? false,
        mode: data.mode ?? "dry",
        bankroll: data.bankroll ?? 1000,
        quotePolicy: data.quotePolicy ?? "dual",
        burnerReady: data.burnerReady ?? false,
        hydrated: true,
      };
      this.emit();
    });

    es.addEventListener("tick", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      if (data.cats) {
        this.state = { ...this.state, cats: data.cats };
      }
      this.emit();
    });

    es.addEventListener("config", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      this.state = {
        ...this.state,
        running: data.running ?? this.state.running,
        mode: data.mode ?? this.state.mode,
        bankroll: data.bankroll ?? this.state.bankroll,
        quotePolicy: data.quotePolicy ?? this.state.quotePolicy,
        burnerReady: data.burnerReady ?? this.state.burnerReady,
      };
      this.emit();
    });

    es.addEventListener("ping", () => {});

    es.addEventListener("shutdown", () => {
      this.connected = false;
      for (const cb of this.disconnectListeners) cb();
      this.emit();
    });

    es.addEventListener("open", () => {
      if (this.wasConnected && !this.connected) {
        this.connected = true;
        for (const cb of this.reconnectListeners) cb();
      }
      this.connected = true;
    });

    es.addEventListener("error", () => {
      if (this.connected) {
        this.connected = false;
        for (const cb of this.disconnectListeners) cb();
      }
    });

    return new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        this.connected = true;
        this.wasConnected = true;
        cleanup();
        resolve();
      };
      const onError = () => {
        if (!this.connected && !this.wasConnected) {
          cleanup();
          reject(new Error("SSE connection failed"));
        }
      };
      const cleanup = () => {
        es.removeEventListener("open", onOpen);
        es.removeEventListener("error", onError);
      };
      es.addEventListener("open", onOpen);
      es.addEventListener("error", onError);
    });
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
    this.wasConnected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.add(listener);
    return () => { this.disconnectListeners.delete(listener); };
  }

  onReconnect(listener: () => void): () => void {
    this.reconnectListeners.add(listener);
    return () => { this.reconnectListeners.delete(listener); };
  }

  getSnapshot(): FleetRunnerState {
    return this.state;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

async function apiFetch(
  path: string,
  sessionId: string,
  opts: RequestInit = {},
): Promise<Response> {
  const base = fleetServerUrl();
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionId}`,
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res;
}

export async function serverSetFleetRunning(sessionId: string, running: boolean): Promise<void> {
  await apiFetch(`/fleet/${running ? "start" : "stop"}`, sessionId, { method: "POST" });
}

export async function serverSetFleetMode(sessionId: string, mode: FleetMode): Promise<string | null> {
  try {
    await apiFetch("/fleet/mode", sessionId, {
      method: "PUT",
      body: JSON.stringify({ mode }),
    });
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

export async function serverSetFleetBankroll(sessionId: string, bankroll: number): Promise<void> {
  await apiFetch("/fleet/bankroll", sessionId, {
    method: "PUT",
    body: JSON.stringify({ bankroll }),
  });
}

export async function serverAddCat(sessionId: string, input: FleetCatInput): Promise<FleetCat> {
  const res = await apiFetch("/fleet/cats", sessionId, {
    method: "POST",
    body: JSON.stringify(input),
  });
  const { cat } = (await res.json()) as { cat: FleetCat };
  return cat;
}

export async function serverUpdateCatConfig(
  sessionId: string,
  slot: number,
  params: StrategyParams,
  allocPct: number,
): Promise<void> {
  await apiFetch(`/fleet/cats/${slot}`, sessionId, {
    method: "PUT",
    body: JSON.stringify({ params, allocPct }),
  });
}

export async function serverRemoveCat(sessionId: string, slot: number): Promise<string | null> {
  try {
    await apiFetch(`/fleet/cats/${slot}`, sessionId, { method: "DELETE" });
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

export async function serverSetQuotePolicy(sessionId: string, policy: QuotePolicy): Promise<void> {
  await apiFetch("/fleet/quote-policy", sessionId, {
    method: "PUT",
    body: JSON.stringify({ policy }),
  });
}

export async function serverSetBurnerKey(sessionId: string, key: Hex): Promise<void> {
  await apiFetch("/fleet/burner", sessionId, {
    method: "POST",
    body: JSON.stringify({ key }),
  });
}
