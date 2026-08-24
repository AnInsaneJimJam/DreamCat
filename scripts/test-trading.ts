import assert from "node:assert/strict";
import { validateManualTrade } from "../lib/trading";

const marketId = `0x${"a".repeat(64)}`;
const valid = validateManualTrade({
  marketId,
  outcome: "YES",
  side: "buy",
  type: "limit",
  amount: "5.25",
  price: "0.62",
});

assert.equal(valid.marketId, marketId);
assert.equal(valid.amount, 5.25);
assert.equal(valid.price, 0.62);
assert.throws(
  () => validateManualTrade({ marketId, outcome: "YES", side: "buy", amount: "0", price: "0.62" }),
  /amount must be greater than zero/,
);
assert.throws(
  () => validateManualTrade({ marketId, outcome: "YES", side: "buy", amount: "1", price: "1" }),
  /limit price must be between 0 and 1/,
);
assert.throws(
  () => validateManualTrade({ marketId: "not-an-id", outcome: "YES", side: "buy", amount: "1", price: "0.5" }),
  /marketId must be a bytes32 hex id/,
);
assert.throws(
  () => validateManualTrade({ marketId, outcome: "YES", side: "buy", amount: null as unknown as string, price: "0.5" }),
  /amount must be a finite decimal/,
);

console.log("manual trading validation checks passed");
