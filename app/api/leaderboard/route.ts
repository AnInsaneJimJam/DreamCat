import { NextResponse } from "next/server";
import { publishEntry, topEntries, storeMode, type LeaderboardEntry } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entries = await topEntries(20);
    return NextResponse.json({ mode: storeMode, entries });
  } catch {
    return NextResponse.json({ mode: storeMode, entries: [] });
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<LeaderboardEntry>;
  if (
    typeof body.catName !== "string" ||
    typeof body.archetype !== "string" ||
    typeof body.pnl !== "number" ||
    typeof body.params !== "object" ||
    body.params === null
  ) {
    return NextResponse.json({ error: "invalid entry" }, { status: 400 });
  }
  const entry: LeaderboardEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    catName: body.catName.slice(0, 40),
    archetype: body.archetype.slice(0, 20),
    params: body.params,
    pnl: Math.max(-1e9, Math.min(1e9, body.pnl)),
    trades: Math.max(0, Math.min(1e6, Math.floor(body.trades ?? 0))),
    wins: Math.max(0, Math.min(1e6, Math.floor(body.wins ?? 0))),
    marketLabel: (body.marketLabel ?? "").slice(0, 60),
    publishedAt: Date.now(),
  };
  try {
    await publishEntry(entry);
    return NextResponse.json({ ok: true, entry });
  } catch {
    return NextResponse.json({ error: "store unavailable" }, { status: 503 });
  }
}
