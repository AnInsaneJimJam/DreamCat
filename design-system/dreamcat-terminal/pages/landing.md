# Landing route override

**Intent:** Turn the first useful signal into a confident terminal entry without implying that strategy fleets are live execution.

## Composition

The landing route must preserve this order:

1. Shared AppChrome with the home state selected.
2. Asymmetric hero with the terminal screenshot on the wide side.
3. One live ticker with a visible pause or resume control.
4. Five feature cells in a varied 12-column grid.
5. Discover, Shape, Deploy workflow.
6. Final Open terminal CTA.
7. Footer with network and fleet execution context.

The hero may use at most four direct content groups: eyebrow, headline, supporting copy, and actions. A separate metadata row must not be added beneath the actions. The headline should stay within two or three lines at 375px and 1440px.

## Feature cells

The five cells must preserve these destinations and meanings:

| Cell | Route | Meaning | Visual |
| --- | --- | --- | --- |
| Terminal | `/terminal` | Manual market analysis and trading | `public/shot-terminal.png` |
| Strategy Lab | `/lab` | Dry-run strategy shaping | `public/signal-ledger.png` |
| Cat Fleet | `/fleet` | Paper-trading strategy runs | `public/shot-fleet.png` |
| Board | `/leaderboard` | Compare and clone published runs | Icon-led surface |
| Intel Hub | `/intel` | Read-only external context | Icon-led surface |

The image cells must have descriptive alt text and must not add fake values or decorative chart annotations. Text-only cells must use Phosphor icons and a descriptive label. The feature tag is a data label, not a second section eyebrow.

## Content rules

Landing copy must make the execution boundary explicit:

- Terminal copy may say `manually trade` because the route exposes the manual order path.
- Lab and Fleet copy must say `dry run`, `paper trading`, or equivalent when describing strategy behavior.
- Intel copy must identify news, whale prints, and probabilities as read-only context.
- Claims about live data must refer to Somnia Shannon or the actual connected feed.
- Copy must not imply guaranteed fills, performance, or autonomous execution.

Visible copy must not include em dashes or en dashes. Use sentence punctuation and short, descriptive labels.

## Responsive behavior

At 1024px and above, the hero uses the asymmetric two-column layout and the feature grid uses 12 columns. From 768px to 1023px, feature cells remain varied but can span six columns. Below 768px, cells stack in reading order and image crops must keep their focal area visible. The fixed mobile dock requires 96px of bottom page space.

## Motion and accessibility

Reveal transitions may use opacity and vertical transform only. The live ticker must pause on button activation, remain keyboard reachable, and become static under reduced motion. Every card link must have a visible text title. The hero screenshot must use `next/image` with explicit dimensions and a descriptive alt string.

## QA

- [ ] Exactly five feature links render with the correct route slugs.
- [ ] The hero has no metadata strip below its actions.
- [ ] The source contains no em or en dash characters in visible landing copy.
- [ ] Section eyebrow count is at most `ceil(section count / 3)`.
- [ ] Manual, paper, and read-only claims are distinct and accurate.
- [ ] The mobile dock does not cover the final CTA or footer.
