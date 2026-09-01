# Phase 1: Railway Project Setup & Server Scaffold

## Goal
A minimal Hono HTTP server that starts on Railway, responds to a health check, and can import shared libs (`strategy.ts`, `fleet.ts`) from the parent project.

## Why Hono
Zero-dependency, ESM-native, built-in CORS/middleware, same API surface as Express but lighter. Keeps the Railway footprint small for hackathon scope.

## Files to Create

### `server/package.json`
- Deps: `hono`, `viem`, `@somnia-chain/markets-sdk`, `tsx` (dev)
- Scripts: `dev` (tsx watch), `build` (tsc), `start` (node dist/index.js)
- `"type": "module"`

### `server/tsconfig.json`
- Extends `../tsconfig.json`
- Overrides: `module: "NodeNext"`, removes `dom` from `lib`, sets `outDir: "dist"`, `rootDir: "src"`
- Paths alias `@shared/*` → `../lib/*` for importing strategy/fleet

### `server/src/index.ts`
- Hono app on `process.env.PORT || 4000`
- `GET /health` → `{ ok: true, uptime, fleets: 0 }`
- CORS middleware allowing `CORS_ORIGINS` env var (default `*` for hackathon)
- Request logging (method, path, status, duration)

### `server/src/env.ts`
- Single source for env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `BURNER_ENCRYPTION_KEY`, `PORT`, `CORS_ORIGINS`, indexer/WS/RPC URLs

### `server/railway.toml`
```toml
[build]
builder = "nixpacks"
buildCommand = "npm ci && npm run build"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/health"
restartPolicyType = "on_failure"
```

### `server/.env.example`
Documents all required env vars.

## Files to Modify
- Root `.gitignore` — add `server/node_modules`, `server/dist`

## Verification
- `cd server && npm run dev` starts, `curl localhost:4000/health` returns `{ ok: true }`
- `import { stepSim } from '../lib/strategy'` resolves without error
- Railway deploys via `railway up` and health endpoint responds

## Risks
- `@somnia-chain/markets-sdk` may use browser `WebSocket`. Node 21+ has native `WebSocket`; Node 18-20 needs `globalThis.WebSocket = require('ws')` polyfill. Test on first run.
- The server imports `../lib/strategy.ts` directly — these files must NOT have `"use client"` (confirmed: they don't).

## Dependencies
None (first phase).
