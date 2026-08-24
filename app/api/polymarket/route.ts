import { NextResponse } from "next/server";

export const revalidate = 30;

interface PmMarket {
  question: string;
  prices: number[];
  volume24hr: number;
  endDate: string;
  slug: string;
}

export async function GET() {
  try {
    const res = await fetch(
      "https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=100",
      { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } }
    );
    if (!res.ok) return NextResponse.json({ markets: [] });
    const raw = (await res.json()) as Array<Record<string, unknown>>;
    const markets: PmMarket[] = [];
    for (const m of raw) {
      const q = String(m.question ?? "");
      if (!/bitcoin|btc|ethereum|eth/i.test(q)) continue;
      let prices: number[] = [];
      try {
        const parsed = JSON.parse(String(m.outcomePrices ?? "[]")) as string[];
        prices = parsed.map(Number);
      } catch {}
      markets.push({
        question: q,
        prices,
        volume24hr: Number(m.volume24hr ?? 0),
        endDate: String(m.endDate ?? ""),
        slug: String(m.slug ?? ""),
      });
      if (markets.length >= 10) break;
    }
    return NextResponse.json({ markets });
  } catch {
    return NextResponse.json({ markets: [] });
  }
}
