# Phase 3: Auth System (Nonce + Signature + Sessions)

## Goal
SIWE-style wallet authentication: client signs a challenge, server verifies with `viem.verifyMessage`, issues a session token. Follows the existing `board-auth.ts` pattern.

## Files to Create

### `server/src/auth.ts`
Core auth logic:
```
generateNonce(): { nonce: string, expiresAt: number }
  — random 32-byte hex, stores in Redis via saveNonce(), 5min TTL (matches board-auth.ts SIGNATURE_TTL_MS)

fleetAuthMessage(nonce: string): string
  — "DreamCat fleet: authenticate at {nonce}" (follows board-auth.ts domain-prefixed pattern)

verifyAuth(address: string, signature: Hex, nonce: string): Promise<boolean>
  — viem.verifyMessage (same as leaderboard route), consumes nonce from Redis (replay protection)

createSession(walletAddress: string): Promise<{ sessionId: string, expiresAt: number }>
  — generates crypto.randomUUID(), stores via saveSession(), 24h TTL

validateSession(sessionId: string): Promise<Session | null>
  — loads from Redis, checks expiry
```

### `server/src/middleware/auth.ts`
Hono middleware:
- Reads `Authorization: Bearer {sessionId}` header
- Calls `validateSession()`, attaches wallet address to context via `c.set("wallet", address)`
- Returns 401 on invalid/expired/missing

### `server/src/routes/auth.ts`
Hono router:
```
GET  /auth/nonce   — returns { nonce, message, expiresAt }
POST /auth/verify  — body { address, signature, nonce } → { sessionId, expiresAt }
POST /auth/logout  — deletes session (requires auth)
GET  /auth/me      — returns { address, expiresAt } (requires auth)
```

## Files to Modify
- `server/src/index.ts` — mount auth routes, ensure CORS allows credentials

## Verification
- Script `server/scripts/test-auth.ts`: use `viem.privateKeyToAccount` + `signMessage` to simulate full flow
- Verify: get nonce → sign → verify → use token on `/auth/me` → logout → token rejected
- Verify replay: reusing a consumed nonce returns 401

## Risks
- Session token stored in `sessionStorage` on the client (same pattern as burner key in `burner.ts`). Lost on tab close — user re-authenticates. Acceptable for hackathon.
- CORS: Railway domain is dynamic. Default `CORS_ORIGINS=*` for hackathon, tighten for production.

## Dependencies
Phase 2 (Redis for nonce/session storage).
