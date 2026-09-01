import type { SSEStreamingApi } from "hono/streaming";

const MAX_CONNECTIONS_PER_USER = 3;
const HEARTBEAT_MS = 15_000;

interface SseConnection {
  stream: SSEStreamingApi;
  heartbeat: ReturnType<typeof setInterval>;
  address: string;
}

const connections = new Map<string, Set<SseConnection>>();

function getKey(address: string): string {
  return address.toLowerCase();
}

export function addConnection(address: string, stream: SSEStreamingApi): SseConnection | null {
  const key = getKey(address);
  let set = connections.get(key);
  if (!set) {
    set = new Set();
    connections.set(key, set);
  }
  if (set.size >= MAX_CONNECTIONS_PER_USER) return null;

  const heartbeat = setInterval(() => {
    stream.writeSSE({ event: "ping", data: "{}" }).catch(() => {
      removeConnection(conn);
    });
  }, HEARTBEAT_MS);

  const conn: SseConnection = { stream, heartbeat, address: key };
  set.add(conn);
  return conn;
}

export function removeConnection(conn: SseConnection): void {
  clearInterval(conn.heartbeat);
  const set = connections.get(conn.address);
  if (set) {
    set.delete(conn);
    if (set.size === 0) connections.delete(conn.address);
  }
}

export function listenerCount(address: string): number {
  return connections.get(getKey(address))?.size ?? 0;
}

export async function emitToUser(address: string, event: string, data: unknown): Promise<void> {
  const key = getKey(address);
  const set = connections.get(key);
  if (!set) return;
  const payload = JSON.stringify(data, (_k, v) => typeof v === "bigint" ? v.toString() : v);
  const dead: SseConnection[] = [];
  for (const conn of set) {
    try {
      await conn.stream.writeSSE({ event, data: payload });
    } catch {
      dead.push(conn);
    }
  }
  for (const conn of dead) removeConnection(conn);
}

export async function emitShutdown(): Promise<void> {
  for (const [, set] of connections) {
    for (const conn of set) {
      try {
        await conn.stream.writeSSE({ event: "shutdown", data: "{}" });
      } catch {}
      clearInterval(conn.heartbeat);
    }
  }
  connections.clear();
}
