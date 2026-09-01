# Phase 6: Fleet REST API (CRUD + Control)

## Goal
Full REST API for fleet management — all endpoints behind auth middleware from Phase 3.

## Files to Create

### `server/src/routes/fleet.ts`
Hono router, all routes use auth middleware.

**State & Control:**
```
GET    /fleet              — returns full FleetRunnerState from userFleet.getState()
POST   /fleet/start        — userFleet.start(), returns updated state
POST   /fleet/stop         — userFleet.stop(), returns updated state
PUT    /fleet/mode         — { mode: "dry"|"live" }, mirrors setFleetMode() logic incl. open-position guard
PUT    /fleet/bankroll     — { bankroll: number }, min 100
PUT    /fleet/quote-policy — { policy: QuotePolicy }
```

**Cat CRUD:**
```
GET    /fleet/cats         — returns cats array with live data
POST   /fleet/cats         — body: FleetCatInput, creates cat, returns new cat
                             Guards: MAX_CATS=5, allocPct sum ≤ 100, valid archetype
PUT    /fleet/cats/:slot   — { params, allocPct }, mirrors updateFleetCatConfig()
                             Handles live flatten-before-reconfigure
DELETE /fleet/cats/:slot   — mirrors removeFleetCat(), 400 if live position held
```

**Burner Key:**
```
POST   /fleet/burner        — { key: Hex }, encrypts + stores in Redis, sets on UserFleet
DELETE /fleet/burner         — removes key, forces dry mode
GET    /fleet/burner/status  — { ready: boolean, address: string | null }
```

**Markets:**
```
GET    /fleet/markets  — proxies listServerMarkets()
```

### Input Validation
Same guards as existing `fleet-runner.ts`:
- `cats.length < MAX_CATS` (5)
- `totalAlloc(cats) <= 100` after add/update
- `bankroll >= 100`
- Mode switch to "live" blocked if no burner key
- Cat removal blocked if cat has live on-chain position
- Valid archetype (one of the 6 known types)

## Files to Modify
- `server/src/index.ts` — mount fleet routes
- `server/src/engine.ts` — add methods on `UserFleet` that map to each API action (addCat, removeCat, updateCatConfig, setMode, etc.)

## Verification
- Script `server/scripts/test-api.ts`: full lifecycle — authenticate → create cat → start fleet → verify state → stop → delete cat
- Verify 6th cat returns 400
- Verify mode switch to "live" without burner returns error
- Verify cat deletion with open position returns error

## Risks
- Race conditions: two simultaneous API calls mutating the same fleet. Per-user async mutex in UserFleet (from Phase 5) handles this.
- Input validation must match the browser-side logic exactly to avoid state divergence.

## Dependencies
Phase 3 (auth middleware), Phase 5 (engine with UserFleet).
