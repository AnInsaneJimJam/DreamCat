# Phase 8: Client-Side Bridge (`fleet-client.ts`)

## Goal
A new client module that talks to the Railway server (REST + SSE) and exposes the same interface as `fleet-runner.ts`, so FleetDeck can switch between local and server mode transparently.

## Files to Create

### `lib/fleet-client.ts` (`"use client"`)
Server connection manager:

```ts
class FleetServerConnection {
  constructor(baseUrl: string, sessionId: string)

  connect(): Promise<void>       — opens EventSource to /fleet/stream, processes events into local state
  disconnect(): void             — closes EventSource
  isConnected(): boolean

  // useSyncExternalStore interface (same shape as fleet-runner.ts)
  subscribe(listener: () => void): () => void
  getSnapshot(): FleetRunnerState
}
```

REST wrappers (all call Railway server):
```
serverSetFleetRunning(running): Promise<void>
serverSetFleetMode(mode): Promise<string | null>     — returns error message or null
serverSetFleetBankroll(bankroll): Promise<void>
serverAddCat(input: FleetCatInput): Promise<FleetCat>
serverUpdateCatConfig(slot, params, allocPct): Promise<void>
serverRemoveCat(slot): Promise<string | null>         — returns error or null
serverSetQuotePolicy(policy): Promise<void>
serverSetBurnerKey(key: Hex): Promise<void>
```

Connection management:
```
fleetServerUrl(): string          — reads NEXT_PUBLIC_FLEET_SERVER_URL
storeFleetSession(id: string)     — sessionStorage
getFleetSession(): string | null  — sessionStorage
clearFleetSession(): void
```

SSE event handling:
- `state` event → full state replacement
- `tick` event → merge cats + live data into existing state
- `config` event → merge running/mode/bankroll/quotePolicy
- `ping` → no-op (keeps connection alive)
- `shutdown` → set disconnected state, EventSource auto-reconnects
- On EventSource `error` → reconnect with backoff (EventSource handles this natively)

### `lib/fleet-auth.ts` (`"use client"`)
Server auth flow:
```
authenticateFleetServer(signMessage: (msg: string) => Promise<Hex>, address: string): Promise<string>
  — GET /auth/nonce → sign message → POST /auth/verify → store session in sessionStorage → return sessionId

restoreFleetSession(): string | null
  — check sessionStorage for existing valid session

logoutFleetServer(): Promise<void>
  — POST /auth/logout, clear sessionStorage
```

## Files to Modify
- `.env.local.example` — add `NEXT_PUBLIC_FLEET_SERVER_URL=https://your-app.railway.app`

## Verification
- In browser console: authenticate, verify SSE events arrive
- Call `serverSetFleetRunning(true)`, verify fleet starts ticking on server and state flows back
- Close tab, reopen: `restoreFleetSession()` reconnects without re-signing
- Kill SSE connection (network tab): verify EventSource auto-reconnects

## Risks
- Dual-mode complexity handled in Phase 9 (fleet-bridge.ts). This phase just provides the server communication layer.
- `sessionStorage` means sessions don't survive tab close. User re-signs on new tab. Acceptable for hackathon.

## Dependencies
Phase 6 (fleet REST API), Phase 7 (SSE streaming).
