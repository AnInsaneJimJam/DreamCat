import { NextResponse } from "next/server";

export const revalidate = 60;

interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  sentiment: "up" | "down" | "flat";
}

const BULL = ["surge", "rally", "jump", "gain", "record", "high", "adopt", "approve", "inflow", "soar", "boost", "bullish"];
const BEAR = ["crash", "plunge", "drop", "fall", "ban", "hack", "lawsuit", "outflow", "liquidat", "slump", "fear", "bearish", "selloff"];

function sentiment(text: string): "up" | "down" | "flat" {
  const t = text.toLowerCase();
  const bull = BULL.some((w) => t.includes(w));
  const bear = BEAR.some((w) => t.includes(w));
  if (bull && !bear) return "up";
  if (bear && !bull) return "down";
  return "flat";
}

function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const block of blocks.slice(0, 14)) {
    const title = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/);
    const link = block.match(/<link>([\s\S]*?)<\/link>/);
    const pub = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!title) continue;
    const t = (title[1] ?? title[2] ?? "").trim();
    items.push({
      title: t,
      url: (link?.[1] ?? "").trim(),
      source: "CoinDesk",
      publishedAt: pub ? new Date(pub[1].trim()).getTime() : Date.now(),
      sentiment: sentiment(t),
    });
  }
  return items;
}

export async function GET() {
  const token = process.env.CRYPTOPANIC_TOKEN;
  try {
    if (token) {
      const res = await fetch(
        `https://cryptopanic.com/api/free/v1/posts/?auth_token=${token}&currencies=BTC,ETH&public=true`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) {
        const json = (await res.json()) as {
          results?: Array<{ title: string; url: string; source?: { title?: string }; published_at?: string }>;
        };
        const items: NewsItem[] = (json.results ?? []).slice(0, 12).map((p) => ({
          title: p.title,
          url: p.url,
          source: p.source?.title ?? "CryptoPanic",
          publishedAt: p.published_at ? new Date(p.published_at).getTime() : Date.now(),
          sentiment: sentiment(p.title),
        }));
        return NextResponse.json({ items });
      }
    }
    const res = await fetch("https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return NextResponse.json({ items: [] });
    return NextResponse.json({ items: parseRss(await res.text()).slice(0, 12) });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
