import { saveFleetState, loadFleetState, deleteFleetState, addActiveFleet, removeActiveFleet, listActiveFleets, saveBurnerKey, loadBurnerKey, deleteBurnerKey, saveNonce, consumeNonce } from "../src/redis.js";
import { encryptKey, decryptKey } from "../src/crypto.js";
import type { PersistedFleetState } from "../src/types.js";

const TEST_ADDR = "0xTEST_" + Date.now();

async function main() {
  console.log("--- Crypto round-trip ---");
  const secret = "test-secret-key-at-least-32char!";
  const plain = "0xdeadbeef1234567890abcdef";
  const encrypted = encryptKey(plain, secret);
  const decrypted = decryptKey(encrypted, secret);
  console.log("  encrypt/decrypt:", decrypted === plain ? "PASS" : "FAIL");

  if (!process.env.UPSTASH_REDIS_REST_URL) {
    console.log("\nNo UPSTASH_REDIS_REST_URL set — skipping Redis tests");
    return;
  }

  console.log("\n--- Fleet state round-trip ---");
  const state: PersistedFleetState = {
    cats: [],
    running: false,
    mode: "dry",
    bankroll: 1000,
    quotePolicy: "shadow",
  };
  await saveFleetState(TEST_ADDR, state);
  const loaded = await loadFleetState(TEST_ADDR);
  console.log("  save/load:", JSON.stringify(loaded) === JSON.stringify(state) ? "PASS" : "FAIL");
  await deleteFleetState(TEST_ADDR);
  const deleted = await loadFleetState(TEST_ADDR);
  console.log("  delete:", deleted === null ? "PASS" : "FAIL");

  console.log("\n--- Active fleet set ---");
  await addActiveFleet(TEST_ADDR);
  let active = await listActiveFleets();
  console.log("  add/list:", active.includes(TEST_ADDR.toLowerCase()) ? "PASS" : "FAIL");
  await removeActiveFleet(TEST_ADDR);
  active = await listActiveFleets();
  console.log("  remove:", !active.includes(TEST_ADDR.toLowerCase()) ? "PASS" : "FAIL");

  console.log("\n--- Burner key ---");
  await saveBurnerKey(TEST_ADDR, encrypted);
  const loadedKey = await loadBurnerKey(TEST_ADDR);
  console.log("  save/load:", loadedKey === encrypted ? "PASS" : "FAIL");
  await deleteBurnerKey(TEST_ADDR);

  console.log("\n--- Nonce ---");
  const nonce = "test_nonce_" + Date.now();
  await saveNonce(nonce, TEST_ADDR);
  const consumed = await consumeNonce(nonce);
  console.log("  save/consume:", consumed === TEST_ADDR ? "PASS" : "FAIL");
  const consumedAgain = await consumeNonce(nonce);
  console.log("  replay protection:", consumedAgain === null ? "PASS" : "FAIL");

  console.log("\nAll Redis tests complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
