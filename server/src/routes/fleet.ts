import { Hono } from "hono";
import type { Hex } from "viem";
import { authMiddleware } from "../middleware/auth.js";
import { fleetManager } from "../engine.js";
import { listServerMarkets } from "../sdk.js";
import { encryptKey } from "../crypto.js";
import { saveBurnerKey, deleteBurnerKey } from "../redis.js";
import { env } from "../env.js";
import type { FleetCatInput, StrategyParams, QuotePolicy } from "../types.js";

const VALID_ARCHETYPES = new Set<string>(["maker", "momentum", "fade", "fairvalue", "theta", "marketmaker"]);
const MAX_CATS = 5;

type FleetEnv = { Variables: { wallet: string; sessionId: string } };

const fleet = new Hono<FleetEnv>();

fleet.use("*", authMiddleware);

fleet.get("/", async (c) => {
  const address = c.get("wallet");
  const uf = await fleetManager.getOrCreate(address);
  return c.json(uf.getState());
});

fleet.post("/start", async (c) => {
  const address = c.get("wallet");
  const uf = await fleetManager.getOrCreate(address);
  if (uf.cats.length === 0) return c.json({ error: "No cats to run" }, 400);
  uf.start();
  return c.json(uf.getState());
});

fleet.post("/stop", async (c) => {
  const address = c.get("wallet");
  const uf = await fleetManager.getOrCreate(address);
  uf.stop();
  return c.json(uf.getState());
});

fleet.put("/mode", async (c) => {
  const body = await c.req.json<{ mode?: string }>();
  if (body.mode !== "dry" && body.mode !== "live") {
    return c.json({ error: "mode must be 'dry' or 'live'" }, 400);
  }
  const address = c.get("wallet");
  const uf = await fleetManager.getOrCreate(address);
  const err = uf.setMode(body.mode);
  if (err) return c.json({ error: err }, 400);
  return c.json(uf.getState());
});

fleet.put("/bankroll", async (c) => {
  const body = await c.req.json<{ bankroll?: number }>();
  if (typeof body.bankroll !== "number" || body.bankroll < 100) {
    return c.json({ error: "bankroll must be a number >= 100" }, 400);
  }
  const address = c.get("wallet");
  const uf = await fleetManager.getOrCreate(address);
  uf.setBankroll(body.bankroll);
  return c.json(uf.getState());
});

fleet.put("/quote-policy", async (c) => {
  const body = await c.req.json<{ policy?: string }>();
  if (body.policy !== "shadow" && body.policy !== "single" && body.policy !== "dual") {
    return c.json({ error: "policy must be 'shadow', 'single', or 'dual'" }, 400);
  }
  const address = c.get("wallet");
  const uf = await fleetManager.getOrCreate(address);
  uf.setQuotePolicy(body.policy as QuotePolicy);
  return c.json(uf.getState());
});

fleet.get("/cats", async (c) => {
  const address = c.get("wallet");
  const uf = await fleetManager.getOrCreate(address);
  return c.json({ cats: uf.cats });
});

fleet.post("/cats", async (c) => {
  const body = await c.req.json<FleetCatInput>();
  if (!body.name || typeof body.slot !== "number") {
    return c.json({ error: "Missing required fields: name, slot" }, 400);
  }
  if (!VALID_ARCHETYPES.has(body.archetype)) {
    return c.json({ error: `Invalid archetype. Must be one of: ${[...VALID_ARCHETYPES].join(", ")}` }, 400);
  }
  const address = c.get("wallet");
  const uf = await fleetManager.getOrCreate(address);
  if (uf.cats.length >= MAX_CATS) {
    return c.json({ error: `Maximum ${MAX_CATS} cats allowed` }, 400);
  }
  if (uf.cats.some((cat) => cat.slot === body.slot)) {
    return c.json({ error: `Slot ${body.slot} already in use` }, 400);
  }
  const newAlloc = uf.totalAllocPct() + (body.allocPct ?? 0);
  if (newAlloc > 100) {
    return c.json({ error: `Total allocation would be ${newAlloc}%, exceeds 100%` }, 400);
  }
  const cat = uf.addCat(body);
  return c.json({ cat }, 201);
});

fleet.put("/cats/:slot", async (c) => {
  const slot = parseInt(c.req.param("slot"), 10);
  if (isNaN(slot)) return c.json({ error: "Invalid slot" }, 400);
  const body = await c.req.json<{ params?: StrategyParams; allocPct?: number }>();
  if (!body.params && body.allocPct === undefined) {
    return c.json({ error: "Provide params and/or allocPct" }, 400);
  }
  const address = c.get("wallet");
  const uf = await fleetManager.getOrCreate(address);
  const target = uf.cats.find((cat) => cat.slot === slot);
  if (!target) return c.json({ error: "Cat not found" }, 404);
  const params = body.params ?? target.params;
  const allocPct = body.allocPct ?? target.allocPct;
  const otherAlloc = uf.totalAllocPct() - target.allocPct;
  if (otherAlloc + allocPct > 100) {
    return c.json({ error: `Total allocation would be ${otherAlloc + allocPct}%, exceeds 100%` }, 400);
  }
  const err = uf.updateCatConfig(slot, params, allocPct);
  if (err) return c.json({ error: err }, 400);
  return c.json(uf.getState());
});

fleet.delete("/cats/:slot", async (c) => {
  const slot = parseInt(c.req.param("slot"), 10);
  if (isNaN(slot)) return c.json({ error: "Invalid slot" }, 400);
  const address = c.get("wallet");
  const uf = await fleetManager.getOrCreate(address);
  const err = uf.removeCat(slot);
  if (err) return c.json({ error: err }, 400);
  return c.json(uf.getState());
});

fleet.post("/burner", async (c) => {
  const body = await c.req.json<{ key?: string }>();
  if (!body.key || !body.key.startsWith("0x")) {
    return c.json({ error: "Invalid key format" }, 400);
  }
  const secret = env.BURNER_ENCRYPTION_KEY;
  if (!secret) return c.json({ error: "Server encryption not configured" }, 500);
  const address = c.get("wallet");
  const encrypted = encryptKey(body.key, secret);
  await saveBurnerKey(address, encrypted);
  const uf = await fleetManager.getOrCreate(address);
  uf.setBurnerKey(body.key as Hex);
  return c.json({ ok: true });
});

fleet.delete("/burner", async (c) => {
  const address = c.get("wallet");
  await deleteBurnerKey(address);
  const uf = await fleetManager.getOrCreate(address);
  uf.setBurnerKey(null);
  return c.json(uf.getState());
});

fleet.get("/burner/status", async (c) => {
  const address = c.get("wallet");
  const uf = await fleetManager.getOrCreate(address);
  return c.json({ ready: uf.burnerKey !== null, address: uf.burnerKey ? address : null });
});

fleet.get("/markets", async (c) => {
  const markets = await listServerMarkets();
  return c.json({ markets });
});

export { fleet };
