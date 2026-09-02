# Hyperframes Composition Brief: DreamCat Terminal

## Objective
A cinematic, voice-narrated launch film for DreamCat Terminal — a hackathon submission that walks the entire protocol UX end to end.

## Output
- Composition directory: `brag-output-2026-09-02-044543/composition/`
- Rendered video: `brag-output-2026-09-02-044543/brag.mp4`
- Format: landscape — 1920x1080, 30fps
- Duration: ~159.6s (150–180s window per the user's request; voiceover sets the pace)

## Source Material
- Project root: `/Users/phantomxsd/somnia`
- Primary files read: `app/page.tsx` (landing copy), `app/globals.css` (tokens), `components/BrandMark.tsx` + `public/dreamcat.svg` (logo), `lib/cats.ts` (cat identities), `idea.md`, `AGENTS.md`.
- Product name: DreamCat Terminal
- Tagline / strongest claim: "Trade the probability, not the price."
- Key UI shown: REAL screenshots of all six routes captured from the running app (`/`, `/terminal`, `/lab`, `/fleet` populated with a live 4-cat fleet, `/leaderboard`, `/intel`), plus the real brand mark and the six real cat avatars.
- Copy that must appear verbatim / correctly:
  - "Trade the probability, not the price."
  - The six cat names + roles from `lib/cats.ts`: Whiskers/Maker, Pounce/Momentum, Luna/Fade, Fairy/Fair value, Theta/Theta decay, Mittens/Market maker.
  - Lifecycle: Trading → Close → Resolve → Claim.

## Creative Direction
- Tone preset: cinematic
- Creative direction: premium fintech launch film — a Bloomberg terminal run by cats.
- Interpretation: wide framing, big display type, slow Ken-Burns push-ins on real product frames, restrained dramatic reveals, pacing driven by a wall-to-wall voiceover.
- Angle: one thesis — trade the probability, not the price — carried through every screen of the protocol.
- Hook: black canvas + amber glow, the brand mark lands, "Trade the probability, not the price."
- Outro / punchline: "Six cats. Five screens. One signal." → "The window is already open." → Hackathon tag.
- Avoid: generic SaaS language, abstract filler visuals, redesigning the product.

## Visual Identity
- Background: #090d13 (canvas); panels #0e141d / #131b26 / #192331
- Text: #f2f5f7 / #a5b0bf / #718093
- Accent: #f2b84b (brand amber), #f5de3c (eye yellow); semantics up #3fd39a, down #f2747c
- Display font: Bricolage Grotesque (Google Fonts, gated on document.fonts.ready)
- Body font: Inter; numerals/labels: JetBrains Mono
- References: amber signal-field radial glow, double-bezel dark panels, tabular-mono labels, the candlestick hero.

## Storyboard (scene summary — full contract in brag-plan.md)
1. Cold open (brand + thesis) — 15.6s
2. Landing / what it is — 12.5s
3. Terminal (book, candles+indicators, YES/NO order) — 20s
4. The six cats deal in — 19.6s
5. Strategy Lab (tune + dry-run) — 18.3s
6. Fleet Deck (running, up to 5, separated capital) — 17.9s
7. Leaderboard (ranked + one-click clone) — 12.4s
8. Intel Hub (news / whale prints / cross-venue divergence) — 16.7s
9. Lifecycle (Trading→Close→Resolve→Claim) — 12.3s
10. Outro / CTA — 14.3s

## Audio
- Audio role: cinematic bed, ducked hard under a continuous voiceover.
- Audio arc: bed swells in under the logo, ducks to ~0.14 wall-to-wall under the ten VO clips, swells back for the outro, fades to black.
- Music: `assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (120 BPM, 164s).
- Music treatment: volume shaped entirely by timeline tweens on `#music` (baseline gain 1 to avoid the gain/tween mismatch lint) — 0→0.30 open, duck to 0.14 under VO, 0.30 outro, fade to 0 by 159.6s.
- Music cue guidance: bundled preset present (`assets/music/cues/…vol-1….music-cues.json`, tempo 120.19). The track's strong cues start ~16s; because the film is voice-driven and the bed is ducked wall-to-wall, scene cuts follow the narration, not the beat grid (the readability carve-out). Not beat-locked by design.
- Audio-reactive treatment: subtle — the amber `#bg-glow` breathes on a slow finite yoyo; no waveform/equalizer graphics.
- Audio-coupled moments: per-scene VO clips set each scene's length; three callout drops in S3; six card-slide deals across the S4 cat reveals; a switch on the S5 dry-run; a bell on the S7 clone and the S10 logo; four soft ticks on the S9 lifecycle stages.
- SFX selection guidance: sparse and cinematic (impact bells, soft impacts, interface drops/switch, casino card-slides, select ticks), all 0.34–0.55.
- Exact SFX choice: chosen after the animation existed; wired as static `data-volume` (no volume tweens on SFX, so no gain/tween lint).
- Audio files: all copied into `composition/assets/` (music, vo, sfx).

## Hyperframes notes
- Standalone composition, one paused GSAP timeline registered at `window.__timelines["main"]`, built inside `document.fonts.ready`.
- Shared continuous background (`#bg` + `#bg-grid` + `#bg-glow` + `#bg-vignette`), transparent timed scene layers on top.
- Real UI shown in every product scene inside a browser frame with a Ken-Burns push-in.
- Gate: `npx hyperframes check` must pass with 0 findings before render.
