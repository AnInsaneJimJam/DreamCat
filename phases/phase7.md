# Phase 7: Live State Streaming (SSE)

## Goal
Server-Sent Events endpoint that pushes fleet state changes to connected clients in real time, replacing `useSyncExternalStore`'s local state source.

## Why SSE over WebSocket
- Unidirectional (server→client) — control commands go through REST (Phase 6)
- HTTP-native, auto-reconnect via browser `EventSource` API
- No additional library needed (Hono has built-in `streamSSE` helper)
- Simpler than managing bidirectional WS state

## Files to Create

### `server/src/routes/stream.ts`
SSE endpoint:
```
GET /fleet/stream  — requires auth, returns text/event-stream
```

Behavior:
1. On connect: send full state as `event: state`
2. On each tick (1s): send `event: tick` with `{ cats, live }` (the changing parts)
3. On fleet config change: send `event: config` with `{ running, mode, bankroll, quotePolicy }`
4. Heartbeat every 15s: `event: ping` (keeps connection alive through proxies)
5. On server shutdown: send `event: shutdown` before closing

Event format:
```
event: state
data: {"cats":[...],"running":true,"mode":"dry","bankroll":1000,"live":{...}}

event: tick
data: {"cats":[...],"live":{"0":{"book":{...},"fills":[...]}}}

event: ping
data: {}
```

### `server/src/sse.ts`
SSE connection manager:
```
SseConnection class:
  - wraps Hono's streamSSE writer
  - handles JSON serialization
  - manages heartbeat timer
  - cleanup on disconnect

SseTracker:
  - tracks connected clients per wallet address
  - max 3 connections per user
  - exposes listenerCount(address) for idle-check in FleetManager
```

## Files to Modify
- `server/src/index.ts` — mount stream route
- `server/src/engine.ts` — `UserFleet.tick()` calls `emit()` after each tick, which notifies all registered `onChange` listeners (SSE connections)

## Headers
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no    — prevents Railway's proxy from buffering
```

## Verification
- `curl -N localhost:4000/fleet/stream -H "Authorization: Bearer {token}"` — verify events arrive every tick
- Start/stop fleet via REST — stream reflects the change immediately
- Disconnect client — fleet keeps running (no teardown), reconnecting shows current state
- Open 4 connections — 4th rejected with 429

## Risks
- Railway's reverse proxy may buffer SSE chunks. `X-Accel-Buffering: no` header should prevent this.
- Memory: each SSE connection holds a reference. Max 3 per user caps this.
- Long-lived HTTP connections: Railway keeps connections alive by default on the starter plan.

## Dependencies
Phase 5 (engine with onChange), Phase 6 (fleet API for testing).
