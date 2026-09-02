<div align="center">

<br/>

<img src="public/dreamcat.svg" alt="DreamCat Terminal" width="72" />

# DreamCat Terminal

**Bloomberg-style trading terminal, AI strategy copilot, and multi-agent bot fleet**
**for DreamDEX Event Contracts on Somnia**

Discover every live market, read order flow like a pro, design a strategy with an AI copilot, and deploy a fleet of trading cats — in dry-run or live on-chain — with a persistent server that keeps them running while you're away.

<br/>

![Chain](https://img.shields.io/badge/Somnia_Shannon-testnet_50312-6f7fd8?style=for-the-badge)
![Trading](https://img.shields.io/badge/mode-dry--run_+_live_on--chain-0e7c7b?style=for-the-badge)
![Stack](https://img.shields.io/badge/Next.js_16-React_19-000?style=for-the-badge)
![SDK](https://img.shields.io/badge/markets--sdk-0.28.1-e0a133?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)

Built for the **Somnia x DreamDEX Event Contracts Hackathon** on DoraHacks.

<br/>

[![Live Demo](https://img.shields.io/badge/▶_Live_Demo-dreamcat--somnia.vercel.app-0e7c7b?style=for-the-badge)](https://dreamcat-somnia.vercel.app)
[![Watch on YouTube](https://img.shields.io/badge/🎬_Watch_the_Demo-YouTube-ff0000?style=for-the-badge)](https://youtu.be/5kwpbkOtGr8)

<br/>

[![DreamCat demo video](https://img.youtube.com/vi/5kwpbkOtGr8/maxresdefault.jpg)](https://youtu.be/5kwpbkOtGr8)

<br/>

[Terminal](#terminal--terminal) | [Strategy Lab](#strategy-lab--lab) | [Fleet Deck](#fleet-deck--fleet) | [Leaderboard](#leaderboard--leaderboard) | [Intel Hub](#intel-hub--intel) | [Architecture](#architecture)

</div>

---

## Overview

DreamDEX's **binary event contracts** are BTC/ETH Up/Down windows that settle to $0 or $1. They are powerful instruments to trade, but the raw surfaces an integrator gets (an indexer, a WebSocket, a set of contracts) don't show flow the way a trader needs to see it, and there's no safe way to test a strategy before committing capital.

**DreamCat Terminal closes that gap:**

| | |
|---|---|
| **Observable** | Live book depth, order-flow pressure, prints tape, spot flow, whale radar, and time-to-settlement countdowns. |
| **Testable** | A parameterized dry-run engine that runs your strategy against the live book, plus an AI copilot that configures it in plain language. |
| **Tradable** | The same strategies execute real on-chain orders through a session-scoped burner wallet, with no dry-run ceiling. |
| **Persistent** | A standalone fleet server keeps your cats trading even after you close the browser, with wallet-signed auth and automatic recovery. |
| **Multi-agent** | Deploy up to five concurrent strategy personas ("cats"), each with a capital allocation, and publish results to a wallet-signed public leaderboard. |

For the venue, that is tooling that grows volume, sharpens price discovery, and pulls third-party developers onto the same rails.

> [!NOTE]
> Everything runs on **Somnia Shannon testnet** against **test USDC**. Dry-run mode signs nothing. Live mode places real testnet orders. There is no mainnet path and no custodial funds.

---

## The Fleet

Six personas, each mapped to a distinct archetype and a live data source.

| Cat | Archetype | Reads | Behavior |
|:---:|---|---|---|
| **Whiskers** | Maker | Book depth | Opens on resting-depth imbalance; exits on TP, SL, time, or tape flip. |
| **Pounce** | Momentum | Trade tape | Rides tape skew into the move. |
| **Luna** | Fade | Trade tape | Fades over-extended tape skew. |
| **Fairy** | Fair-Value | Pricing model | Prices YES from spot, strike, time, and vol; trades book vs. model edge. |
| **Theta** | Theta decay | Model plus clock | Enters late-window when spot is N-sigmas beyond strike. |
| **Mittens** | Market-Maker | Two-sided quotes | Rests bid and ask around fair value, manages inventory with requote and flatten logic. |

---

## Feature Tour

### Terminal (`/terminal`)

- **Live discovery** of every active DreamDEX binary window via the Market Universe indexer — direct GraphQL queries, on-chain log backfill, third-party registry overlay, and stale-while-revalidate caching. Top-10 by quote volume with a see-all toggle, refreshed continuously. Venue IDs are read dynamically from market rows, never hardcoded.
- Full **BTC/ETH candlestick analysis** (KLineChart v10): five timeframes (1m, 5m, 15m, 1h, 1d), tick volume, MA/EMA/RSI studies, trend, ray, and channel lines, horizontal levels, Fibonacci retracement, magnet snapping, saved drawings (per asset and timeframe), and PNG snapshots.
- Per-market detail rail: YES order-book depth ladder, a bid/ask **pressure ribbon** from resting depth, recent prints tape, and time-to-settlement countdowns, streamed over WebSocket watches.
- **Manual trading**: place limit or market YES/NO tickets directly against the live book with pool resolution, order construction, and receipt verification.
- **Burner panel**: derive, fund (collateral plus gas), inspect balances, and sweep a session wallet.

### Strategy Lab (`/lab`)

- Pick a persona, then tune the archetype's parameters with sliders, or ask the **Strategy Copilot** to configure it for you in plain language. The copilot is a guarded AI assistant via OpenRouter that explains archetypes and proposes bounded parameter changes — it never places orders or handles keys.
- Run a **dry-run** against the live book. The engine is a pure reducer, `stepSim(config, state, book, fills, now)`, stepped once per second off real WebSocket snapshots.
- Full **market context** integration: live spot prices, historical volatility (sigma from 1-minute candle returns), and open-price caching feed the fair-value and theta archetypes via reference-counted subscriptions.
- Live position card, marked equity in tUSDC, win/loss tally, and a color-coded open/close log.

### Fleet Deck (`/fleet`)

- Deploy up to **5 cats concurrently**, each on its own window, with a capital-allocation percentage per cat (capped at 100% of a configurable bankroll).
- Per-cat equity sparklines, aggregate fleet stats, and start/stop-all from the header.
- **Dry-run or live**: with a funded burner, the fleet executes real on-chain orders via the chain execution layer. The live quoting engine manages resting bid/ask orders with shadow, single, and dual quoting policies for the market-maker archetype, tracking fill confirmations and requotes.
- **Local or server mode**: in local mode, the runner lives outside the route tree as a module-level singleton so cats keep trading while you browse other pages. In server mode, connect your wallet to authenticate with the fleet server — cats keep running even after you close the browser. The UI streams state updates via SSE and automatically falls back to local mode if the server becomes unreachable (3 retries, then graceful fallback with notice).
- **Cat config modal** for detailed per-cat parameter tuning before deploy.
- Config persists in `localStorage` (local mode) or Redis (server mode), and any result can be published to the leaderboard with one click.

### Leaderboard (`/leaderboard`)

- Ranked published runs (PnL, trades, win rate, market, age). Backed by Upstash Redis (ZSET) when configured, otherwise a labeled local demo store.
- **Publish and delete are wallet-signed**. An EIP-191 signature with a nonce and 5-minute TTL proves ownership.
- One-click **Clone** drops a published config into your Fleet Deck for review before deploy.

### Intel Hub (`/intel`)

- **News** feed with bullish, bearish, and flat sentiment badges (CryptoPanic when tokened, CoinDesk RSS fallback).
- **Whale radar**: large BTC/ETH prints from Binance's public stream, clearly labeled as off-chain context.
- **Spot Flow**: rolling CVD-style buy/sell pressure across 15s, 1m, and 5m windows with real-time visualizations and flow-read interpretations (buyers lifting, sellers pressing, flow absorbed, balanced).
- **Cross-venue sentiment**: top Polymarket crypto markets for probability-divergence eyeballing against DreamDEX windows.

---

## Architecture

```
somnia/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Landing page (hero, ticker, bento)
│   ├── terminal/                 # Terminal route
│   ├── lab/                      # Strategy Lab route
│   ├── fleet/                    # Fleet Deck route
│   ├── leaderboard/              # Leaderboard route
│   ├── intel/                    # Intel Hub route
│   ├── api/                      # API routes
│   │   ├── markets/              # Cached market universe (server indexer)
│   │   ├── strategy-copilot/     # AI copilot (rate-limited, guarded prompt)
│   │   ├── leaderboard/          # Signed publish/delete (nonce + TTL)
│   │   ├── news/                 # CryptoPanic or CoinDesk RSS fallback
│   │   ├── polymarket/           # Cross-venue (geo-degrades gracefully)
│   │   └── spot-flow/            # Spot flow data endpoint
│   ├── globals.css               # Design system tokens
│   └── layout.tsx                # Root layout
│
├── server/                       # Standalone fleet server (Hono)
│   ├── src/
│   │   ├── index.ts              # App entry, routes, health check
│   │   ├── engine.ts             # Fleet manager (1s tick loop, recovery)
│   │   ├── auth.ts               # Nonce generation + signature verify
│   │   ├── sse.ts                # SSE connection manager
│   │   ├── market-data.ts        # Server-side book/trade subscriptions
│   │   ├── spot-data.ts          # Server-side spot + market context
│   │   ├── live-intent.ts        # Strategy intent derivation
│   │   ├── redis.ts              # Sessions, nonces, fleet state, burner
│   │   ├── routes/               # Auth, fleet, stream endpoints
│   │   └── middleware/           # Auth guard + rate limiting
│   ├── railway.toml              # Railway/Render deploy config
│   └── package.json
│
├── components/                   # Client components (one per route)
│   ├── Terminal.tsx               # Market grid, book ladder, tape, chart
│   ├── PriceChart.tsx             # KLineChart v10 canvas + overlays
│   ├── StrategyLab.tsx            # Persona cards, sliders, dry-run engine
│   ├── StrategyCopilot.tsx        # AI copilot chat interface
│   ├── FleetDeck.tsx              # Fleet management, sparklines, live stats
│   ├── CatConfigModal.tsx         # Per-cat parameter tuning modal
│   ├── BurnerPanel.tsx            # Session wallet management
│   ├── SpotFlowPanel.tsx          # CVD pressure visualization
│   ├── IntelHub.tsx               # News, whales, flow, cross-venue
│   ├── Leaderboard.tsx            # Ranked runs, clone, signed ops
│   └── landing/                   # Hero, ticker tape, product tour
│
├── lib/                          # Core logic (no React)
│   ├── market-universe/          # Market discovery + chain execution
│   │   ├── indexer.ts            # GraphQL discovery, on-chain log backfill
│   │   ├── discovery.ts          # SDK-backed market rows, registry overlay
│   │   ├── chain-execution.ts    # Pool resolution, order construction
│   │   └── types.ts              # Unified LiveMarketRow, MarketOutcome
│   ├── strategy.ts               # Pure reducer: stepSim(), 6 archetypes
│   ├── fleet-runner.ts           # Module-level fleet runner (local mode)
│   ├── fleet-bridge.ts           # Local/server transparent switch
│   ├── fleet-auth.ts             # Server auth (nonce + sign + session)
│   ├── fleet-client.ts           # SSE client + server command API
│   ├── live-fleet.ts             # Live trading intent + execution
│   ├── live-quotes.ts            # Resting order management
│   ├── order-queue.ts            # Serialized order submission
│   ├── market-context.ts         # Real-time asset stats (spot, sigma)
│   ├── dreamdex.ts               # SDK wrapper + WS pump-loops
│   ├── prices.ts                 # Candle fetching + spot streaming
│   ├── spot-flow.ts              # Binance CVD data pipeline
│   ├── whale-tape.ts             # Large-print filter
│   ├── wallet.ts                 # EIP-6963 wallet layer
│   ├── burner.ts                 # Session burner wallet
│   ├── trading.ts                # Order construction and validation
│   ├── board-auth.ts             # Leaderboard signature verification
│   ├── board-client.ts           # Leaderboard client-side signing
│   ├── store.ts                  # Upstash / in-memory leaderboard store
│   ├── cats.ts                   # Cat persona definitions
│   ├── fleet.ts                  # Fleet orchestrator (capital, equity)
│   └── use-now.ts                # Shared clock hook
│
├── contracts/                    # Foundry (composite-market registry)
├── scripts/                      # Test + verification scripts
├── docs/                         # SDK feedback, research notes
├── design-system/                # Design system documentation
└── public/cats/                  # Cat avatar images
```

### Stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router), **React 19**, **TypeScript** |
| Fleet Server | **Hono** + **@hono/node-server**, standalone Node.js backend with SSE streaming |
| Styling | **Tailwind CSS v4**, custom "DreamCat Terminal" design system (dark slate and amber, double-bezel panels, `ease-terminal` motion) |
| DreamDEX | **`@somnia-chain/markets-sdk` 0.28.1** (discovery, books, trade streams, order placement) |
| Chain | **`viem`** (wallet clients, contract reads, burner derivation) |
| Charting | **KLineChart v10**, candlestick analysis with drawing tools |
| Icons | **Phosphor Icons** |
| Persistence | **Upstash Redis** — fleet state, sessions, nonces, leaderboard (ZSET) |
| AI Copilot | **OpenRouter** (optional), server-only and rate-limited |
| Testing | **Playwright** (headless verification), **tsx** (script runner), **Foundry** (contract tests) |

---

## Quickstart

**Prerequisites:** Node.js 22+ and a package manager (npm). A browser wallet (such as MetaMask) is only needed for live trading; dry-run is read-plus-simulate.

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Configure environment
cp .env.local.example .env.local

# 3. Start dev server
npm run dev -- --port 3111
```

Open **http://localhost:3111** and explore.

### Fleet server (optional)

The fleet server lets cats trade while the browser is closed. It runs as a separate process and needs its own Upstash Redis credentials.

```bash
cd server
npm install

# Set environment variables (or create server/.env)
# UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
# UPSTASH_REDIS_REST_TOKEN=your-token

npm run dev          # dev with hot reload (port 4000)
npm start            # production start
```

Set `NEXT_PUBLIC_FLEET_SERVER_URL=http://localhost:4000` (or your deployed URL) in the Next.js app's `.env.local` to enable server mode in the Fleet Deck.

### Environment variables

All optional. The terminal is fully functional without any of them.

| Variable | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` | Shared leaderboard store and fleet server persistence. Without them, `/leaderboard` runs in labeled local demo mode and the fleet server cannot start. |
| `NEXT_PUBLIC_FLEET_SERVER_URL` | URL of the fleet server (e.g. `https://your-app.onrender.com`). Without it, the fleet runs in browser-only local mode. |
| `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` | Enables the Strategy Copilot AI. Server-only, so never prefix with `NEXT_PUBLIC_`. Without a key, the copilot is disabled and sliders still work. |
| `CRYPTOPANIC_TOKEN` | CryptoPanic free-tier token for the Intel news feed. Falls back to CoinDesk RSS. |
| `NEXT_PUBLIC_INDEXER_URL` and `NEXT_PUBLIC_WS_RPC_URL` | Overrides for the indexer GraphQL and Somnia WebSocket RPC. Shannon defaults are baked in. |

### Routes

| Route | Surface |
|---|---|
| `/` | Landing: hero, live ticker tape, product tour |
| `/terminal` | Market discovery, chart, book ladder, tape, flow, manual trading |
| `/lab` | Strategy Lab: personas, sliders, AI copilot, live-book dry-run |
| `/fleet` | Fleet Deck: up to 5 concurrent cats, allocations, dry-run or live, local or server |
| `/leaderboard` | Signed published runs, one-click clone |
| `/intel` | News, whale radar, spot flow, cross-venue odds |

---

## Live Trading and the Burner Model

Live mode never asks your main wallet to sign every order. Instead:

```
┌─────────────────┐     derive      ┌─────────────────┐
│  Your Wallet    │ ──────────────> │  Session Burner  │
│  (MetaMask etc) │                 │  (deterministic) │
└────────┬────────┘                 └────────┬────────┘
         │                                   │
    fund tUSDC + gas                   places orders
         │                           (bounded by funding)
         v                                   │
   ┌───────────┐                      ┌──────v──────┐
   │  Collateral│                      │  DreamDEX   │
   │  + Gas     │                      │  On-chain   │
   └───────────┘                      └─────────────┘
         ^
    sweep back <─── Sweep returns remaining balances at any time
```

1. **Connect** a wallet (EIP-6963 discovery with fallback to `window.ethereum`; auto-switches to Shannon on the wrong chain, adds the chain on error `4902`).
2. A **deterministic burner** is derived and cached for the session.
3. **Fund it** with tUSDC collateral and a little gas from the burner panel.
4. The fleet (or a manual ticket) places orders from the burner, bounded by what you funded.
5. **Sweep** returns remaining balances to you at any time.

This keeps the blast radius small, keeps signing out of the hot path, and mirrors how a production bot runner would be isolated from a user's primary key.

---

## Fleet Server

The fleet server is a standalone Hono backend that executes strategy ticks server-side, so cats keep trading after the browser is closed.

```
┌──────────────────┐   wallet sign    ┌──────────────────┐
│  Browser (Fleet  │ ─────────────>  │  Fleet Server    │
│  Deck + Bridge)  │   SSE stream    │  (Hono on Render)│
│                  │ <─────────────  │                  │
└────────┬─────────┘                 └────────┬─────────┘
         │                                    │
    local fallback                      1s tick loop
    (if server down)                  ┌───────┼────────┐
                                      │       │        │
                                      v       v        v
                                   Book    Trades    Spot
                                   WS       WS      data
                                      │       │        │
                                      v       v        v
                                  ┌──────────────────────┐
                                  │   Upstash Redis      │
                                  │  sessions, nonces,   │
                                  │  fleet state, burner │
                                  └──────────────────────┘
```

**Auth flow:** Connect wallet → fetch nonce → sign message → verify signature → session token (stored in `sessionStorage`, 24h TTL).

**Resilience:** The bridge retries up to 3 times on disconnect, then falls back to local mode with a notice. Offline detection (`navigator.onLine`) triggers immediate fallback. On server restart, `fleetManager.recoverFleets()` rehydrates all active fleets from Redis. Idle fleets time out after 30 minutes with no connected listeners.

---

## Verification

The project ships with test and verification scripts.

```bash
# Strategy engine self-checks (pure logic)
npx tsx scripts/test-engine.ts

# Order construction and validation
npx tsx scripts/test-trading.ts

# Market indexer integration
npx tsx scripts/test-market-indexer.ts

# Spot flow data pipeline
npx tsx scripts/test-spot-flow.ts

# Strategy copilot guardrails
npx tsx scripts/test-strategy-copilot.ts
npx tsx scripts/test-strategy-copilot-route.ts

# Headless UI verification (dev server must be running on :3111)
npx tsx scripts/verify-lab.ts              # dry-run consumes live book
npx tsx scripts/verify-fleet-runner.ts     # runner survives navigation and reload
npx tsx scripts/verify-wallet.ts           # EIP-6963 connect and chain-switch flows
npx tsx scripts/verify-landing.ts          # landing page renders
npx tsx scripts/verify-fleet.ts            # fleet deck renders
npx tsx scripts/verify-params.ts           # strategy parameter validation
npx tsx scripts/verify-live-cycle.ts       # full live trading cycle
npx tsx scripts/verify-mittens-live.ts     # market-maker quoting cycle

# Registry contract (Foundry)
cd contracts && ~/.foundry/bin/forge test   # 14 tests
```

`npm run lint` and `npm run build` **must pass**. The build enforces React compiler rules (react-hooks).

---

## DreamDEX Integration

### SDK surfaces

All accessed via `new SomniaMarkets(...)`, constructed once in [`lib/dreamdex.ts`](lib/dreamdex.ts):

| Method | Use |
|---|---|
| `loadMarkets(true)` | Discovery, filtered to `active && type === "binary"`, narrowed with `isBinaryMarket`. |
| `fetchOrderBook` and `watchOrderBook` | Depth ladders and the imbalance ribbon. |
| `watchTrades` | Prints tape and tape-skew signal (`fetchTrades` returns `[]` for binary symbols). |
| `trader` with `walletClient` | Live-order path, driven by the session burner. |
| `fetchPriceCandles` | BTC/ETH spot candles (accessed through the class instance, not a standalone export). |

### Protocol facts we honor

- **Status gating**: only markets reporting `status === "Trading"` are listed or traded, re-checked each poll rather than trusted from stale state.
- **Claimed winnings**: settlements are swept, not assumed auto-received.
- **Integer tick pricing**: human-unit probabilities internally, with conversion to integer ticks only at the on-chain edge.
- **Venue-ID churn**: nothing venue-related is hardcoded. State is keyed by `marketId`, and symbols come from live rows.
- **Price scaling**: `info.lastPrice` is raw-scaled (divided by 1e6 on testnet tUSDC venues), while book prices are human units.
- **BigInt serialization**: BigInt fields crash `JSON.stringify`, so all serialization uses a replacer.

Full SDK sharp-edges write-up: **[`docs/sdk-feedback.md`](docs/sdk-feedback.md)**.

---

## Hackathon Submission

| Item | Status |
|---|---|
| Working prototype on Somnia testnet | Done. All surfaces live against Shannon (50312) |
| Live on-chain trading path | Done. Session-burner execution via markets-sdk trader plus chain execution layer |
| Persistent fleet server | Done. Standalone Hono backend with wallet-signed auth, SSE streaming, Redis persistence, auto-recovery, and graceful shutdown |
| Market Universe indexer | Done. Direct GraphQL plus on-chain backfill plus registry overlay |
| Six strategy archetypes | Done. Maker, Momentum, Fade, Fair-Value, Theta, Market-Maker |
| AI Strategy Copilot | Done. Guarded OpenRouter integration with bounded parameter proposals |
| Spot Flow and Whale Radar | Done. Binance aggTrade and kline streams with CVD bucketing |
| Signed leaderboard | Done. EIP-191 wallet signatures with nonce and TTL |
| Public repo and README on Event Contracts / SDK usage | Done. This file plus integration notes |
| SDK/docs feedback report | Done. [`docs/sdk-feedback.md`](docs/sdk-feedback.md) |
| Deployed frontend | Done. [dreamcat-somnia.vercel.app](https://dreamcat-somnia.vercel.app) |
| Deployed fleet server | Done. Render with Upstash Redis |
| Demo video | Done. [youtu.be/5kwpbkOtGr8](https://youtu.be/5kwpbkOtGr8) |

---

<div align="center">

**MIT Licensed**

Built on [Somnia](https://somnia.network) Shannon testnet with [DreamDEX Event Contracts](https://dreamdex.somnia.network)

<sub>Whiskers, Pounce, Luna, Fairy, Theta, Mittens</sub>

</div>
