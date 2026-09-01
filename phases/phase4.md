# Phase 4: Server-Side SDK Client & Market Data

## Goal
Server-compatible fork of `dreamdex.ts` that creates SDK instances, manages persistent WebSocket subscriptions for order books and fills, and shares subscriptions across users via ref-counting.

## Files to Create

### `server/src/sdk.ts`
Fork of `lib/dreamdex.ts` — same logic, removes `"use client"`, removes `/api/markets` fetch path.

```
getServerClient(): SomniaMarkets        — lazy singleton, same config
ensureServerRegistry(): Promise<void>    — 30s cache / 5min full reload (same TTL pattern)
fetchServerBook(yesSymbol): Promise<BookSnapshot>  — one-shot book fetch
watchServerBook(yesSymbol, onBook, market?): () => void  — WS pump loop (or 2s poll for chain-pool)
watchServerFills(yesSymbol, onFills): () => void   — WS pump loop
listServerMarkets(): Promise<LiveMarketRow[]>      — direct SDK call (no /api proxy)
```

Re-exports `BookSnapshot`, `Fill`, `LiveMarketRow`, `snapshotFrom`.

### `server/src/market-data.ts`
Shared subscription manager — deduplicates WS connections when multiple users watch the same market.

```ts
interface MarketSubscription {
  marketId: string
  yesSymbol: string
  book: BookSnapshot
  fills: Fill[]
  subscribers: Set<string>    // wallet addresses
  stopBook: () => void
  stopFills: () => void
}
```

Functions:
```
subscribeMarket(marketId, yesSymbol, userId): void    — ref-counted; first subscriber creates WS
unsubscribeMarket(marketId, userId): void              — last subscriber tears down WS
getMarketData(marketId): { book, fills } | null
onMarketUpdate(cb: (marketId, book, fills) => void): () => void  — event emitter for tick/SSE
getActiveSubscriptionCount(): number                   — for health endpoint
```

### `server/src/spot-data.ts`
Server-side spot prices + sigma, adapted from `lib/prices.ts` and `lib/market-context.ts`.

```
acquireServerAsset(asset: string): () => void          — ref-counted spot feed
getServerAssetStats(asset): { spot, spotPrev, sigma }
buildServerMarketContext(row: LiveMarketRow): MarketContext | undefined
```

Uses the same Binance REST endpoints (`/api/v3/ticker/price`, `/api/v3/klines`) that the browser version uses via `lib/prices.ts`. No WS needed — poll every 2s per asset (only BTC/ETH).

## Files to Modify
- `server/src/index.ts` — add `GET /api/markets` route calling `listServerMarkets()`

## Verification
- `curl localhost:4000/api/markets` returns the same market list as Vercel's `/api/markets`
- Script: subscribe to a market, log book updates for 10s, unsubscribe, verify WS teardown
- Two subscriptions to the same market share one WS connection (check subscription count)

## Risks
- SDK's `watchOrderBook` may use browser `WebSocket`. If Node.js version lacks native WS, add `globalThis.WebSocket = require('ws')` polyfill in `server/src/index.ts` before any SDK import.
- Memory: cap fills array at 20 per subscription (same as `dreamdex.ts`'s `watchTrades(sym, 20)`).
- Long-running WS connections may drop — the existing retry loops in the pump patterns handle this.

## Dependencies
Phase 1 (server scaffold).
