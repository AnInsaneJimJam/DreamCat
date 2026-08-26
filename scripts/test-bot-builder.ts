import assert from "node:assert/strict";
import {
  BOT_CONFIG_VERSION,
  BotConfigValidationError,
  DEFAULT_RISK_LIMITS,
  STRATEGY_IDS,
  STRATEGY_TEMPLATES,
  botConfigHash,
  exportBotEnv,
  sanitizeBotConfig,
  serializeBotConfig,
  validateBotConfig,
  type BotConfig,
} from "../lib/bot-builder";

const marketId = `0x${"a".repeat(64)}`;

function configFor(strategy: BotConfig["strategy"]): BotConfig {
  const template = STRATEGY_TEMPLATES.find((entry) => entry.id === strategy);
  assert(template);
  return {
    version: BOT_CONFIG_VERSION,
    name: `${template.name} check`,
    strategy,
    marketType: "event",
    market: { marketId, outcome: "YES" },
    network: "testnet",
    mode: "dry-run",
    params: { ...template.defaults },
    risk: { ...DEFAULT_RISK_LIMITS },
  } as BotConfig;
}

assert.deepEqual(STRATEGY_IDS, ["starter", "market-maker", "grid", "momentum", "mean-reversion", "twap", "ensemble"]);
for (const strategy of STRATEGY_IDS) assert.deepEqual(validateBotConfig(configFor(strategy)), []);
for (const strategy of STRATEGY_IDS) {
  assert.deepEqual(
    validateBotConfig({ ...configFor(strategy), marketType: "spot", market: { symbol: "BTC/USDC" } }),
    [],
  );
}

const valid = configFor("grid");
const withSecret = { ...valid, privateKey: `0x${"b".repeat(64)}` } as BotConfig & { privateKey: string };
const safe = sanitizeBotConfig(withSecret);
assert.equal("privateKey" in safe, false);
assert.equal(serializeBotConfig(withSecret).includes("privateKey"), false);
assert.equal(exportBotEnv(withSecret).includes("privateKey"), false);
assert.equal(exportBotEnv(withSecret).includes(withSecret.privateKey), false);

const reordered = {
  ...valid,
  params: Object.fromEntries(Object.entries(valid.params).reverse()),
};
assert.equal(botConfigHash(valid), botConfigHash(reordered));
assert.notEqual(botConfigHash(valid), botConfigHash({ ...valid, name: "changed" }));

const invalid = validateBotConfig({
  ...valid,
  marketType: "event",
  market: { marketId: "not-an-id", outcome: "MAYBE" },
  params: { ...valid.params, levels: 0 },
  risk: { ...DEFAULT_RISK_LIMITS, maxConcurrentPositions: 1.5 },
});
const invalidMarketType = validateBotConfig({ ...valid, marketType: "invalid" });
assert(invalidMarketType.some((issue) => issue.path === "marketType"));
assert(invalid.some((issue) => issue.path === "market.marketId"));
assert(invalid.some((issue) => issue.path === "market.outcome"));
assert(invalid.some((issue) => issue.path === "params.levels"));
assert(invalid.some((issue) => issue.path === "risk.maxConcurrentPositions"));
const invalidTwap = {
  ...configFor("twap"),
  params: { ...configFor("twap").params, totalSize: 100, sliceSize: 10, intervalSec: 60, durationSec: 60 },
};
assert(validateBotConfig(invalidTwap).some((issue) => issue.path === "params.durationSec"));
assert.throws(
  () => sanitizeBotConfig({ ...valid, market: { marketId, outcome: "MAYBE" } }),
  (error: unknown) => error instanceof BotConfigValidationError && error.issues.some((issue) => issue.path === "market.outcome"),
);
assert.throws(
  () => sanitizeBotConfig({ ...valid, version: 2 }),
  (error: unknown) => error instanceof BotConfigValidationError && error.issues.some((issue) => issue.path === "version"),
);
assert(validateBotConfig({ ...valid, market: { marketId, outcome: "YES", symbol: "bad\nlabel" } }).some((issue) => issue.path === "market.symbol"));

const env = exportBotEnv(valid);
assert(env.includes("BOT_CONFIG_VERSION=1"));
assert(env.includes("BOT_STRATEGY='grid'"));
assert(env.includes("BOT_MODE='dry-run'"));
assert(env.includes("BOT_SIGNER_SOURCE="));
assert(!env.includes("PRIVATE_KEY"));

console.log("bot-builder domain checks passed");
