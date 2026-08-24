# DreamCat Terminal — Session Context & Handoff

Last updated: 2026-08-24 (price chart + analysis tools completed)

## Project

DreamCat Terminal — Bloomberg-style terminal + bot fleet for DreamDEX Event Contracts (binary BTC/ETH Up/Down prediction markets) on Somnia Shannon testnet (chain 50312). Submission for the Somnia × DreamDEX Event Contracts Hackathon on DoraHacks ($5,000 USDso; submissions Aug 25 – Sep 8, 2026). Spec: `idea.md`. Agent onboarding: `AGENTS.md`.

Solo builder (anand), full-time-ish. Everything runs client-side (Somnia CORS reflects any origin). Nothing is signed; all bot activity is dry-run paper-trading. Nothing deployed.

## Current state — ALL LOCAL TESTS GREEN

| Surface | Route | Status |
|---|---|---|
| Landing (hero, live ticker tape, product shot, bento) | `/` | ✓ live-verified |
| Terminal (discovery, book ladder, pressure ribbon, tape, chart) | `/terminal` | ✓ live-verified |
| Strategy Lab (3 cat personas, sliders, dry-run vs live book) | `/lab` | ✓ live-verified (engine opened real paper trades) |
| Fleet Deck (up to 5 cats, capital allocation, sparklines, localStorage persist) | `/fleet` | ✓ live-verified (2 cats ran concurrently) |
| Leaderboard (Upstash REST or in-memory fallback, one-click clone→fleet) | `/leaderboard` | ✓ curl-verified in local mode |
| Intel Hub (CoinDesk news + sentiment, Binance whale WS, Polymarket cross-venue) | `/intel` | ✓ live-verified (news + whales live; Polymarket degrades locally) |

- `npm run lint` ✓ · `npm run build` ✓ · `npx tsx scripts/test-engine.ts` ✓ · `cd contracts && ~/.foundry/bin/forge test` → 14/14 ✓
- All 5 routes return 200 on dev server (port 3111).
- Leaderboard verified end-to-end locally: POST publishes, GET returns ranked entries, mode = "local" (Upstash env not set yet).
- Registry contract: built + tested, **NOT deployed** (no funded key — deploy command in `contracts/README.md`).

## Build history (what happened, in order)

1. **Spike** (`scripts/spike.ts`): proved live testnet data via `SomniaMarkets` class — 557 markets, 12 live binary windows, real order books. Answered the critical unknown: `TraderConfig` accepts `walletClient` (browser wallet) OR privateKey → in-browser signing viable.
2. **Terminal v1**: market discovery (volume-sorted, top-10 + see-all), detail rail (YES book ladder, pressure ribbon = bid/ask depth split, stats). Design system generated via UI-UX-Pro-Max → `design-system/dreamcat-terminal/MASTER.md` (dark slate + amber #f59e0b, Inter + JetBrains Mono via `.num` class, double-bezel panels).
3. **Live WS tail**: replaced book polling with `watchBook`/`watchFills` pump-loops (ccxt-style `await` loops over SDK watches); tape restored with real prints.
4. **Strategy engine** (`lib/strategy.ts`): pure `stepSim(config, state, book, fills, now)`; archetypes = maker (Whiskers, imbalance entry), momentum (Pounce, tape-skew), fade (Luna, fade buy-skew via NO side); exits = TP/SL/time-stop/tape-flip (YES only). Self-check suite: `scripts/test-engine.ts`.
5. **Strategy Lab** (`/lab`): persona cards + 6 sliders + start/stop dry-run + position card + equity + log.
6. **Fleet Deck** (`/fleet`): `lib/fleet.ts` orchestrator, ≤5 cats, capital % (≤100 total), per-cat equity sparklines, bankroll scaling, localStorage persistence (`dreamcat-fleet-v1`), publish (⇪) per card.
7. **Leaderboard**: `/api/leaderboard` (GET top-20, POST publish w/ validation) + `lib/store.ts` (Upstash REST via plain fetch — no SDK dep — or in-memory fallback). Clone button writes `dreamcat-pending-clone` to localStorage; FleetDeck consumes it on mount and deploys the cloned config.
8. **Intel Hub** (`/intel`): `/api/news` (CryptoPanic if `CRYPTOPANIC_TOKEN`, else CoinDesk RSS regex-parsed; keyword sentiment lexicon), Binance aggTrade WS filtered (BTC >$50k, ETH >$25k), `/api/polymarket` (gamma API, BTC/ETH filter — geo-blocked from this box, graceful empty state).
9. **Registry contract** (`contracts/`): permissionless composite-market registry (register/unregister/enumerate, deterministic ids, legs = bytes32 DreamDEX marketIds, 2..10 legs). Foundry, 14 tests incl. fuzz. Deploy script reads `PRIVATE_KEY`. Built by subagent.
10. **Docs**: `README.md` rewritten (feature tour, architecture, quickstart, verification table); `docs/sdk-feedback.md` (7 code-referenced sharp edges — the optional submission item organizers reward).

## Key technical discoveries (do NOT rediscover — full list in AGENTS.md)

- **SDK dual surface**: class (`SomniaMarkets`) has loadMarkets/fetchOrderBook/watchOrderBook/watchTrades/fetchPrice/watchPrice; `createClient` (ESM-only) adds getLiveFills/fetchPriceCandles/watchMarket. CJS require exposes ONLY the class. Next.js bundles ESM fine — `createClient` importable in app code.
- **Price feed**: `SOMNIA_TESTNET_PRICE_FEED` must come from root import (`@somnia-chain/markets-sdk`), NOT `./config` (not in exports map — exports: `.`, `./react`, `./chains`, `./reactivity`, `./native`). Pass `priceFeed:` in client config. Endpoint: `https://price-feed.dev.oracle.somnia.host/v1/graphql`.
- `info.lastPrice` raw-scaled ÷1e6 (testnet tUSDC); book prices human. BigInt breaks JSON.stringify.
- `fetchTrades` returns [] for binary outcome symbols — use `watchTrades` (`UnifiedTrade[]`: id/price/amount/side/timestamp).
- Venue IDs churn — always read from live market rows.
- **React-hooks compiler lint** (build fails): no sync setState in effect bodies (use `setTimeout(fn, 0)` kick or subscription callbacks); no Date.now() in render (`lib/use-now.ts`); no ref reads/writes during render (state+ref mirror pattern, see FleetDeck); mount-gate time-derived text.
- Strategy bug fixed: fade archetype's tape-flip exit fired on its own entry condition → churned 24 trades/45s. NO-side exits now: TP/SL/time-stop only. Regression-tested.

## BTC/ETH price chart + analysis tools — ✅ COMPLETED

Shipped: `lib/prices.ts` (native M1/H1/D1 via `exchange.client.fetchPriceCandles` — createClient fn unreachable from package root, access through class instance; 5m/15m client-aggregated from M1; `watchSpot` pump-loop) + `components/PriceChart.tsx` (KLineChart v10, candlesticks + tick volume, BTC/ETH toggle, 1m/5m/15m/1h/1d, live last-candle updates, change badge) embedded at top of Terminal `/`. The chart adds trend/ray/channel lines, horizontal levels, Fibonacci retracement, candle magnet mode, MA/EMA/RSI studies, undo/clear, live recentering, PNG snapshots, and drawing persistence per asset/timeframe. KLineChart must stay dynamically imported inside the mount effect because its ESM bundle reads `window` at module evaluation time. Lint+build green; trend drawing and reload persistence browser-verified. Spike: `scripts/px-spike.mts` (working — live BTC spot + candles).

Bloomberg features researched for future iterations: command palette (mnemonic-style), ECO economic calendar, Launchpad multi-panel workspaces, RSI/Bollinger studies, multi-instrument compare charts, IB chat (skip), Excel hooks (skip).

## Not started / backlog

- Deploy: Upstash creds → `.env.local`; funded testnet key → deploy Registry (`cd contracts && forge script script/Deploy.s.sol --rpc-url https://dream-rpc.somnia.network --chain 50312 --broadcast`); Vercel deploy (Polymarket route comes alive there); wire `/intel` + terminal to deployed registry address once known.
- Demo video (2–3 min) + optional presentation deck.
- Live (signed) trading mode — TraderConfig walletClient path proven, UI deliberately dry-run only.
- Backtest stage for Strategy Lab (idea.md promises two-stage sandbox; dry-run shipped, historical replay not).
- Divergence card: match Polymarket questions ↔ DreamDEX windows (stretch).

## Verification workflow (always)

1. `npm run lint && npm run build`
2. Dev server on 3111 → playwright screenshot (`--channel=chrome`) → READ the png → iterate
3. `npx tsx scripts/test-engine.ts` after touching `lib/strategy.ts`
4. `forge test` after touching `contracts/`

## Environment quirks (this box)

- Playwright CLI works with `--channel=chrome` (system Chrome at /usr/bin/google-chrome; no bundled chromium).
- Polymarket gamma/clob/data-api: all timeout (000) from here — geo/network blocked. Binance ✓, CoinDesk RSS ✓ (308 → follow redirects), Somnia ✓, CryptoPanic 404 without token.
- Subagent (Task tool) provider failed twice mid-session ("Upstream request failed") — Intel Hub was built directly instead. Retry if needed but have a fallback.
- Dev server convention: `npm run dev -- --port 3111` (already running as of handoff).
