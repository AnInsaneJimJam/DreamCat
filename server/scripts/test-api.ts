import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const BASE = process.env.SERVER_URL || "http://localhost:4000";

async function json(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const body = await res.json();
  return { status: res.status, body };
}

function authHeaders(sessionId: string): Record<string, string> {
  return { Authorization: `Bearer ${sessionId}`, "Content-Type": "application/json" };
}

async function authenticate(): Promise<{ sessionId: string; address: string }> {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  const nonceRes = await json(`${BASE}/auth/nonce?address=${account.address}`);
  if (nonceRes.status !== 200) throw new Error(`Nonce failed: ${nonceRes.status}`);
  const { nonce, message } = nonceRes.body as { nonce: string; message: string };
  const signature = await account.signMessage({ message });
  const verifyRes = await json(`${BASE}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account.address, signature, nonce }),
  });
  if (verifyRes.status !== 200) throw new Error(`Verify failed: ${verifyRes.status}`);
  return { sessionId: (verifyRes.body as { sessionId: string }).sessionId, address: account.address };
}

async function main() {
  console.log("Authenticating...");
  const { sessionId, address } = await authenticate();
  const h = authHeaders(sessionId);
  console.log(`Authenticated as ${address}\n`);

  console.log("1. GET /fleet (initial state)");
  const s1 = await json(`${BASE}/fleet`, { headers: h });
  console.log(`   Status: ${s1.status}, cats: ${s1.body.cats?.length}`);

  console.log("\n2. POST /fleet/cats (create cat)");
  const cat1 = await json(`${BASE}/fleet/cats`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      slot: 0,
      name: "TestCat",
      accent: "#ff9900",
      archetype: "maker",
      params: { orderSize: 50, entryEdge: 0.04, takeProfit: 0.08, stopLoss: 0.12, lookback: 20, maxHoldSec: 600 },
      marketId: "test-market-1",
      allocPct: 25,
    }),
  });
  console.log(`   Status: ${cat1.status}`, cat1.body.cat?.name ?? cat1.body.error);
  if (cat1.status !== 201) throw new Error("Create cat failed");

  console.log("\n3. GET /fleet/cats");
  const cats1 = await json(`${BASE}/fleet/cats`, { headers: h });
  console.log(`   Status: ${cats1.status}, count: ${cats1.body.cats?.length}`);
  if (cats1.body.cats?.length !== 1) throw new Error("Expected 1 cat");

  console.log("\n4. PUT /fleet/cats/0 (update config)");
  const upd = await json(`${BASE}/fleet/cats/0`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ allocPct: 30 }),
  });
  console.log(`   Status: ${upd.status}`);
  if (upd.status !== 200) throw new Error("Update cat failed");

  console.log("\n5. PUT /fleet/bankroll");
  const br = await json(`${BASE}/fleet/bankroll`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ bankroll: 5000 }),
  });
  console.log(`   Status: ${br.status}`);
  if (br.status !== 200) throw new Error("Set bankroll failed");

  console.log("\n6. PUT /fleet/bankroll (below minimum → 400)");
  const brFail = await json(`${BASE}/fleet/bankroll`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ bankroll: 50 }),
  });
  console.log(`   Status: ${brFail.status} (expected 400)`, brFail.body.error);
  if (brFail.status !== 400) throw new Error("Expected 400 for low bankroll");

  console.log("\n7. PUT /fleet/mode → live (no burner → error)");
  const modeFail = await json(`${BASE}/fleet/mode`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ mode: "live" }),
  });
  console.log(`   Status: ${modeFail.status} (expected 400)`, modeFail.body.error);
  if (modeFail.status !== 400) throw new Error("Expected 400 for live without burner");

  console.log("\n8. POST /fleet/start");
  const start = await json(`${BASE}/fleet/start`, { method: "POST", headers: h });
  console.log(`   Status: ${start.status}, running: ${start.body.running}`);
  if (start.status !== 200) throw new Error("Start failed");

  console.log("\n9. POST /fleet/stop");
  const stop = await json(`${BASE}/fleet/stop`, { method: "POST", headers: h });
  console.log(`   Status: ${stop.status}, running: ${stop.body.running}`);
  if (stop.status !== 200) throw new Error("Stop failed");

  console.log("\n10. 6th cat guard");
  for (let i = 1; i < 5; i++) {
    await json(`${BASE}/fleet/cats`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        slot: i, name: `Cat${i}`, accent: "#aabbcc", archetype: "fade",
        params: { orderSize: 50, entryEdge: 0.04, takeProfit: 0.08, stopLoss: 0.12, lookback: 20, maxHoldSec: 600 },
        marketId: `test-market-${i + 1}`, allocPct: 10,
      }),
    });
  }
  const cat6 = await json(`${BASE}/fleet/cats`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      slot: 5, name: "Cat5", accent: "#aabbcc", archetype: "fade",
      params: { orderSize: 50, entryEdge: 0.04, takeProfit: 0.08, stopLoss: 0.12, lookback: 20, maxHoldSec: 600 },
      marketId: "test-market-6", allocPct: 5,
    }),
  });
  console.log(`   6th cat status: ${cat6.status} (expected 400)`, cat6.body.error);
  if (cat6.status !== 400) throw new Error("Expected 400 for 6th cat");

  console.log("\n11. DELETE /fleet/cats/0");
  const del = await json(`${BASE}/fleet/cats/0`, { method: "DELETE", headers: h });
  console.log(`   Status: ${del.status}`);
  if (del.status !== 200) throw new Error("Delete cat failed");

  console.log("\n12. GET /fleet/markets");
  const mkts = await json(`${BASE}/fleet/markets`, { headers: h });
  console.log(`   Status: ${mkts.status}, markets: ${mkts.body.markets?.length ?? 0}`);

  console.log("\n✓ All fleet API tests passed");
}

main().catch((err) => {
  console.error("\n✗ Test failed:", err.message);
  process.exit(1);
});
