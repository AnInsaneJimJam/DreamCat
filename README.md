# DreamCat Terminal

> Bloomberg-style terminal, strategy lab, and multi-bot fleet for DreamDEX Event Contracts on Somnia.

```text
Somnia x DreamDEX Event Contracts Hackathon | Somnia Shannon testnet (50312)
status: hackathon prototype | trading mode: dry-run / paper only | license: MIT
```

DreamDEX's binary event contracts (BTC/ETH Up/Down windows) are trader-oriented instruments, but the raw surfaces an integrator gets — an indexer, a WebSocket, a set of contracts — don't show flow the way a trader needs to see it, and there is no safe way to test a strategy before committing capital. DreamCat Terminal makes these markets observable (live book depth, tape, order-flow pressure, time-to-market countdowns), testable (a parameterized dry-run engine against the live book), and multi-agent (deploy up to five concurrent strategy personas with capital allocation and a public leaderboard). For the venue, that is tooling that grows volume and third-party developer adoption on the same rails.

This is a hackathon prototype: everything runs on Somnia Shannon testnet against test USDC, every strategy is a dry-run, and no transaction is ever signed or broadcast.

## Feature tour

### `/` Terminal
- Live discovery of every active DreamDEX binary window via `@somnia-chain/markets-sdk`: top-10 by quote volume with a see-all toggle, refreshed every 5 seconds; venue IDs are read dynamically from market rows, never hardcoded.
- Live BTC/ETH candlestick analysis with five timeframes, tick volume, MA/EMA/RSI studies, trend/ray/channel lines, horizontal levels, Fibonacci retracement, candle snapping, saved drawings, and PNG snapshots.
- Per-market detail rail: YES order book depth ladder, bid/ask pressure ribbon computed from resting depth, recent prints tape, and time-to-market countdowns — all streamed over WebSocket watches (`watchOrderBook` / `watchTrades`).
- Connection indicator and UTC clock in the header; graceful "connecting"/"scanning" states when the indexer or socket is unavailable.

### `/lab` Strategy Lab
- Pick a cat persona — Whiskers the maker, Pounce the momentum, Luna the fade — and tune six parameters (entry signal, order size, take profit, stop loss, tape lookback, time stop) with sliders.
- Run a dry-run against the live book: the engine is a pure reducer, `stepSim(config, state, book, fills, now)` (lib/strategy.ts), stepped once per second off real WebSocket snapshots. Paper trades only.
- Live position card, marked equity in tUSDC, win/loss tally, and a color-coded open/close log. Nothing is signed.

### `/fleet` Fleet Deck
- Deploy up to 5 cats concurrently, each on its own market window, with a capital allocation percentage per cat (total capped at 100% of a configurable bankroll).
- Per-cat equity sparklines, aggregate fleet stats (equity, trades, W/L, open positions), start/stop all from the header.
- Fleet config persists in `localStorage`; any cat's result can be published to the shared leaderboard with one click.

### `/leaderboard` Leaderboard
- Ranked published runs (PnL, trades, win rate, market, age). Backed by Upstash Redis when credentials are set; otherwise a local in-memory demo store, labeled in the UI.
- One-click **Clone** drops a published config into your Fleet Deck with a fresh slot — review allocation before deploying.

### `/intel` Intel Hub
- Crypto news feed with bullish/bearish/flat sentiment badges from a keyword lexicon (CryptoPanic free tier when `CRYPTOPANIC_TOKEN` is set, CoinDesk RSS fallback).
- Whale radar: large BTC/ETH prints from Binance's public `aggTrade` stream with a size threshold filter — presented as off-chain context only, clearly separated from on-chain DEX data.
- Cross-venue sentiment: top Polymarket crypto markets with prices, for eyeballing probability divergence against equivalent DreamDEX windows.

## Architecture

```text
browser (Next.js App Router, React client components)
|
|-- Terminal / Lab / Fleet ---- lib/dreamdex.ts --+-- loadMarkets(true) ---> indexer GraphQL
|   (market grid, books,                          |   (polled every 5-10 s)  dev.smk.somnia.host
|    tapes, sim feeds)                            |
|                                                 +-- watchBook/watchFills -> WebSocket RPC
|                                                     wrap watchOrderBook /   api.infra.testnet.
|                                                     watchTrades with a      somnia.network/ws
|                                                     reconnect loop
|
|-- lib/strategy.ts   stepSim(): pure reducer (config, state, book, fills, now) -> next state
|-- lib/fleet.ts      tickFleet(): <=5 cats x stepSim, equity curves, aggregate summary
|
|-- /leaderboard ----- app/api/leaderboard -- lib/store.ts --+--> Upstash Redis REST (ZSET)
|                                                            +--> in-memory fallback
|
+-- /intel ----------- app/api/news + app/api/polymarket --> CryptoPanic/CoinDesk RSS,
    (whale radar connects to Binance aggTrade WS directly from the browser)
```

Stack:

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- `@somnia-chain/markets-sdk` 0.28.1 (discovery, books, trade streams) + `viem`
- Upstash Redis REST API for the shared leaderboard (optional)
- Playwright (dev-only, headless verification of the Lab and Fleet surfaces)

## Quickstart

Prerequisites: Node.js 22+. No Python, no wallets, no on-chain funds — the app is read-plus-simulate only.

```bash
npm install
cp .env.local.example .env.local   # optional; see below
npm run dev
```

Open http://localhost:3000.

Environment variables (all optional):

| Variable | Required | Purpose |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | No | Shared leaderboard store (Upstash Redis free tier). Without them, `/leaderboard` runs in local demo mode backed by server memory. |
| `CRYPTOPANIC_TOKEN` | No | CryptoPanic free-tier token for the Intel Hub news feed. Add it to `.env.local` yourself; without it the feed falls back to CoinDesk's public RSS. |
| `NEXT_PUBLIC_INDEXER_URL` / `NEXT_PUBLIC_WS_RPC_URL` | No | Overrides for the DreamDEX indexer GraphQL endpoint and Somnia WebSocket RPC. Defaults for Shannon testnet are baked in. |

Routes:

| Route | Surface |
|---|---|
| `/` | Terminal — market discovery, book ladder, tape, flow pressure |
| `/lab` | Strategy Lab — persona presets, parameter sliders, live-book dry-run |
| `/fleet` | Fleet Deck — up to 5 concurrent cats, allocations, sparklines, publish |
| `/leaderboard` | Published runs ranked by PnL, one-click clone into your fleet |
| `/intel` | News, whale radar, cross-venue (Polymarket) odds |

## Verification scripts

Run with `npx tsx scripts/<name>.ts`. The two Playwright scripts expect the dev server on port 3111 (e.g. `npx next dev -p 3111`).

| Script | What it proves |
|---|---|
| `scripts/spike.ts` | The SDK integration path end-to-end from Node: loads all markets from the Shannon indexer, filters live binary windows with `isBinaryMarket`, prints outcome symbols, and fetches one order book. This was our day-one proof that the browser-free data path works. |
| `scripts/test-engine.ts` | Strategy-engine correctness on synthetic books/fills: momentum opens YES on buy skew, holds without exit conditions, closes at take-profit with correct PnL accounting; fade opens NO against skew and exits on time-stop; no entry without signal. All assertions must pass. |
| `scripts/verify-lab.ts` | Headless Chrome drives `/lab`: selects a market, starts a dry-run, waits 50 s, and dumps the log panel — proves the sim consumes real live-book updates in the browser, not fixtures. |
| `scripts/verify-fleet.ts` | Headless Chrome deploys two cats on different windows, starts the fleet, waits 45 s, and dumps header stats and card contents — proves multi-cat concurrent watching and per-cat equity ticking work against live markets. |
| `scripts/verify-wallet.ts` | Headless Chrome with an injected mock EIP-6963 wallet: connects from a foreign chain (asserts the app requests `wallet_switchEthereumChain` and adds Somnia Shannon on 4902), restores the session after a reload, surfaces and clears the wrong-network prompt on `chainChanged`, drops the session on wallet lock, and connects through a legacy `window.ethereum` provider. |
| `scripts/verify-fleet-runner.ts` | Headless Chrome proves the fleet runner outlives the route: deploys a cat, navigates to `/board` and back, and asserts the fleet is still Running with its cat intact; that the run state survives a full page reload; that Stop pauses it; and that a stale open paper position seeded into `localStorage` is cleared on reload and reported to the trader. |

## DreamDEX integration notes

SDK surfaces used (all via `new SomniaMarkets({ indexerUrl, chain: somniaShannon, wsRpcUrl })`, constructed once in lib/dreamdex.ts):

- `loadMarkets(true)` — full market discovery, re-fetched on an interval; filtered to `active && type === "binary"` and narrowed with `isBinaryMarket(m.info)`.
- `fetchOrderBook(symbol, limit)` and `watchOrderBook(symbol, limit)` — depth ladders and the imbalance ribbon.
- `watchTrades(symbol, limit)` — the prints tape and the tape-skew signal.
- `somniaShannon` from the `/chains` subpath; outcome symbols (`yesSymbol`) are taken verbatim from market rows and keyed by `info.marketId`, never pool address.

For future live trading, the SDK's trader accepts a `TraderConfig.walletClient` — i.e. a browser wallet over an injected provider — which is the path we'd take the fleet runner from dry-run to signed orders without changing the UI.

Protocol facts we honor:

- On-chain status gating: only markets reporting `status === "Trading"` are listed or tradable in the terminal, re-checked on every 5-second poll rather than trusted from stale state.
- Winnings are claimed, not auto-received: irrelevant to v1 (nothing settles in a dry-run), but designed into the fleet runner spec for live mode — settled positions get swept each loop.
- Tick-grid pricing: the simulation works in human-unit probabilities (0–1) internally; since v1 signs nothing, no float ever reaches an 18-decimal venue. Live mode would convert through integer ticks at the edge.
- Venue IDs churn across redeploys and networks, so nothing venue-related is hardcoded; state is keyed by `marketId` and symbols come from the live rows.

## Hackathon submission checklist

| Item | Status |
|---|---|
| Working prototype on Somnia testnet | Done — all five surfaces live against Shannon (50312) |
| Public repo + README explaining Event Contracts / SDK usage | Done — this file, plus integration notes above |
| Demo video (2–3 min) | TBD |
| SDK/docs feedback report (optional item) | Done — [docs/sdk-feedback.md](docs/sdk-feedback.md) |

## License

MIT.
