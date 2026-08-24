# DreamCat Terminal

> Bloomberg-style terminal + bot fleet for DreamDEX Event Contracts on Somnia.
> Entry for the **Somnia × DreamDEX Event Contracts Hackathon** ($5,000 USDso pool, submissions Aug 25 – Sep 8, 2026).

## One-liner

A professional-grade trading terminal that indexes every market on DreamDEX, visualizes live Up/Down flow, lets anyone assemble trading-bot strategies in minutes, and runs a fleet of up to 5 AI cat traders simultaneously — with one-click cloning of top-performing strategies and a cross-venue sentiment hub.

## Why this wins (rubric mapping)

| Criterion | Weight | How we hit it |
|---|---|---|
| Technical implementation | 25% | Deep multi-surface use of markets-sdk (indexer, WS streams, order placement) + Bot Kit core/backtest packages |
| Innovation & originality | 20% | Cat-fleet multi-bot runner, third-party market registry, probability-divergence card vs Polymarket |
| UX & design | 20% | Bloomberg-density terminal, premium dark fintech design system, purposeful motion |
| Business & ecosystem impact | 20% | Tooling that grows DreamDEX volume + dev adoption; indexes 3rd-party markets built on their rails |
| Presentation & demo | 15% | Live terminal demo video; SDK-feedback report as bonus signal |

---

## Pillars

### 1. Market Discovery — "index everything"
- All **native DreamDEX EC markets** (BTC/ETH Up/Down windows across all venues) via the markets-sdk indexer
- Venue IDs read dynamically at runtime — never hardcoded (they churn)
- **Third-party registry:** lightweight on-chain registry on Somnia testnet where builders of composite markets (e.g., parlays over EC windows) register metadata → surfaced in the same terminal
- Top-10-by-volume view + paginated "see all"; live search/filter
- Key state by `marketId`, never pool address (pools recycle across windows)

### 2. Flow Intelligence
- **Book imbalance gauge:** resting buy-pressure (Up) vs sell-pressure (Down) from live order book depth, updating every block via WebSocket watches
- **Traded volume split:** rolling Up-vs-Down executed volume bars from fills/candles
- Fills tape, depth ladder, positions/PnL panels in a dense dark grid

### 3. Strategy Builder — templates + sliders
- Archetypes seeded from Bot Kit strategies: market-maker, passive quote, laddering, oracle-follow, momentum
- Parameter sliders: spread width, order size, refresh interval, expiry headroom, max position, venue/series selection
- Two-stage sandbox before real orders:
  1. **Backtest** — historical candles/fills replay (wraps Bot Kit `packages/backtest`)
  2. **Dry-run** — logs hypothetical orders against the LIVE book via WS, nothing signed (`DRY_RUN` mode)

### 4. Cat Fleet — 5 simultaneous bots
- Each bot = a **cat persona preset**: name, avatar, stats card, personality blurb mapped to an archetype (e.g., *Whiskers the Maker*, *Pounce the Momentum*, *Luna the Mean-Reverter*)
- User allocates **capital share per bot** (must sum ≤ 100%), start/stop all from one fleet dashboard, live status/PnL per cat
- Runner abstraction layer: **in-browser runner now** (WS-driven), swappable to cloud/Railway worker post-hackathon without UI changes
- Honors EC sharp edges internally: integer tick-grid pricing, scaled expiry headroom, on-chain status gating (not indexer lag), auto-claim of settled winnings each loop

### 5. Social Edge — clone the best
- Public leaderboard ranks **published bot configs by realized PnL**
- **One-click clone** any config into your own cat
- Stretch goal: live trade mirroring (follow a wallet's entries in real time)

### 6. Intel Hub
- **News:** aggregated BTC/ETH/macro news (CryptoPanic free tier), simple bullish/bearish badges (keyword lexicon v1)
- **Whale radar** (labeled off-chain context): large CEX prints via Binance public WS (size-threshold filter), ETH/BTC spot ETF net-flow table (daily refresh), large on-chain transfers via free explorer APIs
- **Cross-venue sentiment:** live Polymarket crypto markets (public Gamma/CLOB API, proxied through Next.js API routes); **probability divergence card** showing same/similar questions priced on both venues
- Kalshi behind a feature flag pending API access approval

---

## Non-goals (v1)

No mainnet · no custodial funds · no drag-drop node canvas · no mobile app · no custom oracle resolution · Intel Hub is read-only context (no bot logic depends on it in v1).

## Stack

- **Next.js 15 + TypeScript** (App Router, Turbopack), Tailwind CSS v4
- **markets-sdk** (`@somnia-chain/markets-sdk` ≥0.25): discovery, books, fills streams, orders, mint/merge, redemption
- **DreamDEX Bot Kit**: strategy reference implementations + backtest engine concepts
- Leaderboard store: Supabase or Upstash free tier
- **Somnia Shannon testnet**: chain `50312`, RPC `https://dream-rpc.somnia.network`
- Design system: see `design-system/MASTER.md` (generated via UI UX Pro Max + frontend-design + design-motion-principles skills)

## Key protocol facts (from DreamDEX docs)

- Lifecycle: `Listed(0) → Trading(1) → Locked(2) → Resolved(4) | Voided(5)`; only `Trading` accepts orders
- One book, two sides: Down = 1 − Up price; opposite buyers cross via mint-a-pair (zero-inventory quoting possible)
- Winnings are **claimed**, not auto-received — sweep settled markets periodically
- Reverted SDK writes historically didn't throw (receipt rides on `info`); gate every write on live on-chain status
- Never pass float probabilities to an 18-decimal venue — convert in tick units as integers
- Settlement is oracle-hub driven with Somnia Reactivity callbacks; resolutions auditable at the oracle explorer via `oracleQuestionId`

## Timeline (solo, Aug 25 → Sep 8)

| Days | Deliverable |
|---|---|
| 1–2 | SDK spike (browser signing path!), data layer: markets/books/fills |
| 3–4 | Terminal shell + market discovery (top-10 volume, see-all) |
| 5–6 | Flow intelligence: imbalance gauge, Up/Down split, tape |
| 7–8 | Strategy templates + sliders; backtest stage; dry-run stage |
| 9–10 | Cat Fleet manager (≤5 personas, capital allocation, live cards) |
| 11 | Leaderboard store + one-click config clone |
| 12 | Intel Hub (news / whale radar / cross-venue) |
| 13 | Registry contract (minimal) + README + SDK-feedback report + demo video |
| 14 | Buffer — submit early |

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| markets-sdk assumes raw private keys (browser signing unclear) | Day-1 spike; fallback = tiny local companion runner launched by UI |
| Venue ID churn breaks data feeds | Read venue IDs dynamically from live market rows; config-driven |
| Polymarket API shape/CORS | Proxy via our own API routes; degrade gracefully |
| Scope creep | Ponytail discipline: shortest working diff per feature; mirroring stays stretch |

## Submission checklist

- [ ] Working prototype on Somnia testnet
- [ ] Public GitHub repo + README (how Event Contracts/SDK are used)
- [ ] 2–3 min demo video
- [ ] Optional but planned: presentation deck + SDK/docs feedback report
