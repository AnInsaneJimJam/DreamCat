import { env } from "./env.js";
import type { PersistedFleetState, Session } from "./types.js";

const TTL_FLEET = 60 * 60 * 24 * 30;
const TTL_BURNER = 60 * 60 * 24 * 7;
const TTL_SESSION = 60 * 60 * 24;
const TTL_NONCE = 300;

export async function redisCmd<T>(command: (string | number)[]): Promise<T> {
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = env;
  if (!url || !token) throw new Error("Upstash credentials not configured");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Redis error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result: T };
  return json.result;
}

export async function redisPipeline(commands: (string | number)[][]): Promise<unknown[]> {
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = env;
  if (!url || !token) throw new Error("Upstash credentials not configured");
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis pipeline error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result: unknown }[];
  return json.map((r) => r.result);
}

export async function saveFleetState(address: string, state: PersistedFleetState): Promise<void> {
  const key = `fleet:${address.toLowerCase()}`;
  await redisCmd(["SET", key, JSON.stringify(state), "EX", TTL_FLEET]);
}

export async function loadFleetState(address: string): Promise<PersistedFleetState | null> {
  const raw = await redisCmd<string | null>(["GET", `fleet:${address.toLowerCase()}`]);
  return raw ? (JSON.parse(raw) as PersistedFleetState) : null;
}

export async function deleteFleetState(address: string): Promise<void> {
  await redisCmd(["DEL", `fleet:${address.toLowerCase()}`]);
}

export async function addActiveFleet(address: string): Promise<void> {
  await redisCmd(["SADD", "fleet:active", address.toLowerCase()]);
}

export async function removeActiveFleet(address: string): Promise<void> {
  await redisCmd(["SREM", "fleet:active", address.toLowerCase()]);
}

export async function listActiveFleets(): Promise<string[]> {
  return redisCmd<string[]>(["SMEMBERS", "fleet:active"]);
}

export async function saveBurnerKey(address: string, encrypted: string): Promise<void> {
  await redisCmd(["SET", `burner:${address.toLowerCase()}`, encrypted, "EX", TTL_BURNER]);
}

export async function loadBurnerKey(address: string): Promise<string | null> {
  return redisCmd<string | null>(["GET", `burner:${address.toLowerCase()}`]);
}

export async function deleteBurnerKey(address: string): Promise<void> {
  await redisCmd(["DEL", `burner:${address.toLowerCase()}`]);
}

export async function saveSession(id: string, session: Session): Promise<void> {
  await redisCmd(["SET", `session:${id}`, JSON.stringify(session), "EX", TTL_SESSION]);
}

export async function loadSession(id: string): Promise<Session | null> {
  const raw = await redisCmd<string | null>(["GET", `session:${id}`]);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export async function deleteSession(id: string): Promise<void> {
  await redisCmd(["DEL", `session:${id}`]);
}

export async function saveNonce(nonce: string, address: string): Promise<void> {
  await redisCmd(["SET", `nonce:${nonce}`, address, "EX", TTL_NONCE]);
}

export async function consumeNonce(nonce: string): Promise<string | null> {
  const key = `nonce:${nonce}`;
  const results = await redisPipeline([["GET", key], ["DEL", key]]);
  return (results[0] as string) ?? null;
}
