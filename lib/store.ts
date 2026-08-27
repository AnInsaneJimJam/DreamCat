export interface LeaderboardEntry {
  id: string;
  catName: string;
  archetype: string;
  params: Record<string, number>;
  pnl: number;
  trades: number;
  wins: number;
  marketLabel: string;
  publishedAt: number;
  owner?: string;
}

const ZSET = "dreamcat:lb";
const MAX_MEMBERS = 500;

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const storeMode: "upstash" | "local" = url && token ? "upstash" : "local";

const memory = new Map<string, LeaderboardEntry>();

async function redis<T>(command: (string | number)[]): Promise<T> {
  const res = await fetch(url!, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const json = (await res.json()) as { result: T };
  return json.result;
}

export async function publishEntry(entry: LeaderboardEntry): Promise<void> {
  if (storeMode === "local") {
    memory.set(entry.id, entry);
    if (memory.size > MAX_MEMBERS) {
      const oldest = [...memory.values()].sort((a, b) => a.publishedAt - b.publishedAt)[0];
      memory.delete(oldest.id);
    }
    return;
  }
  const member = encodeURIComponent(JSON.stringify(entry));
  await redis(["zadd", ZSET, entry.pnl, member]);
  await redis(["zremrangebyrank", ZSET, 0, -(MAX_MEMBERS + 1)]);
}

export async function deleteEntry(id: string, owner: string): Promise<"deleted" | "not-found" | "forbidden"> {
  const target = owner.toLowerCase();
  if (storeMode === "local") {
    const entry = memory.get(id);
    if (!entry) return "not-found";
    if ((entry.owner ?? "").toLowerCase() !== target) return "forbidden";
    memory.delete(id);
    return "deleted";
  }
  const raw = await redis<string[]>(["zrange", ZSET, 0, -1]);
  for (const member of raw) {
    let entry: LeaderboardEntry | null = null;
    try {
      entry = JSON.parse(decodeURIComponent(member)) as LeaderboardEntry;
    } catch {
      continue;
    }
    if (entry.id !== id) continue;
    if ((entry.owner ?? "").toLowerCase() !== target) return "forbidden";
    await redis(["zrem", ZSET, member]);
    return "deleted";
  }
  return "not-found";
}

export async function topEntries(n = 20): Promise<LeaderboardEntry[]> {
  if (storeMode === "local") {
    return [...memory.values()].sort((a, b) => b.pnl - a.pnl).slice(0, n);
  }
  const raw = await redis<string[]>(["zrevrange", ZSET, 0, n - 1]);
  return raw
    .map((m) => {
      try {
        return JSON.parse(decodeURIComponent(m)) as LeaderboardEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is LeaderboardEntry => e !== null);
}
