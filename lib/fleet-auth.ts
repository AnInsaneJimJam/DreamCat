"use client";

import type { Hex } from "viem";

const SESSION_KEY = "dreamcat-fleet-session";

function fleetServerUrl(): string {
  return process.env.NEXT_PUBLIC_FLEET_SERVER_URL ?? "http://localhost:4000";
}

export function storeFleetSession(id: string): void {
  try { sessionStorage.setItem(SESSION_KEY, id); } catch {}
}

export function getFleetSession(): string | null {
  try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
}

export function clearFleetSession(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

export async function authenticateFleetServer(
  signMessage: (msg: string) => Promise<Hex>,
  address: string,
): Promise<string> {
  const base = fleetServerUrl();

  const nonceRes = await fetch(`${base}/auth/nonce?address=${encodeURIComponent(address)}`);
  if (!nonceRes.ok) throw new Error("Failed to get nonce");
  const { nonce, message } = (await nonceRes.json()) as { nonce: string; message: string };

  const signature = await signMessage(message);

  const verifyRes = await fetch(`${base}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, signature, nonce }),
  });
  if (!verifyRes.ok) throw new Error("Signature verification failed");
  const { sessionId } = (await verifyRes.json()) as { sessionId: string };

  storeFleetSession(sessionId);
  return sessionId;
}

export function restoreFleetSession(): string | null {
  return getFleetSession();
}

export async function logoutFleetServer(): Promise<void> {
  const session = getFleetSession();
  if (!session) return;
  const base = fleetServerUrl();
  try {
    await fetch(`${base}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session}` },
    });
  } catch {}
  clearFleetSession();
}
