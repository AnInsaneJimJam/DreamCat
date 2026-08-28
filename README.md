<div align="center">

<br/>

<img src="public/dreamcat.svg" alt="DreamCat Terminal" width="72" />

# DreamCat Terminal

**Bloomberg-style trading terminal, AI strategy copilot, and multi-agent bot fleet**
**for DreamDEX Event Contracts on Somnia**

Discover every live market, read order flow like a pro, design a strategy with an AI copilot, and deploy a fleet of trading cats, in dry-run or live on-chain.

<br/>

![Chain](https://img.shields.io/badge/Somnia_Shannon-testnet_50312-6f7fd8?style=for-the-badge)
![Trading](https://img.shields.io/badge/mode-dry--run_+_live_on--chain-0e7c7b?style=for-the-badge)
![Stack](https://img.shields.io/badge/Next.js_16-React_19-000?style=for-the-badge)
![SDK](https://img.shields.io/badge/markets--sdk-0.28.1-e0a133?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)

Built for the **Somnia x DreamDEX Event Contracts Hackathon** on DoraHacks.

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
| **Tradable** | The same strategies can execute real on-chain orders through a session-scoped burner wallet, with no dry-run ceiling. |
| **Multi-agent** | Deploy up to five concurrent strategy personas ("cats"), each with a capital allocation, and publish results to a wallet-signed public leaderboard. |

For the venue, that is tooling that grows volume, sharpens price discovery, and pulls third-party developers onto the same rails.

> [!NOTE]
> Everything runs on **Somnia Shannon testnet** against **test USDC**. Dry-run mode signs nothing. Live mode places real testnet orders. There is no mainnet path and no custodial funds.

---

## What's new

The terminal has grown well past its dry-run origins.

| Update | Summary |
|---|---|
| **Live on-chain execution** | Strategies and manual tickets now place real orders on Somnia testnet, not just paper trades. The chain execution layer (`market-universe/chain-execution`) handles order construction, pool resolution, and receipt verification. |
| **Session burner wallets** | A deterministic burner is derived from your connected wallet, funded with tUSDC collateral and gas, and executes the fleet. It is fully sweepable back to you, so your main key never signs an order per trade. |
| **Strategy Copilot** | A guarded AI assistant (`/api/strategy-copilot`) via OpenRouter that explains archetypes and proposes bounded parameter changes in plain language. It is guardrailed to never place orders or handle keys. |
| **Six strategy archetypes** | Grew from 3 to 6: Maker, Momentum, Fade, Fair-Value, Theta, and Market-Maker. This includes a model-priced fair-value engine and a two-sided quoting maker. |
| **Spot Flow panel** | Live BTC/ETH CVD-style buy/sell flow with 15s, 1m, and 5m windows, sourced from Binance aggTrade and kline streams. The `SpotFlowPanel` component renders rolling pressure visualizations. |
| **Signed leaderboard** | Publish and delete are gated by a wallet signature (EIP-191) with a nonce and TTL, so there is no anonymous spam. Board auth and signing are handled through dedicated clients (`board-auth` and `board-client`). |
| **Live quoting engine** | The `live-quotes` module manages resting bid/ask orders with shadow, single, and dual quoting policies for the market-maker archetype. It tracks fill confirmations and requotes. |
| **Market Universe indexer** | A full-stack market discovery layer (`market-universe/`) with direct GraphQL indexer queries, on-chain log backfill, third-party registry overlay, and book metadata enrichment, replacing the simpler SDK-only discovery. |
| **Market Context engine** | Real-time spot, sigma, and prev-spot asset stats (`market-context`) with reference-counted subscriptions, 1-minute sigma refresh from candle returns, and open-price caching for strike resolution. |

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

- **Live discovery** of every active DreamDEX binary window via `@somnia-chain/markets-sdk` and the Market Universe indexer: top-10 by quote volume with a see-all toggle, refreshed continuously. Venue IDs are read dynamically from market rows, never hardcoded.
- Full **BTC/ETH candlestick analysis** (KLineChart v10): five timeframes (1m, 5m, 15m, 1h, 1d), tick volume, MA/EMA/RSI studies, trend, ray, and channel lines, horizontal levels, Fibonacci retracement, magnet snapping, saved drawings (per asset and timeframe), and PNG snapshots.
- Per-market detail rail: YES order-book depth ladder, a bid/ask **pressure ribbon** from resting depth, recent prints tape, and time-to-settlement countdowns, streamed over WebSocket watches.
- **Manual trading**: place limit or market YES/NO tickets directly against the live book.
- **Burner panel**: derive, fund (collateral plus gas), inspect balances, and sweep a session wallet.

### Strategy Lab (`/lab`)

- Pick a persona, then tune the archetype's parameters with sliders, or ask the **Strategy Copilot** to configure it for you in plain language.
- Run a **dry-run** against the live book. The engine is a pure reducer, `stepSim(config, state, book, fills, now)`, stepped once per second off real WebSocket snapshots.
- Full **market context** integration: live spot prices, historical volatility (sigma), and open-price caching feed the fair-value and theta archetypes.
- Live position card, marked equity in tUSDC, win/loss tally, and a color-coded open/close log.

### Fleet Deck (`/fleet`)

- Deploy up to **5 cats concurrently**, each on its own window, with a capital-allocation percentage per cat (capped at 100% of a configurable bankroll).
- Per-cat equity sparklines, aggregate fleet stats, and start/stop-all from the header.
- **Dry-run or live**: with a funded burner, the fleet executes real on-chain orders via the chain execution layer. The runner lives outside the route tree as a module-level singleton, so cats keep trading while you browse other pages.
- **Cat config modal** for detailed per-cat parameter tuning before deploy.
- Config persists in `localStorage`, and any result can be published to the leaderboard with one click.

### Leaderboard (`/leaderboard`)

- Ranked published runs (PnL, trades, win rate, market, age). Backed by Upstash Redis (ZSET) when configured, otherwise a labeled local demo store.
- **Publish and delete are wallet-signed**. An EIP-191 signature with a nonce and 5-minute TTL proves ownership via `board-auth` and `board-client`.
- One-click **Clone** drops a published config into your Fleet Deck for review before deploy.

### Intel Hub (`/intel`)

- **News** feed with bullish, bearish, and flat sentiment badges (CryptoPanic when tokened, CoinDesk RSS fallback).
- **Whale radar**: large BTC/ETH prints from Binance's public stream, clearly labeled as off-chain context.
- **Spot Flow**: rolling CVD-style buy/sell pressure across 15s, 1m, and 5m windows with real-time visualizations and flow-read interpretations (buyers lifting, sellers pressing, flow absorbed, balanced).
- **Cross-venue sentiment**: top Polymarket crypto markets for probability-divergence eyeballing against DreamDEX windows.

---

## Architecture

```
browser (Next.js 16 App Router, React 19 client components)
|
├─ Terminal / Lab / Fleet
│   ├─ lib/market-universe/ ──── Market Universe (discovery + chain sync)
│   │   ├─ indexer.ts            GraphQL discovery, on-chain log backfill,
│   │   │                        stale-while-revalidate caching
│   │   ├─ discovery.ts          SDK-backed live market rows, registry overlay
│   │   ├─ chain-execution.ts    Pool resolution, order construction, receipt
│   │   │                        verification for live on-chain trades
│   │   └─ types.ts              Unified LiveMarketRow, MarketOutcome, etc.
│   │
│   ├─ lib/dreamdex.ts ──────── SDK wrapper (loadMarkets, watchBook,
│   │                            watchFills; deduped, reconnecting WS)
│   │
│   ├─ lib/market-context.ts ── Real-time asset stats (spot, sigma, prev-spot)
│   │                            with ref-counted subscriptions
│   │
│   └─ lib/prices.ts ────────── BTC/ETH candles (M1/H1/D1 native,
│                                5m/15m client-aggregated), watchSpot pump-loop
│
├─ Strategy Engine
│   ├─ lib/strategy.ts           Pure reducer: stepSim() to next state,
│   │                            6 archetypes, fair-value pricing model
│   ├─ lib/fleet.ts              Fleet orchestrator (capital weighting, equity)
│   ├─ lib/fleet-runner.ts       Module-level runner (up to 5 cats, survives nav)
│   ├─ lib/live-fleet.ts         Live path: intent derivation, on-chain exec
│   ├─ lib/live-quotes.ts        Resting order management (shadow/single/dual)
│   ├─ lib/order-queue.ts        Serialized order submission
│   └─ lib/trading.ts            Order construction and validation
│
├─ Wallet & Burner
│   ├─ lib/wallet.ts             EIP-6963 discovery, silent reconnect,
│   │                            chain-switch (add on 4902)
│   └─ lib/burner.ts             Deterministic session wallet (viem),
│                                fund collateral + gas, sweep
│
├─ API Routes (server-side)
│   ├─ /api/markets              Cached market universe (server indexer)
│   ├─ /api/strategy-copilot     OpenRouter AI (rate-limited, guarded prompt)
│   ├─ /api/leaderboard          lib/store.ts to Upstash Redis or in-memory,
│   │   (signed publish/delete)   lib/board-auth.ts (nonce + TTL verification)
│   ├─ /api/news                 CryptoPanic or CoinDesk RSS fallback
│   ├─ /api/polymarket           Gamma API (geo-degrades gracefully)
│   └─ /api/spot-flow            Spot flow data endpoint
│
├─ Intel Streams (browser-side)
│   ├─ lib/spot-flow.ts          Binance aggTrade/kline WS, CVD bucketing
│   └─ lib/whale-tape.ts         Large-print filter (BTC over $50k, ETH over $25k)
│
├─ UI Components
│   ├─ components/Terminal.tsx         Market grid, book ladder, tape, chart
│   ├─ components/PriceChart.tsx       KLineChart v10 canvas + overlays
│   ├─ components/StrategyLab.tsx      Persona cards, sliders, dry-run engine
│   ├─ components/StrategyCopilot.tsx  AI copilot chat interface
│   ├─ components/FleetDeck.tsx        Fleet management, sparklines, live stats
│   ├─ components/CatConfigModal.tsx   Per-cat parameter tuning modal
│   ├─ components/BurnerPanel.tsx      Session wallet management
│   ├─ components/SpotFlowPanel.tsx    CVD pressure visualization
│   ├─ components/IntelHub.tsx         News, whales, flow, cross-venue
│   ├─ components/Leaderboard.tsx      Ranked runs, clone, signed ops
│   └─ components/landing/            Hero, ticker tape, product tour
│
└─ Contracts (Foundry)
    └─ contracts/                     Third-party composite-market registry
                                      14 passing tests, deploy script ready
```

### Stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router), **React 19**, **TypeScript** |
| Styling | **Tailwind CSS v4**, custom "DreamCat Terminal" design system (dark slate and amber, double-bezel panels, `ease-terminal` motion) |
| DreamDEX | **`@somnia-chain/markets-sdk` 0.28.1** (discovery, books, trade streams, order placement) |
| Chain | **`viem`** (wallet clients, contract reads, burner derivation) |
| Charting | **KLineChart v10**, candlestick analysis with drawing tools |
| Icons | **Phosphor Icons** |
| Leaderboard | **Upstash Redis** (optional), ZSET-backed ranked store |
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

### Environment variables

All optional. The terminal is fully functional without any of them.

| Variable | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` | Shared leaderboard store. Without them, `/leaderboard` runs in labeled local demo mode. |
| `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` | Enables the Strategy Copilot AI. Server-only, so never prefix with `NEXT_PUBLIC_`. Without a key, the copilot is disabled and sliders still work. |
| `CRYPTOPANIC_TOKEN` | CryptoPanic free-tier token for the Intel news feed. Falls back to CoinDesk RSS. |
| `NEXT_PUBLIC_INDEXER_URL` and `NEXT_PUBLIC_WS_RPC_URL` | Overrides for the indexer GraphQL and Somnia WebSocket RPC. Shannon defaults are baked in. |

### Routes

| Route | Surface |
|---|---|
| `/` | Landing: hero, live ticker tape, product tour |
| `/terminal` | Market discovery, chart, book ladder, tape, flow, manual trading |
| `/lab` | Strategy Lab: personas, sliders, AI copilot, live-book dry-run |
| `/fleet` | Fleet Deck: up to 5 concurrent cats, allocations, dry-run or live |
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

## Project Structure

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
│   │   ├── markets/              # Cached market universe
│   │   ├── strategy-copilot/     # AI copilot endpoint
│   │   ├── leaderboard/          # Signed publish/delete
│   │   ├── news/                 # News aggregation
│   │   ├── polymarket/           # Cross-venue data
│   │   └── spot-flow/            # Spot flow endpoint
│   ├── globals.css               # Design system tokens
│   └── layout.tsx                # Root layout
├── components/                   # Client components (one per route)
│   ├── landing/                  # Landing page sub-components
│   └── *.tsx                     # Terminal, Lab, Fleet, Intel, etc.
├── lib/                          # Core logic (no React)
│   ├── market-universe/          # Market discovery + chain execution
│   ├── strategy.ts               # Pure strategy engine (6 archetypes)
│   ├── strategy-copilot.ts       # Copilot prompt construction + parsing
│   ├── fleet-runner.ts           # Module-level fleet runner
│   ├── live-fleet.ts             # Live trading intent + execution
│   ├── live-quotes.ts            # Resting order management
│   ├── order-queue.ts            # Serialized order submission
│   ├── market-context.ts         # Real-time asset stats
│   ├── dreamdex.ts               # SDK wrapper + WS pump-loops
│   ├── prices.ts                 # Candle fetching + spot streaming
│   ├── spot-flow.ts              # Binance CVD data pipeline
│   ├── whale-tape.ts             # Large-print filter
│   ├── wallet.ts                 # EIP-6963 wallet layer
│   ├── burner.ts                 # Session burner wallet
│   ├── trading.ts                # Order construction
│   ├── board-auth.ts             # Leaderboard signature verification
│   ├── board-client.ts           # Leaderboard client-side signing
│   ├── store.ts                  # Upstash / in-memory leaderboard store
│   ├── cats.ts                   # Cat persona definitions
│   ├── fleet.ts                  # Fleet orchestrator (capital, equity)
│   └── use-now.ts                # Shared clock hook
├── contracts/                    # Foundry (composite-market registry)
├── scripts/                      # Test + verification scripts
├── docs/                         # SDK feedback, research notes
├── design-system/                # Design system documentation
└── public/cats/                  # Cat avatar images
```

---

## Hackathon Submission

| Item | Status |
|---|---|
| Working prototype on Somnia testnet | Done. All surfaces live against Shannon (50312) |
| Live on-chain trading path | Done. Session-burner execution via markets-sdk trader plus chain execution layer |
| Market Universe indexer | Done. Direct GraphQL plus on-chain backfill plus registry overlay |
| Six strategy archetypes | Done. Maker, Momentum, Fade, Fair-Value, Theta, Market-Maker |
| AI Strategy Copilot | Done. Guarded OpenRouter integration with bounded parameter proposals |
| Spot Flow and Whale Radar | Done. Binance aggTrade and kline streams with CVD bucketing |
| Signed leaderboard | Done. EIP-191 wallet signatures with nonce and TTL |
| Public repo and README on Event Contracts / SDK usage | Done. This file plus integration notes |
| SDK/docs feedback report | Done. [`docs/sdk-feedback.md`](docs/sdk-feedback.md) |
| Demo video | In progress |

---

<div align="center">

**MIT Licensed**

Built on [Somnia](https://somnia.network) Shannon testnet with [DreamDEX Event Contracts](https://dreamdex.somnia.network)

<sub>Whiskers, Pounce, Luna, Fairy, Theta, Mittens</sub>

</div>
