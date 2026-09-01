"use client";

import type { FleetCat } from "./fleet";
import type { StrategyParams } from "./strategy";
import type { FleetRunnerState, FleetMode } from "./fleet-runner";
import type { QuotePolicy } from "./live-quotes";
import type { LiveMarketRow } from "./dreamdex";
import {
  subscribeFleet,
  getFleetState,
  hydrateFleet,
  setFleetRunning,
  setFleetMode,
  setFleetBankroll,
  setFleetMarkets,
  updateFleetCats,
  updateFleetCatConfig,
  removeFleetCat,
  setQuotePolicy,
  acknowledgeDroppedPositions as localAcknowledgeDropped,
  acknowledgeOrphanQuotes as localAcknowledgeOrphans,
} from "./fleet-runner";
import {
  FleetServerConnection,
  serverSetFleetRunning,
  serverSetFleetMode,
  serverSetFleetBankroll,
  serverAddCat,
  serverUpdateCatConfig,
  serverRemoveCat,
  serverSetQuotePolicy,
} from "./fleet-client";
import { restoreFleetSession, clearFleetSession } from "./fleet-auth";
import { freshCat, type FleetCatInput } from "./fleet";

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

let source: "local" | "server" = "local";
let serverConnection: FleetServerConnection | null = null;
let sessionId: string | null = null;
let consecutiveReconnectFails = 0;
const MAX_RECONNECT_FAILS = 3;
let fallbackNotice: string | null = null;

type ConnectionStatus = "local" | "connected" | "reconnecting" | "error";
let connectionStatus: ConnectionStatus = "local";
const statusListeners = new Set<() => void>();

function emitStatus() {
  for (const listener of statusListeners) listener();
}

function setConnectionStatus(next: ConnectionStatus) {
  if (connectionStatus === next) return;
  connectionStatus = next;
  emitStatus();
}

function switchToLocalFallback(reason: string) {
  if (serverConnection) {
    serverConnection.disconnect();
    serverConnection = null;
  }
  source = "local";
  sessionId = null;
  fallbackNotice = reason;
  clearFleetSession();
  setConnectionStatus("local");
  hydrateFleet();
  resubscribeAll();
}

export function getFallbackNotice(): string | null {
  return fallbackNotice;
}

export function clearFallbackNotice(): void {
  fallbackNotice = null;
  emitStatus();
}

export function subscribeFleetBridge(listener: () => void): () => void {
  if (source === "server" && serverConnection) {
    const unsub = serverConnection.subscribe(listener);
    listeners.add(listener);
    return () => {
      unsub();
      listeners.delete(listener);
    };
  }
  listeners.add(listener);
  const unsub = subscribeFleet(listener);
  return () => {
    unsub();
    listeners.delete(listener);
  };
}

const listeners = new Set<() => void>();

function resubscribeAll() {
  for (const listener of [...listeners]) {
    listener();
  }
}

export function getFleetBridgeState(): FleetRunnerState {
  if (source === "server" && serverConnection) {
    return serverConnection.getSnapshot();
  }
  return getFleetState();
}

export function getFleetBridgeServerState(): FleetRunnerState {
  return INITIAL_STATE;
}

export async function connectServerFleet(sid: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    switchToLocalFallback("Device is offline — running in local mode.");
    return;
  }

  sessionId = sid;
  const connection = new FleetServerConnection(fleetServerUrl(), sid);
  setConnectionStatus("reconnecting");
  try {
    await connection.connect();
    serverConnection = connection;
    source = "server";
    consecutiveReconnectFails = 0;
    fallbackNotice = null;
    setConnectionStatus("connected");

    setFleetRunning(false);

    connection.subscribe(() => {
      resubscribeAll();
    });

    connection.onDisconnect(() => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        switchToLocalFallback("Device went offline — switched to local mode.");
        return;
      }
      consecutiveReconnectFails++;
      if (consecutiveReconnectFails >= MAX_RECONNECT_FAILS) {
        switchToLocalFallback("Server unreachable after 3 attempts — switched to local mode.");
      } else {
        setConnectionStatus("reconnecting");
      }
    });

    connection.onReconnect(() => {
      consecutiveReconnectFails = 0;
      setConnectionStatus("connected");
    });

    resubscribeAll();
  } catch {
    consecutiveReconnectFails++;
    if (consecutiveReconnectFails >= MAX_RECONNECT_FAILS) {
      switchToLocalFallback("Server unreachable after 3 attempts — switched to local mode.");
      return;
    }
    setConnectionStatus("error");
    throw new Error("Could not connect to fleet server.");
  }
}

export function disconnectServerFleet(): void {
  if (serverConnection) {
    serverConnection.disconnect();
    serverConnection = null;
  }
  source = "local";
  sessionId = null;
  setConnectionStatus("local");
  hydrateFleet();
  resubscribeAll();
}

export function isServerMode(): boolean {
  return source === "server";
}

export function getConnectionStatus(): ConnectionStatus {
  return connectionStatus;
}

export function subscribeConnectionStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
}

export function bridgeSetFleetRunning(running: boolean): void {
  if (source === "server" && sessionId) {
    void serverSetFleetRunning(sessionId, running);
    return;
  }
  setFleetRunning(running);
}

export function bridgeSetFleetMode(mode: FleetMode): string | null {
  if (source === "server" && sessionId) {
    void serverSetFleetMode(sessionId, mode);
    return null;
  }
  return setFleetMode(mode);
}

export function bridgeSetFleetBankroll(bankroll: number): void {
  if (source === "server" && sessionId) {
    void serverSetFleetBankroll(sessionId, bankroll);
    return;
  }
  setFleetBankroll(bankroll);
}

export function bridgeUpdateFleetCats(updater: (cats: FleetCat[]) => FleetCat[]): void {
  if (source === "server") {
    return;
  }
  updateFleetCats(updater);
}

export function bridgeUpdateFleetCatConfig(slot: number, params: StrategyParams, allocPct: number): void {
  if (source === "server" && sessionId) {
    void serverUpdateCatConfig(sessionId, slot, params, allocPct);
    return;
  }
  updateFleetCatConfig(slot, params, allocPct);
}

export function bridgeRemoveFleetCat(slot: number): string | null {
  if (source === "server" && sessionId) {
    void serverRemoveCat(sessionId, slot);
    return null;
  }
  return removeFleetCat(slot);
}

export function bridgeSetQuotePolicy(policy: QuotePolicy): void {
  if (source === "server" && sessionId) {
    void serverSetQuotePolicy(sessionId, policy);
    return;
  }
  setQuotePolicy(policy);
}

export async function bridgeAddCat(input: FleetCatInput): Promise<void> {
  if (source === "server" && sessionId) {
    await serverAddCat(sessionId, input);
    return;
  }
  const cat = freshCat(input);
  updateFleetCats((current) => [...current, cat]);
}

export function bridgeHydrateFleet(): void {
  if (source === "server") return;
  const stored = restoreFleetSession();
  if (stored) {
    void connectServerFleet(stored).catch(() => {
      clearFleetSession();
      hydrateFleet();
    });
    return;
  }
  hydrateFleet();
}

export function bridgeSetFleetMarkets(rows: LiveMarketRow[]): void {
  if (source === "server") return;
  setFleetMarkets(rows);
}

export function bridgeAcknowledgeDroppedPositions(): void {
  if (source === "server") return;
  localAcknowledgeDropped();
}

export function bridgeAcknowledgeOrphanQuotes(): void {
  if (source === "server") return;
  localAcknowledgeOrphans();
}
