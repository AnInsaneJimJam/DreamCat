import { NextResponse } from "next/server";
import { isAddress, verifyMessage, type Address } from "viem";
import { deleteMessage, freshNonce, publishMessage } from "@/lib/board-auth";
import { deleteEntry, publishEntry, storeMode, topEntries, type LeaderboardEntry } from "@/lib/store";

export const dynamic = "force-dynamic";

async function signerMatches(message: string, signature: string, owner: Address): Promise<boolean> {
  try {
    return await verifyMessage({ address: owner, message, signature: signature as `0x${string}` });
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const entries = await topEntries(20);
    return NextResponse.json({ mode: storeMode, entries });
  } catch {
    return NextResponse.json({ mode: storeMode, entries: [] });
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<LeaderboardEntry> & { nonce?: unknown; signature?: unknown };
  if (
    typeof body.catName !== "string" ||
    typeof body.archetype !== "string" ||
    typeof body.pnl !== "number" ||
    typeof body.params !== "object" ||
    body.params === null
  ) {
    return NextResponse.json({ error: "invalid entry" }, { status: 400 });
  }
  if (typeof body.owner !== "string" || !isAddress(body.owner)) {
    return NextResponse.json({ error: "connect a wallet to publish" }, { status: 400 });
  }
  if (typeof body.signature !== "string" || !freshNonce(body.nonce)) {
    return NextResponse.json({ error: "signature required" }, { status: 401 });
  }
  const catName = body.catName.slice(0, 40);
  const owner = body.owner as Address;
  if (!(await signerMatches(publishMessage(body.nonce, catName), body.signature, owner))) {
    return NextResponse.json({ error: "signature did not match the wallet" }, { status: 401 });
  }

  const entry: LeaderboardEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    catName,
    archetype: body.archetype.slice(0, 20),
    params: body.params,
    pnl: Math.max(-1e9, Math.min(1e9, body.pnl)),
    trades: Math.max(0, Math.min(1e6, Math.floor(body.trades ?? 0))),
    wins: Math.max(0, Math.min(1e6, Math.floor(body.wins ?? 0))),
    marketLabel: (body.marketLabel ?? "").slice(0, 60),
    publishedAt: Date.now(),
    owner: owner.toLowerCase(),
  };
  try {
    await publishEntry(entry);
    return NextResponse.json({ ok: true, entry });
  } catch {
    return NextResponse.json({ error: "store unavailable" }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { id?: unknown; owner?: unknown; nonce?: unknown; signature?: unknown }
    | null;
  if (!body || typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "invalid entry id" }, { status: 400 });
  }
  if (typeof body.owner !== "string" || !isAddress(body.owner)) {
    return NextResponse.json({ error: "connect a wallet to delete" }, { status: 400 });
  }
  if (typeof body.signature !== "string" || !freshNonce(body.nonce)) {
    return NextResponse.json({ error: "signature required" }, { status: 401 });
  }
  const owner = body.owner as Address;
  if (!(await signerMatches(deleteMessage(body.id, body.nonce), body.signature, owner))) {
    return NextResponse.json({ error: "signature did not match the wallet" }, { status: 401 });
  }

  try {
    const result = await deleteEntry(body.id, owner);
    if (result === "not-found") return NextResponse.json({ error: "entry not found" }, { status: 404 });
    if (result === "forbidden") {
      return NextResponse.json({ error: "only the wallet that published this run can delete it" }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "store unavailable" }, { status: 503 });
  }
}
