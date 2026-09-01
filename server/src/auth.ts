import { randomBytes, randomUUID } from "node:crypto";
import { verifyMessage, type Hex } from "viem";
import { consumeNonce, saveSession, loadSession, deleteSession } from "./redis.js";
import type { Session } from "./types.js";

export function generateNonce(): { nonce: string; expiresAt: number } {
  const nonce = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 5 * 60 * 1000;
  return { nonce, expiresAt };
}

export function fleetAuthMessage(nonce: string): string {
  return `DreamCat fleet: authenticate at ${nonce}`;
}

export async function verifyAuth(
  address: string,
  signature: Hex,
  nonce: string
): Promise<boolean> {
  const stored = await consumeNonce(nonce);
  if (!stored || stored.toLowerCase() !== address.toLowerCase()) return false;
  const message = fleetAuthMessage(nonce);
  return verifyMessage({ address: address as `0x${string}`, message, signature });
}

export async function createSession(
  walletAddress: string
): Promise<{ sessionId: string; expiresAt: number }> {
  const sessionId = randomUUID();
  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000;
  const session: Session = { walletAddress, createdAt: now, expiresAt };
  await saveSession(sessionId, session);
  return { sessionId, expiresAt };
}

export async function validateSession(sessionId: string): Promise<Session | null> {
  const session = await loadSession(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    await deleteSession(sessionId);
    return null;
  }
  return session;
}
