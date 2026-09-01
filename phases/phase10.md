# Phase 10: Deployment, Env Config & Graceful Degradation

## Goal
Production deployment on Railway, environment wiring, error recovery, and fallback behavior.

## Files to Create

### `server/src/graceful.ts`
Shutdown handler:
```
registerShutdown(fleetManager, sseTracker): void
  — SIGTERM / SIGINT handler
  — persists ALL fleet states to Redis (immediate, not throttled)
  — sends event: shutdown to all SSE connections
  — closes all SDK WebSocket connections via market-data unsubscribe
  — closes HTTP server
  — process.exit(0)
```

### `server/src/middleware/rate-limit.ts`
Simple in-memory rate limiter:
- Auth endpoints (`/auth/*`): 60 req/min per IP
- Fleet endpoints (`/fleet/*`): 120 req/min per session
- SSE connections: max 3 per user (already in SseTracker)

## Files to Modify

### `server/src/index.ts`
- Register graceful shutdown handler
- Add rate limiting middleware
- Add startup recovery: `fleetManager.recoverFleets()` on boot
- Request logging: method, path, status, duration

### `server/src/engine.ts`
- `recoverFleets()`: on startup, read `fleet:active` set from Redis, load and start each fleet
- Idle timeout: dry-mode fleets with no SSE listeners for 30min → stop ticking, persist state, remove from memory (resume on next API call)
- Error recovery in tick: wrap in try/catch, log error, continue loop (never crash)

### `lib/fleet-bridge.ts`
- Fallback: if SSE disconnects and EventSource fails 3 consecutive reconnects → switch to local mode with notification
- Offline detection: `navigator.onLine === false` → use local mode

### `components/FleetDeck.tsx`
- Connection status in header: "Running on server" / "Local mode" / "Server unreachable"
- Toast/banner on automatic fallback from server to local

### `.env.local.example`
Add: `NEXT_PUBLIC_FLEET_SERVER_URL=https://your-app.railway.app`

### `server/.env.example` (final)
```
PORT=4000
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
BURNER_ENCRYPTION_KEY=<random-32-byte-hex>
CORS_ORIGINS=https://your-app.vercel.app,http://localhost:3111
NEXT_PUBLIC_INDEXER_URL=https://dev.smk.somnia.host/v1/graphql
NEXT_PUBLIC_WS_RPC_URL=wss://api.infra.testnet.somnia.network/ws
```

## Deployment Steps
1. Create Railway project, link to `server/` directory
2. Set env vars in Railway dashboard
3. Deploy via `railway up` or git push
4. Add `NEXT_PUBLIC_FLEET_SERVER_URL` to Vercel env vars
5. Redeploy Vercel to pick up the new env var
6. Verify end-to-end: Vercel frontend → Railway server → Somnia SDK

## Verification
- Deploy to Railway via `railway up`
- Vercel app connects to Railway server
- Kill Railway process → graceful shutdown persists state → Railway restarts → fleets auto-recover
- Block Railway URL in browser → client falls back to local mode with notification
- Unblock → client reconnects to server
- Health endpoint: `curl https://your-app.railway.app/health` → `{ ok: true, fleets: N, markets: M }`

## Risks
- Railway starter plan: verify it supports always-on services (it does — no sleep on starter)
- Redis from Railway: Upstash REST API is region-agnostic, no latency issues
- SDK WebSocket stability: long-running connections may drop, existing retry loops handle reconnection
- Node.js version on Railway: ensure Node 21+ for native WebSocket, or add `ws` polyfill

## Dependencies
All previous phases.
