# Brag Plan: DreamCat Terminal

## What is this app?
A Bloomberg-grade trading terminal and AI "cat fleet" for DreamDEX binary Event Contracts — BTC/ETH "above a strike when the window closes" prediction markets — on the Somnia Shannon testnet. You read the live order book yourself, or hand it to a fleet of up to five strategy "cats" that paper-trade the live book for you.

## The angle
A cinematic product-launch film for a hackathon submission. Not a joke — a confident, premium fintech reveal. The spine is one idea: **"Trade the probability, not the price."** Every event contract asks a single yes/no question and pays a dollar to whoever is right. The film walks the full protocol UX end to end — Terminal, the six cats, Lab, Fleet, Leaderboard, Intel, lifecycle — narrated, with real product screens the whole way. It feels like a Bloomberg terminal that happens to be run by cats.

## Hook (first 2-3 seconds)
Black canvas, amber glow. The DreamCat mark draws in and the line lands: **"Trade the probability, not the price."** Narration opens on the one question every market asks.

## Key moments (the middle)
- The six cats deal in one by one — each a real avatar with its name and strategy role.
- The Lab: parameter sliders tune a cat, then "Start dry run" — it paper-trades the live book, nothing signed.
- The Fleet Deck running live: four cats scanning their own windows, capital-allocation bar, equity line drawing.
- Intel's cross-venue divergence: the same question priced on another venue, side by side.

## Outro / punchline
Return to the mark. "Six cats. Five screens. One signal." → "The window is already open." → Somnia × DreamDEX Event Contracts Hackathon.

## User flow worth showing
entry → key action → result, shown with real screens:
1. Read the book on the **Terminal** (candles, order book, manual YES/NO order).
2. Tune a cat and **dry-run** it in the **Lab** against the live book.
3. **Deploy** up to five cats on the **Fleet Deck**; watch equity build; **clone** a proven run from the **Leaderboard**.

## Tone
- Preset: cinematic
- Creative direction: premium fintech launch film — a Bloomberg terminal run by cats
- Interpretation: wide shots, big display type, dramatic but restrained reveals, confident pacing driven by the narration. Motion is smooth (transform/opacity, terminal easing), never frantic. Every product screen gets room to breathe.

## Format: landscape — 1920x1080
## Duration: target ~165s (150–180s window; voiceover sets the final pace)

## Visual identity (from the project)
- Background: #090d13 (canvas); panels #0e141d / #131b26 / #192331
- Accent: #f2b84b (brand amber); eye-yellow #f5de3c; up #3fd39a; down #f2747c
- Text: #f2f5f7 (text-1), #a5b0bf (text-2), #718093 (text-3)
- Hairline: rgba(218,226,236,0.12); cream #fbf8e8; ink #0b0b0b
- Display font: Bricolage Grotesque (headline) / Space Grotesk (display); Body: system sans; Data/numerals: JetBrains Mono (tabular, class `num`)
- Strongest visual element: the live candlestick hero with cats sitting on the baseline; the double-bezel dark panels; the amber signal-field radial glow.

## Share copy (draft)
Trade the probability, not the price. DreamCat is a Bloomberg-grade terminal for BTC/ETH event contracts on @Somnia — read the book yourself, or deploy a fleet of six strategy cats that read it for you. 🐱📈 #DreamDEX

## Audio direction
- Role: cinematic support bed, ducked hard under a wall-to-wall voiceover.
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (2:44 — long enough to cover the film without a loop seam; confident, launch-y).
- Music treatment: start at 0, bed volume 0.30 in the open/outro gaps, ducked to 0.12–0.14 under narration; soft fade-in over the first ~1.5s and fade-out under the final logo.
- Music cue guidance: bundled preset for vol-1 if present (`assets/music/cues/…vol-1….music-cues.json`); lock the S1 title reveal and the S10 logo landing to the two nearest strong cues; otherwise natural timing. Sequential cat reveals (S4) follow the narration cadence, not the beat grid — hold each name.
- Audio-reactive treatment: subtle; let the amber signal-field glow and the brand mark breathe with RMS. No waveform/equalizer graphics.
- SFX posture: sparse and cinematic — a soft impact on each scene reveal, card-slide on the six cat deals, a bell on the logo landing and the "clone" payoff. All 0.5–0.7.
- Audio-coupled moments: per-scene VO clips drive each scene's length; cat cards deal to card SFX; lifecycle stages tick in; CTA/logo lands on a bell.
- Restraint rule: music never competes with the voice; no busy percussion under narration; no strobing.

## Voiceover
- Provider: Kokoro via `npx hyperframes tts`, voice `af_heart`.
- Production: one WAV **per scene** (`assets/vo/s1.wav` … `s10.wav`), each measured with ffprobe; **each scene's duration is set to its VO clip length + a small tail** so voice and animation stay locked in sync. Music ducks for the full span of each clip.

## Voiceover script
(Proofread — no grammatical errors. "Ether" = ETH.)

- **S1 — Cold open:** "On DreamDEX, every market asks one question: will Bitcoin or Ether be above a strike when the window closes? Get it right, and you are paid a dollar. This is the terminal built to answer it."
- **S2 — Landing / what it is:** "Meet DreamCat — a Bloomberg-grade terminal for binary event contracts on Somnia. Read the book yourself, or hand it to a fleet of cats that read it for you."
- **S3 — Terminal:** "The Terminal is the entire book for a single contract. Live bids and asks, candlesticks with drawing tools, moving averages and RSI. And when you have your own read, you place an order — buy YES or NO, straight from your wallet, on the only venue that settles it."
- **S4 — The six cats:** "But you do not have to watch the book alone. Six cats, six strategies. Whiskers trades the imbalance. Pounce chases the tape. Luna fades the crowd. Fairy prices the contract from scratch. Theta rides the clock. And Mittens quotes both sides for the spread."
- **S5 — Strategy Lab:** "The Lab is where a cat earns your trust. Pick one, tune its edges — entry signal, sizing, take-profit, stop, and hold time — then start a dry run. It paper-trades the live book in real time. Nothing is signed until you are convinced."
- **S6 — Fleet Deck:** "When they are ready, deploy them together on the Fleet Deck. Up to five cats, each with its own window and its own slice of capital, trading side by side. They keep working the book in the background while you move around the app — on paper, or for real."
- **S7 — Leaderboard:** "Every run can be published to a shared leaderboard, ranked by real profit and loss. See a strategy that is working? Clone it into your own fleet in a single click."
- **S8 — Intel Hub:** "And the Intel Desk gives you the context the order book cannot. Headlines with a bullish or bearish read, whale prints as they cross, and the same questions priced on other venues — so you can see exactly where the market disagrees."
- **S9 — Lifecycle:** "Unlike spot, every contract has an ending. It trades, the window closes, the oracle resolves it — and your winnings wait on the contract until you claim them."
- **S10 — Outro / CTA:** "Six cats. Five screens. One signal. DreamCat — the window is already open. Built on Somnia, for the DreamDEX Event Contracts Hackathon."

## Storyboard

### Scene 1 — Cold open (logo + thesis) — ~14s
Deep canvas with amber signal-field radial glow. The DreamCat brand mark scales/draws in center; kicker "BINARY EVENT CONTRACTS · SOMNIA SHANNON"; the line "Trade the probability, not the price." resolves (amber on "not the price."). Faint candlesticks ghost in behind.
Sequential/interaction: none (single hero reveal).
Audio intent: a held breath, then a soft cinematic impact as the mark lands; music fades in low.
Audio-coupled idea: bell/impact on mark landing; VO s1 drives length.
Music: cinematic bed, low. Beat-lock the title to a strong cue if available.
Transition mood: dramatic crossfade → Scene 2

### Scene 2 — Landing / what it is — ~12s
The real landing hero frame settles into a soft browser frame (candles + cats + "Trade the probability, not the price."). Ticker-tape strip glimmer at the base.
Sequential/interaction: none.
Audio intent: warm arrival.
Audio-coupled idea: soft impact on frame settle.
Music: bed ducks as VO s2 starts.
Transition mood: clean wipe → Scene 3

### Scene 3 — Terminal — ~22s
Real terminal frame. Slow Ken-Burns push-in on the candlestick chart, then a lateral reveal of the manual order panel (BTC/ETH, Buy/Sell, YES/NO, Limit/Market). Three callout chips slide in on cue: "Live order book" · "Candles + indicators" · "Order from your wallet".
Sequential/interaction: yes — 3 callout chips arrive one by one (~0.9s apart), held to end of scene.
Audio intent: focused, precise.
Audio-coupled idea: soft click/drop per chip.
Music: ducked under VO s3.
Transition mood: cinematic wipe → Scene 4

### Scene 4 — The six cats — ~20s
Dark stage. "Six cats. Six ways to be right." Six real cat avatars deal in one by one, each as a card: avatar + name + role (Whiskers/Maker, Pounce/Momentum, Luna/Fade, Fairy/Fair value, Theta/Theta decay, Mittens/Market maker). Avatars must match `lib/cats.ts` exactly.
Sequential/interaction: yes — 6 cat cards deal in, paced to the narration (~2.4s each), each held on screen; all six visible together at the end.
Audio intent: playful but premium; each cat has a moment.
Audio-coupled idea: card-slide SFX per cat, synced to each card + its name in the VO.
Music: ducked under VO s4.
Transition mood: soft crossfade → Scene 5

### Scene 5 — Strategy Lab — ~20s
Real Lab frame (Pounce selected). Push in on the parameter sliders; highlight the "SWAP THE CAT" grid; the "Start dry run" button pulses; a chip reads "Nothing is signed — paper-trades the live book." Paper-equity panel glows.
Sequential/interaction: yes — slider row + "Start dry run" pulse.
Audio intent: control, confidence.
Audio-coupled idea: switch/click on "Start dry run".
Music: ducked under VO s5.
Transition mood: clean wipe → Scene 6

### Scene 6 — Fleet Deck — ~20s
Real running Fleet frame: four cats scanning their own windows, capital-allocation bar (80% allocated), equity line, "Stop fleet" (running). Roster rows slide in; equity line draws; chip "Up to five cats · separated capital · dry or live".
Sequential/interaction: yes — roster rows slide in; equity path draws left-to-right.
Audio intent: momentum — the machine is alive.
Audio-coupled idea: soft tick per roster row.
Music: ducked under VO s6.
Transition mood: cinematic wipe → Scene 7

### Scene 7 — Leaderboard — ~15s
Real Leaderboard frame. Highlight the ranked row (Mittens / marketmaker) and pulse the "Clone" button; columns PnL / Trades / Win rate. Chip "Ranked by realized PnL · one-click clone".
Sequential/interaction: yes — row highlight, then "Clone" pulse (a simulated focus).
Audio intent: payoff.
Audio-coupled idea: bell/chips on "Clone".
Music: ducked under VO s7.
Transition mood: clean wipe → Scene 8

### Scene 8 — Intel Hub — ~16s
Real Intel frame. Top-story headline, bull/bear tone badge, whale-prints panel, then push to the "ELSEWHERE" cross-venue Polymarket probabilities (divergence). Chip "News · whale prints · cross-venue divergence".
Sequential/interaction: yes — focus pans headline → whale prints → cross-venue column.
Audio intent: informed edge.
Audio-coupled idea: soft drop as the cross-venue column highlights.
Music: ducked under VO s8.
Transition mood: soft crossfade → Scene 9

### Scene 9 — Lifecycle — ~12s
Four-stage strip on canvas: Trading → Close → Resolve → Claim, each ticking in with a status dot; "Trading" green, the rest hairline. Kicker "CONTRACT LIFECYCLE".
Sequential/interaction: yes — 4 stages tick in one by one (~1.6s apart), all held.
Audio intent: inevitability, a clock.
Audio-coupled idea: tick per stage.
Music: ducked under VO s9.
Transition mood: dramatic crossfade → Scene 10

### Scene 10 — Outro / CTA — ~14s
Return to canvas + amber glow. Brand mark reprise; "Six cats. Five screens. One signal." resolves to "The window is already open." (amber). CTA pill "Open the terminal ↗". Footer line "Somnia Shannon testnet · Somnia × DreamDEX Event Contracts Hackathon".
Sequential/interaction: none — final resolve.
Audio intent: triumphant landing; music swells back up as VO ends, then fades.
Audio-coupled idea: bell on the mark/CTA landing. Beat-lock to a strong cue if available.
Music: returns to 0.30, fade out over last ~2s.
Transition mood: hold to black.

**Music mood for this video:** cinematic (confident launch bed, ducked under narration)
**Audio summary:** A single confident bed fades in under a drawn logo, ducks wall-to-wall beneath a ten-scene voiceover that walks the whole protocol, punctuated by sparse cinematic impacts and card deals, then swells back for the final "the window is already open" and fades to black.
