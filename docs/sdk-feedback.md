# SDK feedback: `@somnia-chain/markets-sdk` v0.28.1 + docs.dreamdex.io

From building DreamCat Terminal — a Somnia x DreamDEX Event Contracts Hackathon entry. Every sharp edge below is something we actually hit in this repo; file references point at our code.

## Summary

DreamCat Terminal is a browser-only Next.js app (no server-side SDK usage, no private keys): a Bloomberg-style terminal for DreamDEX binary event contracts on Somnia Shannon testnet (chain 50312), with a strategy dry-run lab, a fleet of up to five concurrent simulated bots, a leaderboard, and a cross-venue intel hub. All market data flows through `@somnia-chain/markets-sdk` 0.28.1: `loadMarkets(true)` polled every 5–10 s for discovery, and `fetchOrderBook` / `watchOrderBook` / `watchTrades` for depth and tape, wrapped in small reconnect loops in `lib/dreamdex.ts`. We deliberately stayed on one surface — the `SomniaMarkets` class — after an early detour onto the other client surface (see edge #1). We have not yet placed orders; we reviewed the trader/`TraderConfig` path (including the `walletClient` browser-signing option) for the post-hackathon live runner.

## What's excellent

- **Data-is-the-chain is real.** One indexer snapshot to hydrate, then chain events over a single WebSocket per watched symbol. No API keys, no rate-limit budgeting, no polling loops anywhere in our app — the only polling left is light market-list discovery every few seconds. A full terminal runs comfortably off one socket.
- **Typing quality on the unified structs.** `UnifiedTrade` / `UnifiedOrderBook` are documented field-by-field (human units, "local clock, not a block timestamp", taker-side semantics per outcome) and shaped like ccxt — `[price, qty][]` tuples, `side`, `timestamp`/`datetime` — so exchange muscle memory transfers directly.
- **`isBinaryMarket` type narrowing.** The `Market = SpotMarket | PerpMarket | BinaryMarket` union plus guards made our row parser (`parseRow` in lib/dreamdex.ts) a one-line narrow into everything we need (`marketId`, `poolAddress`, `status`, `question`, outcome symbols). No `any` anywhere.
- **The watch surface is pleasant.** `watchOrderBook(ref)` / `watchTrades(ref)` resolve to a fresh snapshot each time instead of exposing raw subscription callbacks, so our reconnect-with-backoff wrappers (`watchBook` / `watchFills`) are ~15 lines each, identical for book and tape.
- **Unusually honest docs.** The type docs admit real gotchas rather than hiding them — e.g. `BinaryMarket.status` warns that timestamp-implicit lifecycle transitions emit no events and should be re-derived from `tradingStart`/`expiry`, and that an empty read result means "no rows", never "request failed". That candor saved us from two bugs before we wrote them.
- **Deterministic core addresses.** The baked-in `SOMNIA_TESTNET_ADDRESSES` / `SOMNIA_MAINNET_ADDRESSES` share byte-identical core contracts across environments (marketsCore, binaryModule, clobFactory, ...), so zero-setup construction with just indexer URL + chain worked immediately.

## Sharp edges we hit

Each item: symptom → root cause → suggested fix.

### 1. Two parallel client surfaces with conflicting "single entry point" claims

**Symptom:** We lost time calling `getLiveFills` on the `SomniaMarkets` class — it doesn't exist there. The method sets genuinely differ: `createClient`'s `SomniaMarketsClient` exposes `getLiveFills`, `watchMarket`, `getMarketOnchain`; the class exposes `fetchOrderBook` / `watchOrderBook` / `watchTrades`.

**Root cause:** Two generations of API shipped side by side. The README says "`new SomniaMarkets(config)` is the single entry point"; the JSDoc on `createClient` calls it "the single entry point for all protocol I/O" with its own import example. Both cannot be canonical.

**Fix:** One documented entry point; or keep both but label them explicitly ("exchange API — current" vs "engine client — advanced/legacy") and cross-link a method-mapping table. The engine tier being reachable *through* the class (`exchange.client`) is the right idea — it just needs the standalone constructor to disappear or be clearly demoted.

### 2. `createClient` is unreachable through the package entry point

**Symptom:** Our first spike (scripts/spike.ts lineage) could not import `createClient` at all. `require("@somnia-chain/markets-sdk")` (Node 22 require-of-ESM resolves `main`/exports to `dist/index.js`) exposes `SomniaMarkets`, `SomniaMarketsError`, and helpers — but no `createClient`. It isn't exported from the root entry even for ESM consumers, and the `exports` map has no subpath that reaches `dist/createClient.js`.

**Root cause:** The dual-surface split in #1, compounded by an incomplete root barrel — the module exists in `dist` but nothing exports it along any documented path.

**Fix:** Either export `createClient` from the root index or drop it from the distribution. An exported-but-unreachable function whose own docstring shows an import that fails is worse than not shipping it.

### 3. Inconsistent price scaling between market rows and books

**Symptom:** `loadMarkets` rows carry raw-scaled stats — `lastPrice` and `cumulativeQuoteVolume` scaled by collateral decimals (1e6 on testnet tUSDC venues) — while `fetchOrderBook` / `watchOrderBook` return human-unit prices (0–1 probabilities) in the very next call of the same workflow. We divide by 1e6 in `parseRow` (lib/dreamdex.ts) while using book prices untouched a few lines below.

**Root cause:** The unified layer normalizes books/trades to human units but passes market-row stat fields through as raw decimal strings. To be fair, the field doc does say "(raw)" — it's just easy to miss when the adjacent surface already normalized for you, and the failure mode is silently-off-by-a-million numbers.

**Fix:** Normalize row stats to human units like everything else, or suffix unnormalized fields (`lastPriceRaw`) so the scale is visible at the call site. A single documented rule ("unified structs are human units everywhere") would remove the whole class of bug.

### 4. No indexed trade history for binary outcome symbols via the class

**Symptom:** `SomniaMarkets.fetchTrades(yesSymbol)` returned `[]` across every live binary window while `info.tradeCount` on the same rows showed hundreds of fills. We fell back to the live watch surface (`watchTrades`) and stopped using `fetchTrades`.

**Root cause:** Not determinable from outside — the class delegates to the engine's fills read, so either fills are indexed under a different key/symbol convention than outcome symbols, or the fills table wasn't populated for those pools. Nothing in the docs says which symbols trade history is indexed under for binaries.

**Fix:** Document the indexing convention for binary fills explicitly (or fix the lookup). If indexed history genuinely doesn't cover binaries yet, say so on the binary page and recommend the watch surface — which works well — as the sanctioned alternative.

### 5. BigInt fields break naive serialization

**Symptom:** `JSON.stringify(book)` / `JSON.stringify(marketRow)` throws `Do not know how to serialize a BigInt`. Our spike ships its own replacer (`typeof v === "bigint" ? v.toString() : v`) — and notably, the SDK's own debugging docs use the same inline replacer in their example code.

**Root cause:** Engine-tier objects carry native bigints while the indexer wire format uses decimal strings; neither guarantee is surfaced consistently to consumers.

**Fix:** Ship a canonical `toJson()` helper / replacer export, or add `toJSON()` to the objects you return. Given the SDK already documents the workaround, exporting the fix would cost almost nothing.

### 6. Venue IDs churn across redeploys and networks

**Symptom:** Venue identifiers observed during development changed across testnet redeploys and differ per network (the docs say so too). Any config keyed on venue ID would have silently broken.

**Root cause:** Venue IDs are contract-generated bytes32 values tied to deployment instances, with no stable discovery surface outside a market row itself.

**Fix:** A `GET /v1/venues`-style discovery endpoint, or bundle a refreshable venue registry (id, label, network) in the SDK. Meanwhile our mitigation — key state by `marketId`, never venue/pool, and read all venue-dependent values from live rows — is worth documenting as the recommended pattern.

### 7. Browser-vs-server safety of methods is undocumented

**Symptom:** Docs examples reach into `exchange.client.getMarketOnchain` etc. without stating which methods are safe from a browser context. We had to discover empirically whether CORS would break a fully client-side integration.

**Resolution (positive, please document it):** Everything we do runs client-side — Next.js React client components calling the indexer GraphQL endpoint and the WebSocket RPC directly from the browser — and it works: the dev indexer reflects allowed origins over CORS. Say this explicitly. A short matrix (read/watch/trade x server/browser, plus "signing requires either `privateKey` server-side or `walletClient` in-browser") would let the next hackathon team skip a day of uncertainty.

## Docs gaps & wins

**Wins**

- The honesty culture noted above: caveats where the data model is genuinely tricky (status derivation, `oracleQuestionId` nullability, empty-means-no-rows semantics).
- The market-structure documentation for binaries is superb — one book with two sides, NO as 1 − Up, opposite buyers crossing via mint-a-pair, zero-inventory quoting. It reads like it was written by someone who has traded these, and it directly shaped our simulator's NO-side pricing.
- "How the live feed works" matches observed behavior exactly: snapshot-once hydration, socket-only realtime, self-healing watches.

**Gaps**

- The event-contracts section on docs.dreamdex.io leans on HTTP API examples from the spot product that don't cover ECs at all — a reader following them finds no EC-shaped endpoints. Either give ECs their own endpoint reference or route readers to the SDK exclusively.
- No end-to-end browser quickstart: install → construct → load markets → render a live book in under ~50 lines, wallet-less. That demo is exactly what our spike became by hand.
- No mapping from docs.dreamdex.io concepts (venues, windows, ladders) to specific SDK entry points; each page assumes the other one's vocabulary.

## Closing

We'd build on this again without hesitation — the realtime architecture and typing quality put it well ahead of typical hackathon-grade SDKs, and the honest docs style deserves to be copied elsewhere. Top three asks:

1. **One entry point:** export `createClient` from the root or remove it; label the surviving surface canonical and document how it maps onto the other.
2. **Consistent units:** human-unit values everywhere in the unified layer (or visibly suffixed raw fields), so books and market rows agree by construction.
3. **Binary trade history that works:** make `fetchTrades` return the fills that `tradeCount` promises, or document the indexed-symbol convention and bless the watch surface as the official fallback.
