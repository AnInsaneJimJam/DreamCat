# Phase 5: Server-Side Tick Engine

## Goal
The core 1s tick loop that runs fleet cats 24/7, calling `stepSim` from `strategy.ts` and `tickFleet` from `fleet.ts` directly. This is the server-side equivalent of `fleet-runner.ts`.

## Files to Create

### `server/src/engine.ts`

**`UserFleet` class** (one per authenticated user):

State mirrors `FleetRunnerState`:
```ts
cats: FleetCat[]
running: boolean
mode: "dry" | "live"
bankroll: number
quotePolicy: QuotePolicy
tickTimer: NodeJS.Timeout | null
lastPersistAt: number
listeners: Set<() => void>
burnerKey: Hex | null  // decrypted, held in memory while fleet is active
```

Methods:
```
start(): void           — begins setInterval(tick, 1000), adds to fleet:active set
stop(): void            — clears interval, unsubscribes all markets, removes from fleet:active
tick(): void            — calls syncSubscriptions() then dryTick() or liveTick()

dryTick(): void         — builds FleetSlotData map from market-data.ts, calls tickFleet() from lib/fleet.ts DIRECTLY
liveTick(): void        — stepSim() per cat, deriveIntent(), executeIntent() via server SDK

syncSubscriptions(): void  — mirrors fleet-runner.ts syncWatches(): subscribe/unsubscribe markets via market-data.ts
persist(immediate?): void  — throttled 5s, calls saveFleetState() from redis.ts

getState(): FleetRunnerState  — returns current state for API/SSE
onChange(cb): () => void       — registers listener for state changes (SSE uses this)
```

**`FleetManager` singleton** — manages all UserFleet instances:
```
fleets: Map<string, UserFleet>   — keyed by wallet address

getOrCreate(address): Promise<UserFleet>  — loads from Redis on first access, starts if running was true
remove(address): void                      — stops fleet, removes from map
activeCount(): number                      — for health endpoint
recoverFleets(): Promise<void>             — on startup: reads fleet:active set, loads and starts each
idleCheck(): void                          — periodic: stop dry-mode fleets with no SSE listeners after 30min
```

### `server/src/live-intent.ts`
Fork of the pure functions from `lib/live-fleet.ts` (which has `"use client"`):
```
deriveIntent(oldSim, newSim, cfg): TradingIntent | null
canTradeLive(cat): boolean
isQuotingArchetype(archetype): boolean
initialLiveCatState(): LiveCatState
realizedFromClose(intent, executionPrice): number
```

These are pure functions with no browser deps — just copy them.

For actual order execution in live mode, use the server SDK client:
```
executeServerIntent(intent, client, burnerKey): Promise<void>
```

## Key Reuse
- `tickFleet()` from `lib/fleet.ts` — called directly, zero reimplementation
- `stepSim()` from `lib/strategy.ts` — called directly
- `equityCurve()` from `lib/strategy.ts` — called directly
- `buildServerMarketContext()` from Phase 4's `spot-data.ts`
- `getMarketData()` from Phase 4's `market-data.ts`

## Files to Modify
- `server/src/index.ts` — initialize `FleetManager` on startup, call `recoverFleets()`, add fleet count to health endpoint

## Verification
- Script `server/scripts/test-engine.ts`: create a UserFleet with one dry-mode cat on a live market, run for 30s, verify `sim.log` entries appear, verify Redis persistence
- Health endpoint shows `{ ok: true, fleets: 1 }`
- Kill and restart server — fleet auto-recovers from Redis and resumes ticking

## Risks
- Live mode holds decrypted burner keys in memory. On server restart, keys reload from encrypted Redis storage.
- Positions cleared on hydration (same as browser `hydrateFleet`): sim positions are reset since the book context is gone.
- Per-user mutex needed to prevent concurrent tick + API mutation races. Simple async lock pattern.

## Dependencies
Phase 2 (Redis state), Phase 4 (market data subscriptions).
