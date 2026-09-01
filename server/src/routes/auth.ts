import { Hono } from "hono";
import { isAddress, type Hex } from "viem";
import { generateNonce, fleetAuthMessage, verifyAuth, createSession } from "../auth.js";
import { saveNonce } from "../redis.js";
import { deleteSession } from "../redis.js";
import { authMiddleware } from "../middleware/auth.js";

type AuthEnv = { Variables: { wallet: string; sessionId: string } };

const auth = new Hono<AuthEnv>();

auth.get("/nonce", async (c) => {
  const { nonce, expiresAt } = generateNonce();
  const address = c.req.query("address");
  if (!address || !isAddress(address, { strict: false })) {
    return c.json({ error: "Missing or invalid address query param" }, 400);
  }
  await saveNonce(nonce, address);
  return c.json({ nonce, message: fleetAuthMessage(nonce), expiresAt });
});

auth.post("/verify", async (c) => {
  const body = await c.req.json<{ address?: string; signature?: string; nonce?: string }>();
  if (!body.address || !isAddress(body.address, { strict: false })) {
    return c.json({ error: "Invalid address" }, 400);
  }
  if (!body.signature || !body.nonce) {
    return c.json({ error: "Missing signature or nonce" }, 400);
  }
  const valid = await verifyAuth(body.address, body.signature as Hex, body.nonce);
  if (!valid) {
    return c.json({ error: "Signature verification failed" }, 401);
  }
  const { sessionId, expiresAt } = await createSession(body.address);
  return c.json({ sessionId, expiresAt });
});

auth.post("/logout", authMiddleware, async (c) => {
  const sessionId = c.get("sessionId") as string;
  await deleteSession(sessionId);
  return c.json({ ok: true });
});

auth.get("/me", authMiddleware, (c) => {
  const wallet = c.get("wallet") as string;
  return c.json({ address: wallet });
});

export { auth };
