import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  try {
    const envPath = resolve(__dirname, "..", ".env");
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      const unquoted = val.replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = unquoted;
    }
  } catch {}
}

loadDotEnv();

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const env = {
  PORT: parseInt(optional("PORT", "4000"), 10),
  CORS_ORIGINS: optional("CORS_ORIGINS", "*"),

  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,

  BURNER_ENCRYPTION_KEY: process.env.BURNER_ENCRYPTION_KEY,

  INDEXER_URL: optional(
    "INDEXER_URL",
    "https://dev.smk.somnia.host/v1/graphql"
  ),
  WS_RPC_URL: optional(
    "WS_RPC_URL",
    "wss://api.infra.testnet.somnia.network/ws"
  ),
  RPC_URL: optional(
    "RPC_URL",
    "https://api.infra.testnet.somnia.network"
  ),
} as const;
