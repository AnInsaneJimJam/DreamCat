import { getMarketUniverse } from "@/lib/market-universe/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getMarketUniverse();
  return Response.json(data, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
