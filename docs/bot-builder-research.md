# Bot Builder Research

Status: research handoff, 26 August 2026

Scope: feature parity with the supplied DreamBot Builder captures, then a trader-grade roadmap for DreamCat Terminal. This note does not change application code. Product observations below come from the supplied screenshots; protocol and competitor capability claims are linked to first-party documentation.

## Executive decision

DreamBot Builder is a useful configuration wizard, but its visible product is primarily a template-to-`.env` exporter. DreamCat should match that workflow first, then become the control plane for event-contract research, execution safety, and a coordinated bot portfolio.

The differentiating wedge is not simply “more templates.” It is:

1. Probability-native BTC/ETH event-contract tools: strike, reference price, time-to-expiry, YES/NO exposure, oracle state, and settlement are first-class fields.
2. Evidence before deployment: realistic replay, live shadow mode, canary mode, edge diagnostics, and a clear distinction between synthetic and historical results.
3. Portfolio-aware fleets: shared capital, exposure, nonce, order-rate, and kill-switch policies across every bot.
4. Transparent operations: every decision, order, fill, rejection, pause, and claim is explainable and exportable.

## 1. Baseline: what the supplied DreamBot Builder already does

The five supplied captures show a coherent four-step wizard:

| Step | Observed capability | Parity requirement for DreamCat |
| --- | --- | --- |
| Strategy | Market type toggle for Spot/Event contracts; cards for Starter, Market Maker, Grid, Momentum, Mean Reversion, TWAP, and Ensemble | Keep the same quick-start template choice, but add domain-specific metadata, required inputs, risk profile, and supported modes |
| Network | Testnet/Mainnet toggle and Dry-run/Live toggle | Keep both toggles; add Shadow and Canary modes and block Live until preflight checks pass |
| Tune | Market, grid step, lot size, max inventory, stop-after-loss, plus hidden advanced controls | Keep progressive disclosure, but surface event expiry, probability ticks, order type, stale-data behavior, portfolio limits, and settlement policy |
| Deploy | Generated `.env` block with Copy/Download, Railway handoff, local clone/run instructions, key-safety warning, and leaderboard CTA | Keep export and deployment handoff; add versioned config, reproducible run manifest, readiness report, rollback, and no-secret browser handling |

The screenshots do not show historical backtesting, realistic fill modeling, portfolio-level risk, event resolution/claim handling, order lifecycle inspection, data-health controls, configuration versions, or live performance monitoring. These are the first gaps to close after parity.

The current repository is narrower than the screenshot baseline: `/lab` exposes three paper strategies (`maker`, `momentum`, and `fade`) and runs a live-book simulation; `/fleet` can run up to five paper cats with capital percentages. The builder work should converge these into one typed configuration rather than creating a second unrelated strategy system.

## 2. Primary-source findings

### DreamDEX-specific requirements

The official DreamDEX Bot Kit already describes six event-contract strategy families: starter, maker, passive, settlement, oracle-follow, and laddering. It also states that event contracts trade as binary BTC/ETH Up/Down markets, require explicit market/venue handling, expire on a schedule, and require a claim sweep after settlement. [S1](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/event-contracts.md)

The same documentation calls out correctness constraints that must be encoded in the builder, not left to users to remember:

- Gate writes on on-chain `Trading` status, because indexer status can lag.
- Quantize price to the integer tick grid and size to the lot/minimum-quantity grid.
- Set every order expiry in the future and cap it at the market expiry.
- Reconcile wallet balances and open orders; resting escrow changes available balance.
- Treat finalized markets as a separate settlement/claim surface.
- Key state by market ID or symbol, not a recycled pool address. [S1](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/event-contracts.md)

The official bot-kit backtester is a strong baseline for a first research screen: it can compare strategies, override parameters, model order types, fees, taker slippage, optional queue-position partial fills, and maker markout, and export JSON/CSV reports. It explicitly warns that the default book is synthetic from OHLCV, gas is not modeled, and a supplied depth recording is needed for more realistic replay. The builder should show this data provenance beside every result. [S2](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/backtesting.md)

The official operations guide recommends one nonce allocator with backpressure and resync, out-of-band receipt reconciliation, WebSocket heartbeat/reconnect/replay, chain reconciliation when feeds diverge, a native gas reserve, canary orders, session loss/transaction-rate/error circuit breakers, and a dry-run-first rollout. [S3](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/24-7-operations.md)

The bot-kit skill documents Normal/GTC, FOK, IOC, and PostOnly order types; simulation before broadcast; receipt/log verification after broadcast; lot/tick validation; and the warning that raw private keys should not be the default production deployment. [S4](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/skills/dreamdex-bot/SKILL.md)

DreamDEX's official split-key guide gives a useful non-custodial deployment pattern: a cold owner/fund key holds funds while a hot operator key may place/cancel only, with per-selector on-chain permissions and immediate revocation. The builder should offer this as the production path instead of asking users to paste a raw private key into a hosted UI. [S5](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/session-keys.md)

### Proven trader-product patterns

Hummingbot's official Dashboard documents a configuration → backtest → deploy → manage lifecycle, multi-bot deployment, and real-time performance monitoring. Its backtesting UI exposes net PnL, max drawdown, total volume, Sharpe ratio, profit factor, closure reasons, and a version/config tag before deployment. [S6](https://hummingbot.org/dashboard/) [S7](https://hummingbot.org/dashboard/backtest/)

Hummingbot's official client supports paper trading without risking real assets and configurable virtual balances. Its kill switch stops a bot at a positive or negative performance threshold; its balance limit caps the amount of an asset a bot may use when several bots share an account; its rate-limit budget warns before an instance approaches its allocated share; and its market-data collector persists timestamped mid, bid, ask, and order-book snapshots. [S8](https://hummingbot.org/client/global-configs/paper-trade/) [S9](https://hummingbot.org/client/global-configs/kill-switch/) [S10](https://hummingbot.org/client/global-configs/balance-limit/) [S11](https://hummingbot.org/client/global-configs/rate-limits-share-pct/) [S12](https://hummingbot.org/client/global-configs/data-collector/)

Hummingbot's current Condor documentation goes beyond simple bot cards: unified portfolio history, bot uptime/PnL/volume, error-filtered logs, browser-configurable executors, routines, alerts, and multi-agent sessions with isolated PnL and replayable decisions. Its architecture separates reasoning from deterministic execution so a slow or failed assistant does not block the execution layer. [S13](https://condor.hummingbot.org/introduction) [S14](https://condor.hummingbot.org/getting-started/web-dashboard) [S15](https://condor.hummingbot.org/routines/overview) [S16](https://condor.hummingbot.org/bots/overview)

Freqtrade's official docs provide two especially relevant patterns: composable protections (stoploss guard, max drawdown, low-profit lock, and cooldown) that can pause one market or the whole portfolio, and hyperopt that searches a defined parameter space with an explicit loss function. Its callback model also separates custom entry, exit, stop, ROI, pricing, timeout, and confirmation decisions. [S17](https://docs.freqtrade.io/en/stable/plugins/) [S18](https://www.freqtrade.io/en/stable/hyperopt/) [S19](https://docs.freqtrade.io/en/stable/strategy-callbacks/)

Binary-market interfaces provide additional domain cues. Polymarket's official docs describe outcome prices as implied probabilities, complementary YES/NO outcomes, minimum tick/order-size metadata, order types (GTC, GTD, FOK, FAK, and PostOnly), order lifecycle states, and market-making inventory/quote management. [S20](https://docs.polymarket.com/concepts/prices-orderbook) [S21](https://docs.polymarket.com/concepts/order-lifecycle) [S22](https://docs.polymarket.com/trading/market-making)

Kalshi's official API exposes an order-group pattern that automatically cancels all resting orders and blocks new orders when a rolling contract limit is reached. DreamDEX does not document an equivalent server-side feature; DreamCat should implement the same safety intent at the fleet/risk layer and combine it with DreamDEX order expiry. Kalshi also documents explicit market lifecycle states and real-time lifecycle channels, which is a useful model for making “trading,” “closed,” “determined,” “settling,” and “finalized” visible to users. [S23](https://docs.kalshi.com/getting_started/order_groups) [S24](https://docs.kalshi.com/getting_started/market_lifecycle)

Bitsgap's official bot documentation confirms that no-code traders expect configurable grid range/levels, DCA/grid combinations, trailing behavior, pump protection, take profit, stop loss, and backtest-before-launch. These are parity cues, not a reason to copy its spot-centric model into event contracts. [S25](https://bitsgap.com/helpdesk/article/10043546796572-Advanced-COMBO-Bot-Settings) [S26](https://bitsgap.com/helpdesk/category/18694705034780-Trading-Bots)

For the oracle-follow path, Binance's official aggregate-trade stream provides one taker order at a time with price, quantity, trade time, and a buyer-maker flag. It is suitable as a clearly labeled underlying spot input for BTC/ETH signals, not as proof that an event-contract trade caused the underlying move. [S27](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams)

## 3. Product requirements

### 3.1 Feature parity: ship this first

The builder should preserve the familiar four-step mental model while adding a persistent right-side preview:

1. **Strategy** — choose Spot or Event Contracts, then choose a template. Every card shows what it observes, what it trades, how it exits, required data, and the principal risk.
2. **Network** — Testnet/Mainnet and Dry-run/Shadow/Canary/Live. Live is an explicit high-friction transition, not a toggle that silently changes behavior.
3. **Tune** — target market(s), sizing, order behavior, refresh, entry/exit, risk, and data policy. A compact “effective config” view must show every advanced default.
4. **Deploy** — validate, review, backtest or shadow-test, export a versioned config, choose local/cloud/operator-key execution, and show exactly what will happen next.

Parity fields for every strategy:

- `domain`: `spot` or `event-contract`.
- `network`: `testnet` or `mainnet`.
- `mode`: `dry-run`, `shadow`, `canary`, or `live`.
- `marketIds` and dynamic venue IDs; never a display label alone.
- Order type, price tick, quantity lot, minimum quantity, refresh interval, and order expiry.
- Per-bot max inventory, max notional, max loss, max trades/transactions, gas floor, and stale-feed policy.
- Take profit, stop loss, time stop, and emergency flatten/cancel policy where the venue supports only application-level controls.
- Config name, immutable version/hash, author, created time, source data, and changelog.

### 3.2 Event-contract-native builder

The market picker must be richer than a symbol dropdown. Each target should show:

- BTC or ETH underlying.
- Human question plus machine fields: strike/reference, interval, market expiry, market ID, venue ID, YES/NO symbols, and execution readiness.
- On-chain lifecycle status and indexer freshness.
- YES/NO best bid, best ask, midpoint, spread, depth, and last fill.
- Underlying spot, distance from strike/reference, time remaining, and a visible “new orders stop in” cutoff.
- Resolution/oracle metadata and a claim-needed indicator after settlement.

Initial event templates should reach parity with the official kit: EC Starter, EC Maker, EC Passive, EC Oracle Follow, EC Laddering, and EC Settlement. Existing spot templates remain available, but must not expose spot assumptions (for example, quote currency inventory) on an event-contract form. [S1](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/event-contracts.md)

Useful event-specific controls:

| Control | Why it matters | Safe UI wording |
| --- | --- | --- |
| Fair probability / edge threshold | A YES price is a probability-like quantity; the model must compare fair value to executable bid/ask, not only midpoint | “Trade only when fair value exceeds executable price by …” |
| Spot/reference source | Oracle-follow depends on the underlying, while the market row may not carry it | “Underlying source: Somnia feed / Binance spot; source age …” |
| Time-to-expiry cutoff | A late order can become unresolvable or leave no exit window | “Stop opening positions with … seconds left” |
| YES/NO inventory cap | Buying NO is not the same as selling BTC/ETH; it is probability exposure | “Max YES contracts / max NO contracts / net event exposure” |
| Claim policy | Settled positions do not necessarily return collateral without an explicit claim | “Auto-claim settled markets” and “Claim backlog” |
| Venue/market scope | One deployment may contain several venues and short-lived windows | “Selected venue and market IDs” with a stale-market warning |

The probability surface should include a cross-window strip for BTC/ETH: price each expiry/strike on one chart, flag missing monotonicity or complementary-outcome inconsistencies, and surface stale quotes. This is an analysis alert, not an automatic-arbitrage promise; every alert must show executable prices, size, and data age.

### 3.3 Backtest, shadow, and tuning loop

The workflow should be:

`configure → validate → backtest → compare → shadow on live book → canary → live`

Use three explicit data-quality levels:

| Level | Data | Product promise |
| --- | --- | --- |
| Quick | OHLCV/candles and synthetic spread | Fast directional screen; not a fill-quality estimate |
| Execution | Recorded order-book snapshots, fills, depth, queue/latency assumptions | Approximate execution and maker markout |
| Audit | On-chain order/fill/settlement events with exact market lifecycle | Reproducible post-trade and settlement accounting |

Every report must display source, date range, resolution, spread model, fees, slippage, queue model, latency, gas model, and whether market resolution was observed or simulated. The official DreamDEX backtester explicitly documents synthetic-book and no-gas limitations, so hiding these fields would create false confidence. [S2](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/backtesting.md)

Minimum report metrics:

- Net PnL and return after spread, fees, slippage, gas, and settlement/claim effects.
- Max drawdown, downside volatility, Sharpe-like risk-adjusted return, profit factor, win rate, and average trade.
- Fill rate, maker/taker split, average queue/latency assumption, markout, adverse-selection cost, and transactions per fill.
- Peak and average event exposure, YES/NO inventory, expiry cutoff exits, forced exits, rejected orders, and unresolved/claimable collateral.
- Per-market and per-bot attribution plus a benchmark such as passive hold or a no-trade baseline.
- For probability models: calibration curve, Brier score, and confidence buckets. These measure forecast quality; they are not a promise of profitability.

Tuning should support bounded parameter sweeps and walk-forward validation. The UI should show the best result and the distribution of results, not only the single highest backtest PnL. Hyperparameter optimization is useful only when the search space, objective, data window, and out-of-sample period are visible. [S18](https://www.freqtrade.io/en/stable/hyperopt/)

### 3.4 Fleet and portfolio controls

Five parallel bots are a differentiator only if the fleet has a shared risk budget. Add:

- One capital ledger: available, reserved by open orders, committed by positions, and unallocated.
- Per-bot and global caps for notional, contracts, market exposure, and loss.
- Per-underlying caps so five BTC windows do not look like five independent risks.
- Conflict detection: warn when two bots trade the same market in opposite directions or when a maker and taker strategy compete for the same inventory.
- A fleet-wide rolling transaction/contract budget modeled after Kalshi order groups, implemented locally unless DreamDEX adds a protocol-level primitive. [S23](https://docs.kalshi.com/getting_started/order_groups)
- One nonce queue per signer, backpressure, retry/resync, and a visible pending-transaction count. [S3](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/24-7-operations.md)
- Global pause, per-bot pause, cancel-all, reduce-only/flatten, and “resume only after acknowledgement.”
- Fleet health: uptime, last data event, feed age, WebSocket reconnect count, last successful chain reconciliation, gas reserve, and last decision.
- Shared market-data subscriptions with isolated strategy state; data fan-out must not multiply network load per bot.

Fleet cards should show realized/unrealized PnL, drawdown, exposure by underlying and expiry, open orders, fills, rejects, current regime, and a link to the decision log. Hummingbot's multi-bot and Condor documentation is a useful benchmark for independent PnL, status, logs, and portfolio views. [S6](https://hummingbot.org/dashboard/) [S13](https://condor.hummingbot.org/introduction)

### 3.5 Security and live execution

The Live step must be a preflight gate, not a generated environment block alone. It should verify:

1. Wallet/operator identity and network match.
2. Operator permissions are scoped to the target pool/market and can be revoked.
3. Market is on-chain `Trading`, target venue matches, and the row is fresh.
4. Prices and sizes are quantized to current ticks/lots and pass minimums.
5. Orders have a future expiry no later than market expiry.
6. Wallet or vault balances cover the order plus gas reserve.
7. Transaction simulation succeeds; post-broadcast receipt and event logs will be reconciled.
8. Global, underlying, market, and bot risk budgets have room.
9. Data feeds are connected and within a configured freshness threshold.
10. The user has reviewed the exact config version and canary size.

The hosted UI should never ask for a raw funded private key. Prefer wallet signing for interactive use and the DreamDEX operator/session-key model for unattended use. [S4](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/skills/dreamdex-bot/SKILL.md) [S5](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/session-keys.md)

Recommended lifecycle labels:

`Draft → Validated → Backtested → Shadowing → Canary → Live → Paused → Settling → Claim required → Stopped`

The labels should be stateful and actionable. For example, `Claim required` should link to a claim sweep, while `Paused: stale book` should show the data-age threshold and a resume check.

### 3.6 Explainability and audit

For every simulated or live action, store:

- Config version/hash and template version.
- Market ID, venue, market status, source timestamps, book snapshot, spot/reference value, and time-to-expiry.
- Inputs/signals and the rule that fired.
- Intended order, quantized order, risk checks, simulation result, transaction hash, receipt status, and fill(s).
- Why the bot held, skipped, canceled, paused, or claimed.

Add a “Why this trade?” drawer and an exportable JSON/CSV run bundle. Condor's documentation makes replayable decisions and separation of reasoning from deterministic execution a product feature; DreamCat can provide the same trust benefit with deterministic strategy explanations even without an LLM. [S13](https://condor.hummingbot.org/introduction)

### 3.7 Natural-language and visual strategy authoring

After typed templates are stable, add a constrained recipe builder:

`WHEN [market/spot/book/flow/time condition] AND [risk condition] → [buy YES/buy NO/quote/cancel/claim/pause]`

The builder must compile to a typed, reviewable config. Natural-language input may draft a recipe, but it must show the generated conditions, bounds, and data sources and require human approval before any live action. This follows the useful part of Condor's routine authoring—zero-code routine creation—without giving a language model an unbounded order primitive. [S15](https://condor.hummingbot.org/routines/overview)

## 4. Differentiation roadmap

| Priority | Capability | Why it beats a config exporter | Evidence of done |
| --- | --- | --- | --- |
| P0 | Four-step parity wizard and export | Removes adoption friction for users already familiar with DreamBot Builder | A trader can create, validate, save, copy/download, and run a versioned config in Dry-run |
| P0 | All six EC templates plus existing spot templates | Matches DreamDEX's own strategy vocabulary and makes the domain explicit | Template cards expose inputs, exits, supported mode, and risk |
| P0 | Event market picker and typed config schema | Prevents wrong venue, expired market, wrong symbol, and spot/event parameter confusion | Config stores market IDs, venue, strike/reference, expiry, tick/lot metadata, and status |
| P1 | Preflight, session/operator key, expiry/claim lifecycle, global kill switch | Makes live trading safer and operationally honest | Invalid status/size/expiry/data-age/balance blocks Live; canary and cancel-all are testable |
| P1 | Execution-aware event backtest and shadow mode | Turns sliders into evidence rather than decoration | Report shows data provenance, costs, depth/queue assumptions, fill quality, and out-of-sample result |
| P1 | Fair-probability, spot/reference, flow, and cross-window analysis | Gives BTC/ETH event traders information that a generic spot bot builder cannot provide | Every signal shows source, age, edge vs executable price, and uncertainty |
| P1 | Shared fleet risk allocator | Makes five bots behave as a portfolio instead of five independent demos | Global/underlying/market/bot caps and conflict warnings are enforced in tests |
| P2 | Decision replay and audit bundle | Lets traders understand and debug behavior days later | Any action can be replayed from stored inputs/config and linked to chain evidence |
| P2 | Versioned configs, staged rollout, compare/rollback | Makes iteration safe and reproducible | Config diff, immutable run ID, canary promotion, rollback to prior version |
| P2 | Risk-adjusted public leaderboard and clone | Improves on PnL-only social proof | Rank by net PnL plus drawdown, exposure, sample size, and data provenance; clone preserves version |
| P3 | Constrained recipe/AI assistant | Broadens access without making live execution opaque | Natural-language draft compiles to typed rules and always passes the same preflight |
| P3 | Strategy marketplace / signed manifests | Creates an ecosystem around reproducible research | Public manifest contains code/template version, parameter ranges, test windows, and risk disclosures |

## 5. Phased implementation plan

### Phase 0 — parity shell

- Unify Strategy Lab and Fleet Deck around a versioned `BotConfig`.
- Add the four-step wizard, Spot/Event toggle, all visible parity templates, Testnet/Mainnet, Dry-run/Live labels, and Copy/Download config output.
- Keep Dry-run as the default and clearly label the current product as paper-only until the signed path is implemented.
- Add a config summary, advanced-default disclosure, validation errors, and save/clone/rename.

### Phase 1 — event correctness and safety

- Add event-market metadata and dynamic venue/market IDs.
- Add tick/lot/minimum validation, status gating, expiry cutoff, balance/gas checks, simulation/receipt checks, and claim backlog.
- Add per-bot/global loss, exposure, transaction-rate, stale-feed, repeated-error, and gas circuit breakers.
- Add operator/session-key setup guidance and a canary checklist.

### Phase 2 — trader research loop

- Add quick OHLCV screen, recorded-depth replay, and on-chain audit replay as separate modes.
- Add costs, queue/latency, markout/adverse-selection, event settlement, and the metrics listed above.
- Add parameter sweeps, walk-forward windows, benchmark comparison, live shadow mode, and exportable reports.

### Phase 3 — fleet advantage

- Add shared capital/reservation ledger, correlated exposure by underlying/expiry, conflict detection, nonce serialization, feed fan-out, and fleet-wide kill/pause.
- Add portfolio and per-bot health cards, decision logs, searchable errors, and alert hooks.
- Add cross-window probability strip, fair-value/spot/reference signals, and flow-conditioned rules with source labels.

### Phase 4 — ecosystem and compounding edge

- Add immutable config versions, diff/rollback, signed strategy manifests, risk-adjusted leaderboard, clone-with-provenance, and private/public sharing.
- Add constrained recipe/AI authoring, human approval, and replayable “why” explanations.
- Consider remote routines/notifications only after the execution and audit model is reliable.

## 6. Anti-patterns to avoid

- Do not ship a single “best backtest” number without data provenance, costs, fill assumptions, and out-of-sample results.
- Do not treat a synthetic OHLCV book as historical CLOB truth; the official DreamDEX backtester explicitly distinguishes the two. [S2](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/backtesting.md)
- Do not expose spot-only controls on event contracts or describe YES/NO flow as buying/selling BTC/ETH.
- Do not let a slow indexer, stale WebSocket, or client-side market status authorize a live order.
- Do not use raw floating-point probability/quantity values where the venue requires integer ticks/lots.
- Do not let each bot maintain its own uncoordinated nonce, capital, transaction-rate, or kill-switch policy.
- Do not make Live the default, auto-promote a canary, or bury advanced risk defaults.
- Do not use PnL-only leaderboards; small samples and unbounded exposure are not comparable.
- Do not add a generic drag-and-drop canvas before typed recipes, versioning, simulation, and audit are correct.

## 7. Acceptance checklist for the builder

- A new user can select an EC market, configure a template, see a readable effective config, and start a Dry-run without a key.
- The same config can be assigned to one bot or several fleet slots without duplicating or losing risk limits.
- A live candidate is blocked when network, status, venue, data age, tick/lot, expiry, balance, gas, or simulation checks fail.
- Every report states source, time range, resolution, spread, fees, slippage, queue/latency, gas, and settlement assumptions.
- Backtest, shadow, canary, and live actions display the same strategy decision inputs and explain why an order was or was not emitted.
- Fleet allocation and correlated exposure never exceed configured limits, including reserved open orders.
- A stale/disconnected feed pauses entry, cancels or lets orders expire according to policy, and surfaces a recovery action.
- Stopping a bot is observable: pending orders, cancel requests, fills, and final state are reconciled rather than assumed.
- Settled positions appear in a claim queue and are not silently counted as available cash until claimed/reconciled.
- Configs are versioned, cloneable, diffable, and recoverable; public sharing exposes risk and provenance.
- Live mode uses wallet signing or a scoped operator/session key; the hosted app never stores a raw funded private key.

## 8. Source index

- **S1** — [DreamDEX Bot Kit: Event contracts](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/event-contracts.md)
- **S2** — [DreamDEX Bot Kit: Backtesting strategies](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/backtesting.md)
- **S3** — [DreamDEX Bot Kit: Running a bot 24/7](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/24-7-operations.md)
- **S4** — [DreamDEX Bot Kit skill: order types and gotchas](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/skills/dreamdex-bot/SKILL.md)
- **S5** — [DreamDEX Bot Kit: Session keys](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/session-keys.md)
- **S6** — [Hummingbot Dashboard](https://hummingbot.org/dashboard/)
- **S7** — [Hummingbot Dashboard: Backtesting strategies](https://hummingbot.org/dashboard/backtest/)
- **S8** — [Hummingbot Client: Paper trade](https://hummingbot.org/client/global-configs/paper-trade/)
- **S9** — [Hummingbot Client: Kill switch](https://hummingbot.org/client/global-configs/kill-switch/)
- **S10** — [Hummingbot Client: Balance limit](https://hummingbot.org/client/global-configs/balance-limit/)
- **S11** — [Hummingbot Client: Rate limits](https://hummingbot.org/client/global-configs/rate-limits-share-pct/)
- **S12** — [Hummingbot Client: Market data collector](https://hummingbot.org/client/global-configs/data-collector/)
- **S13** — [Condor: Introduction and architecture](https://condor.hummingbot.org/introduction)
- **S14** — [Condor: Web dashboard](https://condor.hummingbot.org/getting-started/web-dashboard)
- **S15** — [Condor: Routines](https://condor.hummingbot.org/routines/overview)
- **S16** — [Condor: Bots overview](https://condor.hummingbot.org/bots/overview)
- **S17** — [Freqtrade: Pairlists and protections](https://docs.freqtrade.io/en/stable/plugins/)
- **S18** — [Freqtrade: Hyperopt](https://www.freqtrade.io/en/stable/hyperopt/)
- **S19** — [Freqtrade: Strategy callbacks](https://docs.freqtrade.io/en/stable/strategy-callbacks/)
- **S20** — [Polymarket: Prices and orderbook](https://docs.polymarket.com/concepts/prices-orderbook)
- **S21** — [Polymarket: Order lifecycle](https://docs.polymarket.com/concepts/order-lifecycle)
- **S22** — [Polymarket: Market making](https://docs.polymarket.com/trading/market-making)
- **S23** — [Kalshi: Order groups](https://docs.kalshi.com/getting_started/order_groups)
- **S24** — [Kalshi: Market lifecycle](https://docs.kalshi.com/getting_started/market_lifecycle)
- **S25** — [Bitsgap: Advanced COMBO Bot settings](https://bitsgap.com/helpdesk/article/10043546796572-Advanced-COMBO-Bot-Settings)
- **S26** — [Bitsgap: Trading bots](https://bitsgap.com/helpdesk/category/18694705034780-Trading-Bots)
- **S27** — [Binance: Spot WebSocket market streams](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams)
