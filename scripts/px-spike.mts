import { SomniaMarkets } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { SOMNIA_TESTNET_PRICE_FEED } from "@somnia-chain/markets-sdk";
async function main() {
  const exchange = new SomniaMarkets({
    indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
    chain: somniaShannon,
    wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
    priceFeed: SOMNIA_TESTNET_PRICE_FEED,
  });
  const p = await exchange.client.fetchPrice("BTC");
  console.log("BTC spot:", JSON.stringify(p, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  const candles = await exchange.client.fetchPriceCandles("BTC", "M1", { limit: 5 });
  console.log("isArray:", Array.isArray(candles), "len:", candles?.length);
  console.log("sample:", JSON.stringify(Array.isArray(candles) ? candles.slice(-2) : candles, (_k, v) => (typeof v === "bigint" ? v.toString() : v)).slice(0, 700));
}
main().then(() => process.exit(0)).catch((e) => { console.error(String(e).slice(0, 500)); process.exit(1); });
