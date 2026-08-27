# Bloomberg Terminal feature research for DreamCat

Research date: 2026-08-27

## Scope

This note studies publicly documented Bloomberg workflows and identifies ideas that can be adapted to DreamCat's BTC/ETH event-contract terminal. It is product research, not an implementation specification. Sources are Bloomberg-owned pages and publications. Feature adaptations are inferences; Bloomberg does not publish every authenticated Terminal function, formula, or internal API.

## Executive conclusion

Bloomberg's main advantage is not a single chart or dataset. It connects discovery, monitoring, news, analytics, risk, execution, and review around the same selected instrument. DreamCat already has useful single-market tools: live market discovery, charting, order-book and tape views, manual orders, spot order flow, strategy simulation, a strategy copilot, parallel bot fleets, news, and cross-venue context. Its most important missing layer is the connective workflow around those tools.

The most relevant additions are:

1. A configurable Market Monitor with saved Event Worksheets.
2. A unified Alert Manager that opens the market in full context.
3. An account blotter and portfolio-risk view.
4. A relative-value surface across related strikes and expiries.
5. Pre-trade liquidity estimates and post-trade execution review.
6. A keyboard command palette that links the whole product.

Saved free-form dashboard layouts, social messaging, enterprise research management, and broad cross-asset coverage are less valuable at the current stage.

## What Bloomberg provides

### 1. Launchpad and Worksheets: one linked workspace

Bloomberg Launchpad combines dynamic security monitors, alerting, charting, and market-moving news in a customizable workspace. Worksheets monitor lists of securities with related real-time changes, events, research, news, and charts. Bloomberg also maintains a library of reusable worksheet templates. Sources: [Bloomberg Terminal overview](https://professional.bloomberg.com/products/bloomberg-terminal/), [Worksheets and Launchpad](https://professional.content.cirrus.bloomberg.com/professional2023/insights/technology/bloomberg-terminal-essentials-ib-worksheets-launchpad/), and [Worksheet Sample Library](https://professional.content.cirrus.bloomberg.com/professional2023/insights/markets/bloomberg-pro-tips-accelerate-your-analysis-with-wsl/).

The useful lesson is linked context. Selecting an instrument should update the chart, book, flow, news, strategy, risk, and order ticket together. A saved view should preserve the user's market list, columns, filters, and alert rules.

DreamCat adaptation: an **Event Worksheet** for a chosen BTC or ETH universe, showing YES/NO prices, implied probability, probability change, spread, top-of-book depth, volume, time to expiry, strike distance, provenance, and alert state. Clicking a row should set the market context across the terminal.

### 2. Discovery, screening, and market maps

Bloomberg's published discovery workflows include equity screening, watchlist analytics, relative valuation, intraday market maps, multi-instrument charts, and index monitors. [Bloomberg's equities function guide](https://professional.content.cirrus.bloomberg.com/professional2023/insights/technology/bloomberg-terminal-essentials-best-equities-functions/) highlights EQS, WATC, RV, IMAP, WEI, and related functions; [Bloomberg Chart Tools](https://professional.bloomberg.com/products/bloomberg-terminal/charts/) describes multi-instrument comparison, custom studies, annotations, backtesting, and scenario optimization.

DreamCat adaptation:

- Search and filter by asset, strike, expiry, creator, venue, status, liquidity, spread, volume, and probability.
- Save named watchlists and column layouts.
- Add an asset × strike × expiry probability surface or heatmap.
- Flag logical inconsistencies, such as unusual probability ordering across nested strikes or adjacent expiry windows.
- Compare related markets with probability spread, rolling divergence, liquidity, and time-to-expiry normalized metrics.

This is a better fit than adding more isolated charts because the market-universe layer already contains much of the necessary metadata.

### 3. Alerts that lead to action

Bloomberg supports configurable market and event monitoring, while its news products let users tailor alerts and inspect attention, sentiment, and news velocity. Bloomberg's event-driven data products also expose structured events and sentiment-related signals. Sources: [Bloomberg News](https://professional.bloomberg.com/products/bloomberg-terminal/news/) and [Event-Driven Feeds](https://professional.bloomberg.com/products/data/enterprise-catalog/event-driven-feeds/).

DreamCat adaptation: one **Alert Manager** with rules for:

- Probability crossing a level or moving by a configured amount.
- Spread widening, depth thinning, or imbalance becoming extreme.
- Spot price approaching or crossing a market strike.
- Time-to-expiry entering a risk window.
- Spot aggressor-flow or event-contract tape-flow regime changes.
- Related-market parity or relative-value deviations.
- Large prints, market lifecycle changes, or resolution/claim availability.
- News bursts associated with BTC or ETH.

Every alert should include its trigger value, source, timestamp, severity, cooldown, and an action that opens the relevant market with its chart, book, news, and risk context. Deduplication and a historical alert ledger are more useful than transient toast notifications.

### 4. News and research tied to the instrument

Bloomberg integrates comprehensive news, curated top stories, breaking-news digests, overnight briefings, security-list reports, attention measures, and sentiment/velocity analysis. Its research offering consolidates third-party and proprietary research in one environment. Sources: [Bloomberg News](https://professional.bloomberg.com/products/bloomberg-terminal/news/) and [Bloomberg Research](https://professional.bloomberg.com/products/bloomberg-terminal/research/).

DreamCat adaptation: attach a timeline of relevant news and market events to the selected contract, then show observed probability, spread, depth, and spot-price changes around each timestamp. The product should describe this as co-movement or market response, not proof that a story caused the move.

A scheduled briefing could summarize:

- What changed since the previous session.
- Which contracts moved most.
- Which spreads or liquidity conditions deteriorated.
- Which bots are exposed.
- Which alerts fired and remain unresolved.

### 5. AI with attribution and reproducibility

Bloomberg's ASKB conversational interface spans data, news, documents, research, and analytics. Bloomberg emphasizes source attribution, exposes the underlying BQL for data analysis, and supports reusable, schedulable workflows. Source: [Bloomberg AI and ASKB](https://professional.bloomberg.com/products/bloomberg-terminal/ai/).

The relevant pattern for DreamCat's strategy copilot is not merely chat. The assistant should:

- Cite the market snapshot and timestamps used.
- Distinguish facts, calculations, assumptions, and suggestions.
- Show the exact strategy-field diff before applying it.
- Produce a reproducible strategy spec alongside the explanation.
- Never enable live execution or place an order.
- Let the user save a multi-step analysis workflow and rerun it later.

The current proposal-and-apply copilot interaction already moves in this direction. The next research target should be grounding responses in selected-market data and dry-run results, with explicit provenance.

### 6. Portfolio, risk, and scenarios

Bloomberg PORT unifies positions, exposure, performance, attribution, construction, and scenario analysis. Bloomberg MARS and Capital Markets Risk extend this into intraday risk, valuation, shocks, limits, and exception reporting. Sources: [Bloomberg PORT](https://professional.bloomberg.com/products/bloomberg-terminal/portfolio-analytics/), [Bloomberg MARS](https://professional.bloomberg.com/products/risk/mars/), and [Capital Markets Risk](https://professional.bloomberg.com/solutions/sales-trading/capital-markets-risk/).

DreamCat does not need institutional factor models. Binary contracts allow a smaller, more interpretable risk surface:

- Cash, reserved cash, open orders, positions, realized P&L, unrealized P&L, and claimable winnings.
- Worst-case loss if every open event resolves adversely.
- Exposure by underlying, expiry window, direction, creator, and strategy.
- Concentration and bankroll utilization.
- Correlated exposure to similar or logically nested outcomes.
- Drawdown and loss-limit usage across the fleet.
- Scenario P&L under probability shocks, spot moves, wider spreads, lower depth, partial fills, and delayed exits.

This should be calculated deterministically. AI can explain the result but should not be the risk engine.

### 7. Relative value and multi-leg analysis

Bloomberg's listed-trading workflow supports pair trades, ratios, spreads, multi-leg instructions, and leg-risk controls. Its fixed-income worksheets combine pricing, performance, relative-value, and liquidity analysis across instrument lists. Sources: [Bloomberg Listed Trading](https://professional.bloomberg.com/products/trading/electronic-markets/listed/) and [PORT/FIW workflow](https://www.bloomberg.com/professional/insights/trading/evaluate-portfolio-trades-efficiently-with-port-and-fiw/).

This maps unusually well to prediction markets:

- YES and NO parity checks after fees and spread.
- The same underlying across different strikes.
- The same strike across different expiries.
- Logically nested events whose probabilities should be ordered.
- BTC versus ETH event baskets when the thesis is relative rather than directional.

A relative-value board should show divergence, liquidity on both legs, estimated combined slippage, partial-fill risk, and an unwind plan. Any multi-leg execution should begin in dry-run mode because atomic execution may not be available.

### 8. Pre-trade and post-trade analytics

Bloomberg's trade analytics cover price discovery, liquidity, risk checks, pre-trade analysis, transaction-cost analysis, and post-trade review. BTCA aims to explain what an execution cost and why, using benchmarks and cost attribution. Sources: [Bloomberg Trade Analytics](https://professional.bloomberg.com/products/trading/trade-analytics/) and [Bloomberg BTCA](https://professional.bloomberg.com/products/trading/trade-analytics/btca/).

DreamCat adaptation:

Before an order:

- Spread and visible depth.
- Estimated average fill price and slippage from the current book.
- Order size as a percentage of visible opposing depth.
- Partial-fill and time-to-expiry warnings.
- A simple fillability grade, with the assumptions exposed.

After an order or dry run:

- Arrival price versus fill price.
- Effective spread and slippage.
- Fill ratio and time to fill.
- Markout after fixed horizons.
- Spread capture for maker strategies.
- Adverse selection, missed fills, cancellations, and opportunity cost.
- A comparison against the strategy's own stated objective.

This feedback should feed the next strategy review. It is more useful than reporting P&L alone.

### 9. Command-driven navigation

Bloomberg uses mnemonics, autocomplete, menus, and function search to make a very broad system navigable. Bloomberg's educational material treats this command model as a core workflow. Sources: [Terminal Essentials: Getting Started](https://professional.content.cirrus.bloomberg.com/professional2023/insights/technology/bloomberg-terminal-essentials-getting-started/) and [Bloomberg Market Concepts](https://professional.bloomberg.com/products/bloomberg-terminal/education/certificate-courses/).

DreamCat adaptation: a `Cmd/Ctrl-K` palette with both descriptive search and short aliases:

- `MKT` markets
- `BOOK` order book
- `RV` relative value
- `ALRT` alerts
- `PORT` portfolio and risk
- `NEWS` intelligence
- `SIM` strategy rehearsal
- `FLEET` bot fleet

Natural language can resolve to a visible command or configuration proposal, but trading actions should remain explicit and confirmed.

### 10. Execution controls and auditability

Bloomberg's execution and order-management products emphasize auditable workflows, conditional release, risk controls, compliance, integrations, and post-trade processing. Its automation tooling supports manual, batch, conditional, or automated rule evaluation. Sources: [Execution Management](https://professional.bloomberg.com/products/trading/execution-management-system/), [AIM](https://professional.bloomberg.com/products/trading/order-management-system/aim/), and [Bloomberg Trade Automation](https://professional.bloomberg.com/products/trading/automation/).

DreamCat adaptation: an account-level order blotter with an immutable event history, clear dry-run/live separation, conditional paper orders, per-bot and global loss limits, a kill switch, orphan-order recovery, and explicit user approval for any transition toward live execution.

## DreamCat capability gap

| Workflow | Current state | Main gap |
|---|---|---|
| Single-market analysis | Strong: chart, drawings, book, tape, spot flow | Panels are not yet part of a persistent linked workspace |
| Market discovery | Live aggregated market list and rich indexed metadata | Limited filtering, sorting, saved columns, watchlists, and comparison |
| Manual execution | Market/limit order ticket and cancel flow | No account-wide open-order, fill, position, or claim blotter |
| Strategy creation | Six archetypes, parameter controls, dry run, copilot | No historical replay; AI is not yet grounded in full market/run evidence |
| Bot automation | Parallel fleet, capital allocation, paper/live modes, logs | Limited portfolio-level risk, scenarios, and execution-quality attribution |
| Intelligence | News, large Binance prints, cross-venue cards | News is not linked to contract timelines, alerts, or saved coverage lists |
| Risk | Per-strategy controls and fleet equity | No consolidated exposure, concentration, worst-case resolution, or stress view |
| Workflow/navigation | Route navigation and selected-market context | No global command palette, saved worksheets, or alert ledger |

## Ranked recommendations

| Rank | Feature | Trader value | Effort | Data feasibility | Recommendation |
|---:|---|---|---|---|---|
| 1 | Market Monitor + saved Event Worksheets | Very high | Medium | High | Build first |
| 2 | Alert Manager + historical ledger | Very high | Medium | High | Build with Monitor |
| 3 | Account blotter + portfolio risk | Very high | Medium | High | Build next |
| 4 | Pre/post-trade execution analytics | High | Medium | High | Build incrementally |
| 5 | Relative-value and consistency scanner | High | Medium-high | Medium-high | Strong differentiator |
| 6 | Fair-value and scenario panel | High | Medium | High for deterministic inputs | Build before richer AI advice |
| 7 | Global command palette | Medium-high | Low-medium | High | Quick workflow win |
| 8 | News-to-market timeline and briefing | Medium-high | Medium | Medium-high | Build after alerts |
| 9 | Historical replay/backtest | High | High | Medium-low until history is reliable | Important, but data-dependent |
| 10 | Free-form saved dashboard layouts | Medium | Medium-high | High | Defer; saved worksheets are enough initially |

## Suggested sequence

### Phase 1: monitoring foundation

- Expand the current market table into a sortable, filterable Market Monitor.
- Add saved watchlists and column presets.
- Add a global command palette.
- Establish one selected-market context shared by terminal, intelligence, and lab.

### Phase 2: proactive terminal

- Add the Alert Manager and alert ledger.
- Link alerts and news to the market timeline.
- Add account-wide orders, fills, positions, balances, and claims.

### Phase 3: decision quality

- Add deterministic pre-trade slippage and risk estimates.
- Add post-trade execution review.
- Add portfolio scenarios and worst-case resolution analysis.

### Phase 4: differentiated analytics

- Add a strike/expiry probability surface.
- Add relative-value and logical-consistency scans.
- Ground the strategy copilot in cited market snapshots, alerts, and run results.
- Add historical replay once trustworthy history is available.

## What not to copy yet

- Bloomberg-scale messaging and professional social networking: network effects are the product and cannot be reproduced with UI alone.
- Enterprise compliance, reconciliation, and regulatory reporting: important for institutions, premature for a testnet-focused product.
- Broad multi-asset analytics: BTC/ETH event contracts benefit more from depth than breadth.
- An unrestricted AI trading agent: it weakens auditability and introduces unacceptable execution risk.
- Fully free-form Launchpad layouts: saved, opinionated worksheets will deliver most of the value with less complexity.
- Opaque scores: fair value, fillability, risk, and alert severity should expose their inputs and formulas.

## Research takeaway

The most Bloomberg-like move is not to add more panels. It is to make existing information reusable, linked, proactive, and auditable. DreamCat can differentiate by applying that workflow to event contracts: a monitor that discovers relationships, alerts that preserve context, deterministic binary-risk scenarios, execution feedback, and an AI assistant that explains and proposes without silently acting.
