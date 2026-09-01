import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { listServerMarkets } from "./sdk.js";
import { getActiveSubscriptionCount } from "./market-data.js";
import { fleetManager } from "./engine.js";
import { auth } from "./routes/auth.js";
import { fleet } from "./routes/fleet.js";
import { stream } from "./routes/stream.js";
import { registerShutdown } from "./graceful.js";
import { authRateLimit, fleetRateLimit } from "./middleware/rate-limit.js";

const app = new Hono();

const startTime = Date.now();

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${duration}ms`);
});

app.use(
  "*",
  cors({
    origin: env.CORS_ORIGINS === "*" ? "*" : env.CORS_ORIGINS.split(","),
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.use("/auth/*", authRateLimit());
app.use("/fleet/*", fleetRateLimit());

app.route("/auth", auth);
app.route("/fleet/stream", stream);
app.route("/fleet", fleet);

app.get("/health", (c) => {
  return c.json({
    ok: true,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    fleets: fleetManager.activeCount(),
    subscriptions: getActiveSubscriptionCount(),
  });
});

app.get("/api/markets", async (c) => {
  try {
    const markets = await listServerMarkets();
    return c.json({ markets, meta: { officialCount: markets.length, degraded: false, error: null } });
  } catch (err) {
    return c.json({ markets: [], meta: { officialCount: 0, degraded: true, error: String(err) } }, 500);
  }
});

const server = serve({ fetch: app.fetch, port: env.PORT }, async (info) => {
  console.log(`DreamCat server listening on :${info.port}`);
  await fleetManager.recoverFleets();
  fleetManager.startIdleCheck();
});

registerShutdown(fleetManager, server);
