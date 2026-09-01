import type { Context, Next } from "hono";
import { validateSession } from "../auth.js";

export async function authMiddleware(c: Context, next: Next) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Missing authorization" }, 401);
  }
  const sessionId = header.slice(7);
  const session = await validateSession(sessionId);
  if (!session) {
    return c.json({ error: "Invalid or expired session" }, 401);
  }
  c.set("wallet", session.walletAddress);
  c.set("sessionId", sessionId);
  await next();
}
