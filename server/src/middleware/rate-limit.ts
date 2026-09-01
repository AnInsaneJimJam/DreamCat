import type { Context, Next } from "hono";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const CLEANUP_INTERVAL_MS = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

function getClientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ??
    c.req.header("x-real-ip") ??
    "unknown"
  );
}

function check(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  return bucket.count <= limit;
}

export function authRateLimit() {
  return async (c: Context, next: Next) => {
    const ip = getClientIp(c);
    if (!check(`auth:${ip}`, 60, 60_000)) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }
    await next();
  };
}

export function fleetRateLimit() {
  return async (c: Context, next: Next) => {
    const session =
      c.req.header("Authorization")?.slice(7) ?? getClientIp(c);
    if (!check(`fleet:${session}`, 120, 60_000)) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }
    await next();
  };
}
