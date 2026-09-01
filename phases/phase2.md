# Phase 2: Redis State Layer

## Goal
A typed Redis module that stores and retrieves per-user fleet state in Upstash, reusing the raw-fetch pattern from `lib/store.ts`.

## Files to Create

### `server/src/redis.ts`
Reuses the `store.ts` pattern: POST JSON array to Upstash REST API with Bearer auth.

```
redisCmd<T>(command: (string|number)[]): Promise<T>  — generic command runner
redisPipeline(commands: (string|number)[][]): Promise<any[]>  — batch commands
```

Fleet state operations:
```
saveFleetState(address, state: PersistedFleetState): void  — SET fleet:{address} JSON, TTL 30d
loadFleetState(address): PersistedFleetState | null        — GET fleet:{address}
deleteFleetState(address): void

addActiveFleet(address): void     — SADD fleet:active {address}
removeActiveFleet(address): void  — SREM fleet:active {address}
listActiveFleets(): string[]      — SMEMBERS fleet:active

saveBurnerKey(address, encrypted): void  — SET burner:{address}, TTL 7d
loadBurnerKey(address): string | null
deleteBurnerKey(address): void

saveSession(id, session): void  — SET session:{id}, TTL 24h
loadSession(id): Session | null
deleteSession(id): void

saveNonce(nonce, address): void  — SET nonce:{nonce} {address} EX 300
consumeNonce(nonce): string | null  — GET + DEL (atomic via pipeline)
```

### `server/src/types.ts`
```ts
PersistedFleetState {
  cats: FleetCat[]
  running: boolean
  mode: "dry" | "live"
  bankroll: number
  quotePolicy: QuotePolicy
}

Session {
  walletAddress: string
  createdAt: number
  expiresAt: number
}
```
Re-exports `FleetCat`, `SimState`, `BookSnapshot`, `Fill`, etc. from `../../lib/fleet` and `../../lib/strategy`.

### `server/src/crypto.ts`
Burner key encryption using Node.js `crypto` (no new deps):
```
encryptKey(plainHex, secret): string   — AES-256-GCM, returns iv:ciphertext:tag base64
decryptKey(encrypted, secret): string  — reverse
```
Secret from `BURNER_ENCRYPTION_KEY` env var.

## Verification
- Script `server/scripts/test-redis.ts`: write/read/delete fleet state, verify round-trip
- Verify encrypted burner key round-trips correctly
- Confirm key namespacing doesn't collide with existing `dreamcat:lb` leaderboard keys

## Risks
- **Upstash rate limits**: Free tier = 10K commands/day. With 5 users ticking at 1s, persisting every 5s = ~86K commands/day. Will need paid tier ($10/mo) or throttle persist to every 30s.
- Use `redisPipeline` to batch reads/writes and reduce command count.

## Dependencies
Phase 1 (server scaffold).
