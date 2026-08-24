<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# DreamCat Terminal — Agent Guide

Bloomberg-style terminal + bot fleet for DreamDEX Event Contracts (binary BTC/ETH prediction markets) on Somnia Shannon testnet. Entry for the Somnia × DreamDEX Event Contracts Hackathon. Full spec: `idea.md`. Session history: `context.md`.

## Commands

```bash
npm run dev -- --port 3111   # dev server (hot reload)
npm run lint                 # eslint — MUST pass, includes react-hooks compiler rules
npm run build                # next build — MUST pass
npx tsx scripts/test-engine.ts          # strategy engine self-checks
cd contracts && ~/.foundry/bin/forge test   # registry contract (14 tests)
```

Visual verification pattern (dev server must be running):
```bash
npx playwright@1.62.1 screenshot --channel=chrome --wait-for-timeout=10000 "http://localhost:3111/<route>" /tmp/opencode/shot.png
# then READ the png and iterate on what you see
```

## Hard lint rules (react-hooks compiler — build FAILS on violations)

1. **No synchronous setState in effect bodies.** Kick initial fetches with `const kick = setTimeout(fn, 0)` (clear in cleanup), or setState from interval/subscription/WS callbacks only.
2. **No `Date.now()`/`Math.random()` during render.** Use the `useNow()` hook in `lib/use-now.ts`.
3. **No ref reads/writes during render.** Refs only inside callbacks, effects, intervals. If render needs data that lives in a ref, mirror it into state (see `components/FleetDeck.tsx`: `liveData` state + `liveRef` mirror pattern).
4. **Time-derived text (clocks, ages, countdowns) must be mount-gated** (`setTimeout(() => setMounted(true), 0)` pattern) or derived from `useNow()` — otherwise hydration mismatches.

## Code style

- NO comments in code. Minimal deps — never add an npm package without strong justification.
- Design system: `design-system/dreamcat-terminal/MASTER.md` + tokens in `app/globals.css`. Dark slate `bg-background`/`bg-panel`/`bg-panel-raised`, hairline `border-hairline` (white/6%), single accent `text-amber`, semantics `text-up`/`text-down`, muted `text-muted`. ALL numerals use className `num` (JetBrains Mono tabular). Panels = double-bezel: outer `rounded-xl border border-hairline bg-panel p-1.5` + inner `rounded-lg bg-panel-raised`. Motion via `ease-terminal` class, transform/opacity only.

## markets-sdk sharp edges (v0.28.1) — full report in docs/sdk-feedback.md

- **Two client surfaces**: `new SomniaMarkets(config)` (class — loadMarkets, fetchOrderBook, watchOrderBook, watchTrades, fetchPrice, watchPrice, trader) vs `createClient(config)` (ESM-only, adds getLiveFills, fetchPriceCandles, watchMarket). CJS `require` exposes ONLY the class. Next.js bundles ESM fine.
- Price feed config: import `SOMNIA_TESTNET_PRICE_FEED` from the **root package** (`@somnia-chain/markets-sdk`), NOT `./config` (not in exports map). Pass as `priceFeed:` in client config. `fetchPriceCandles(asset, "1m", {limit})` exists only on createClient surface (unverified — spike interrupted).
- Endpoints (testnet): indexer `https://dev.smk.somnia.host/v1/graphql`, WS `wss://api.infra.testnet.somnia.network/ws`, RPC `https://api.infra.testnet.somnia.network`. CORS reflects any origin — everything runs client-side safely. Venue IDs churn: read dynamically from market rows, never hardcode.
- `info.lastPrice` is raw-scaled (÷1e6 on testnet tUSDC venues); book prices are human units. BigInt fields crash JSON.stringify — use a replacer.
- `fetchTrades` returns [] for binary outcome symbols (indexer doesn't index them) — use `watchTrades` (returns `UnifiedTrade[]`: id/price/amount/side/timestamp).
- Market rows: `m.type === "binary"`, narrow `m.info` with `isBinaryMarket(m.info)`; parse `m.base` (`BTC-7750715-23AUG26-1343` → asset/strike/window; strike 0 = "above open"). `info.question` is human-readable.
- Lifecycle: only status `Trading` (1) accepts orders. Winnings must be CLAIMED, not auto-received.

## Architecture map

- `lib/dreamdex.ts` — SDK wrapper: `listLiveMarkets()` (5s-pollable), `watchBook`/`watchFills` (WS pump-loops returning cancel fns), types. Client singleton.
- `lib/strategy.ts` — pure engine: `stepSim(config, state, book, fills, now)`; 3 archetypes (maker/momentum/fade) as persona templates. NO network I/O.
- `lib/fleet.ts` — fleet orchestrator over stepSim (capital weighting, equity history).
- `lib/store.ts` — leaderboard: Upstash REST via plain fetch when env set, else in-memory fallback (`storeMode`).
- `lib/prices.ts` — BTC/ETH spot: `fetchCandles(asset, tf)` (native M1/H1/D1, 5m/15m client-aggregated from M1), `watchSpot` pump-loop, `bucketStartFor`. Uses `priceFeed: SOMNIA_TESTNET_PRICE_FEED` config; candles via `exchange.client.fetchPriceCandles` (createClient fn is NOT exported from package root — access the client through the class instance).
- `components/PriceChart.tsx` — KLineChart v10 canvas with live candles, volume, MA/RSI, trend/level/Fibonacci overlays, magnet mode, snapshots, and local drawing persistence. Keep `klinecharts` as a dynamic import inside the mount effect; its module evaluates `window` and cannot be imported at runtime during SSR.
- `lib/use-now.ts` — shared clock hook.
- `app/` routes: `/` landing page (hero + live ticker tape + product shot + bento; `components/landing/*`), `/terminal` Terminal (incl. PriceChart), `/lab` Strategy Lab, `/fleet` Fleet Deck, `/leaderboard`, `/intel` Intel Hub. API routes: `/api/leaderboard`, `/api/news`, `/api/polymarket`.
- `components/` — one client component per route (Terminal, StrategyLab, FleetDeck, Leaderboard, IntelHub).
- `contracts/` — Foundry registry (3rd-party composite markets), 14 tests pass, NOT deployed (no funded key; deploy cmd in contracts/README.md).
- `scripts/` — spike + verification scripts (tsx).

## Environment

- `.env.local` (gitignored): `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (optional — fallback = local demo store), `CRYPTOPANIC_TOKEN` (optional — fallback = CoinDesk RSS), `NEXT_PUBLIC_INDEXER_URL`/`NEXT_PUBLIC_WS_RPC_URL` overrides. Template: `.env.local.example`.
- External reachability from this box: Somnia indexer/WS ✓, Binance ✓, CoinDesk RSS ✓ (follows redirect), Polymarket gamma API ✗ (geo-blocked locally; works from Vercel — route degrades gracefully), CryptoPanic 404 without token.
- Dev server convention: port 3111.

## Known open work

- Deploy checklist (Upstash creds, registry deploy, Vercel, demo video) — bottom of `idea.md` and `context.md`.
- Backtest stage for Strategy Lab (two-stage sandbox: dry-run shipped, historical replay not).
