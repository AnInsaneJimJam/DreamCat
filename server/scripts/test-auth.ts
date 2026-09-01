import { privateKeyToAccount } from "viem/accounts";
import { generatePrivateKey } from "viem/accounts";

const BASE = process.env.SERVER_URL || "http://localhost:4000";

async function json(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  console.log(`Test wallet: ${account.address}`);

  console.log("\n1. GET /auth/nonce");
  const nonceRes = await json(`${BASE}/auth/nonce?address=${account.address}`);
  console.log(`   Status: ${nonceRes.status}`, nonceRes.body);
  if (nonceRes.status !== 200) throw new Error("Nonce request failed");

  const { nonce, message } = nonceRes.body as { nonce: string; message: string };

  console.log("\n2. Sign message");
  const signature = await account.signMessage({ message });
  console.log(`   Signature: ${signature.slice(0, 20)}...`);

  console.log("\n3. POST /auth/verify");
  const verifyRes = await json(`${BASE}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account.address, signature, nonce }),
  });
  console.log(`   Status: ${verifyRes.status}`, verifyRes.body);
  if (verifyRes.status !== 200) throw new Error("Verify failed");

  const { sessionId } = verifyRes.body as { sessionId: string };

  console.log("\n4. GET /auth/me (valid session)");
  const meRes = await json(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${sessionId}` },
  });
  console.log(`   Status: ${meRes.status}`, meRes.body);
  if (meRes.status !== 200) throw new Error("/me failed with valid session");

  console.log("\n5. Replay protection: reuse nonce");
  const replayRes = await json(`${BASE}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account.address, signature, nonce }),
  });
  console.log(`   Status: ${replayRes.status} (expected 401)`, replayRes.body);
  if (replayRes.status !== 401) throw new Error("Replay protection failed");

  console.log("\n6. POST /auth/logout");
  const logoutRes = await json(`${BASE}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionId}` },
  });
  console.log(`   Status: ${logoutRes.status}`, logoutRes.body);
  if (logoutRes.status !== 200) throw new Error("Logout failed");

  console.log("\n7. GET /auth/me (after logout)");
  const meAfterRes = await json(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${sessionId}` },
  });
  console.log(`   Status: ${meAfterRes.status} (expected 401)`, meAfterRes.body);
  if (meAfterRes.status !== 401) throw new Error("Session not invalidated after logout");

  console.log("\n✓ All auth tests passed");
}

main().catch((err) => {
  console.error("\n✗ Test failed:", err.message);
  process.exit(1);
});
