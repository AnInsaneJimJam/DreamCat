import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { validateSession } from "../auth.js";
import { fleetManager } from "../engine.js";
import { addConnection, removeConnection } from "../sse.js";

type StreamEnv = { Variables: { wallet: string; sessionId: string } };

const stream = new Hono<StreamEnv>();

stream.use("*", async (c, next) => {
  const token = c.req.query("token") ?? c.req.header("Authorization")?.slice(7);
  if (!token) return c.json({ error: "Missing authorization" }, 401);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Invalid or expired session" }, 401);
  c.set("wallet", session.walletAddress);
  c.set("sessionId", token);
  await next();
});

stream.get("/", (c) => {
  const address = c.get("wallet");

  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  c.header("X-Accel-Buffering", "no");

  return streamSSE(c, async (sse) => {
    const conn = addConnection(address, sse);
    if (!conn) {
      await sse.writeSSE({ event: "error", data: JSON.stringify({ error: "Too many connections (max 3)" }) });
      return;
    }

    const uf = await fleetManager.getOrCreate(address);

    await sse.writeSSE({
      event: "state",
      data: JSON.stringify({ ...uf.getState(), burnerReady: uf.burnerKey !== null }, (_k, v) => typeof v === "bigint" ? v.toString() : v),
    });

    const unsubscribe = uf.onChange(() => {
      const state = uf.getState();
      sse.writeSSE({
        event: "tick",
        data: JSON.stringify({ cats: state.cats }, (_k, v) => typeof v === "bigint" ? v.toString() : v),
      }).catch(() => {});
    });

    sse.onAbort(() => {
      unsubscribe();
      removeConnection(conn);
    });

    await new Promise<void>((resolve) => {
      sse.onAbort(resolve);
    });
  });
});

export { stream };
