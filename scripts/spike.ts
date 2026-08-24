import { SomniaMarkets, isBinaryMarket } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";

const INDEXER = process.env.INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql";

async function main() {
  const exchange = new SomniaMarkets({
    indexerUrl: INDEXER,
    chain: somniaShannon,
    wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
  });

  const markets = Object.values(await exchange.loadMarkets(true));
  console.log(`total markets: ${markets.length}`);

  const binary = markets.filter((m) => m.active && isBinaryMarket(m.info));
  console.log(`live binary markets: ${binary.length}`);
  for (const m of binary.slice(0, 8)) {
    if (!isBinaryMarket(m.info)) continue;
    console.log(
      [m.info.marketId, m.outcomes?.[0]?.symbol, `status=${m.info.status}`]
        .filter(Boolean)
        .join(" | ")
    );
  }

  const first = binary[0];
  if (first?.outcomes?.[0]?.symbol) {
    const symbol = first.outcomes[0].symbol;
    const book = await exchange.fetchOrderBook(symbol, 5);
    console.log(`book ${symbol}:`, JSON.stringify(book, (_k, v) => (typeof v === "bigint" ? v.toString() : v)).slice(0, 400));
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
