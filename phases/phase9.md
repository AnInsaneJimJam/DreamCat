# Phase 9: FleetDeck UI Integration

## Goal
FleetDeck seamlessly switches between local `fleet-runner.ts` and server `fleet-client.ts` based on auth state. Unauthenticated users keep the existing browser-only experience.

## Files to Create

### `lib/fleet-bridge.ts` (`"use client"`)
Abstraction layer that delegates to local or server:

```ts
// Module state
let source: "local" | "server" = "local"
let serverConnection: FleetServerConnection | null = null

// useSyncExternalStore interface
subscribeFleetBridge(listener): () => void
  — delegates to subscribeFleet (local) or serverConnection.subscribe (server)

getFleetBridgeState(): FleetRunnerState
  — delegates to getFleetState (local) or serverConnection.getSnapshot (server)

getFleetBridgeServerState(): FleetRunnerState
  — always returns INITIAL_STATE (for SSR)
```

Action dispatchers:
```
bridgeSetFleetRunning(running)         — local: setFleetRunning() / server: serverSetFleetRunning()
bridgeSetFleetMode(mode)               — local: setFleetMode() / server: serverSetFleetMode()
bridgeSetFleetBankroll(bankroll)        — local: setFleetBankroll() / server: serverSetFleetBankroll()
bridgeUpdateFleetCats(updater)         — local: updateFleetCats() / server: derives result, sends to server
bridgeUpdateFleetCatConfig(slot,p,a)   — local: updateFleetCatConfig() / server: serverUpdateCatConfig()
bridgeRemoveFleetCat(slot)             — local: removeFleetCat() / server: serverRemoveCat()
bridgeSetQuotePolicy(policy)           — local: setQuotePolicy() / server: serverSetQuotePolicy()
bridgeAddCat(input)                    — local: updateFleetCats(add) / server: serverAddCat()
bridgeHydrateFleet()                   — local: hydrateFleet() / server: connect()
```

Connection management:
```
connectServerFleet(sessionId): Promise<void>
  — creates FleetServerConnection, connects, switches source to "server"
  — stops local fleet runner if running (no double-ticking)

disconnectServerFleet(): void
  — switches source to "local", disconnects server, hydrates local state

isServerMode(): boolean
getConnectionStatus(): "local" | "connected" | "reconnecting" | "error"
```

## Files to Modify

### `components/FleetDeck.tsx`
Changes:
1. Replace imports: `fleet-runner` → `fleet-bridge`
2. Replace `useSyncExternalStore` call:
   ```ts
   // Before:
   useSyncExternalStore(subscribeFleet, getFleetState, getFleetServerState)
   // After:
   useSyncExternalStore(subscribeFleetBridge, getFleetBridgeState, getFleetBridgeServerState)
   ```
3. Replace all action calls with bridge equivalents
4. Add "Connect to Server" button in the fleet header area:
   - When disconnected: shows "Connect to Server" button
   - Clicking triggers wallet signature flow via `authenticateFleetServer()`
   - On success: calls `connectServerFleet(sessionId)`
5. Add connection status indicator:
   - Local mode: subtle "Local" badge
   - Server connected: "Server" badge (green) + uptime
   - Reconnecting: "Reconnecting..." (amber)
   - Error: "Server unreachable" (red) + "Switch to local" link
6. Market polling `useEffect`: in server mode, markets come from SSE stream — skip the local poller
7. `hydrateFleet` → `bridgeHydrateFleet()` in the mount effect
8. On page load: check `restoreFleetSession()` — if valid, auto-connect to server

### `components/BurnerPanel.tsx` (if separate, else inline in FleetDeck)
- When server-connected: add "Send key to server" button that encrypts + sends burner key
- Show indicator that server holds the key

## Design Tokens
Connection status uses existing design system:
- Local: `text-muted` + `border-hairline`
- Connected: `text-up` (green)
- Reconnecting: `text-amber`
- Error: `text-down` (red)

## Verification
- Load FleetDeck without auth → behaves exactly as before (local mode, localStorage)
- Click "Connect to Server" → wallet popup → sign → fleet state loads from server
- Add a cat via UI → appears on server (verify via `curl /fleet`)
- Start fleet → ticks on server → close browser tab → reopen → fleet still running with updated equity
- Click "Disconnect" → reverts to local mode
- Kill Railway server → UI shows "Server unreachable" → click "Switch to local" → works locally

## Risks
- Bridge wraps sync local calls in microtasks to match async server calls. Keep the API consistent.
- Default to local mode on page load. Server mode only after explicit user action or successful session restore.
- Race between local hydration and server connection: `bridgeHydrateFleet()` checks for stored session first, falls back to local.

## Dependencies
Phase 8 (fleet-client.ts, fleet-auth.ts).
