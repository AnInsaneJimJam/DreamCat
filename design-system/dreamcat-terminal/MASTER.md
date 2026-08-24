# Signal Ledger design system

**Product:** DreamCat Terminal

**Surface:** Somnia Shannon event-contract markets, chart analysis, manual trading, strategy simulation, and paper-trading fleets.

**Design intent:** Make market context feel legible at a glance, then let a trader move from signal to a testable position without changing visual language.

## Direction

Signal Ledger is a dark, instrument-like system with a warm amber brand signal. It is expressive on the landing route and dense on product routes, but the same type, tokens, icon language, and state rules govern both.

The first concept leaned toward a generic crypto launch page with oversized gradients, rounded glass cards, and a second neon accent. That direction obscured the product and made the terminal feel like a separate application. The revised direction removes the purple accent, limits radii, uses real product surfaces, gives the landing page an asymmetric editorial split, and treats amber as a deliberate signal rather than decoration.

## Foundations

### Semantic color tokens

Components must use semantic CSS variables or their Tailwind aliases. Raw color values belong only in the token source.

| Token | Value | Usage |
| --- | --- | --- |
| `--canvas` | `#090D13` | Page background and deepest shell |
| `--surface-1` | `#0E141D` | Raised cards and navigation |
| `--surface-2` | `#131B26` | Inner frames and controls |
| `--surface-3` | `#192331` | Active controls, menu layers, selected rows |
| `--text-1` | `#F2F5F7` | Primary copy and key values |
| `--text-2` | `#A5B0BF` | Supporting copy and labels |
| `--text-3` | `#718093` | Tertiary copy and metadata |
| `--line` | `rgba(218,226,236,0.12)` | Hairline borders and dividers |
| `--line-strong` | `rgba(218,226,236,0.22)` | Hover borders and active separators |
| `--brand` | `#F2B84B` | Primary action, brand mark, signal label |
| `--brand-strong` | `#FFCA63` | Hover state for primary actions |
| `--brand-ink` | `#0B1016` | Text on brand surfaces |
| `--buy` | `#3FD39A` | Positive movement and connected state |
| `--sell` | `#F2747C` | Negative movement and risk state |
| `--focus` | `#F2B84B` | Visible keyboard focus ring |

Legacy aliases must remain available for product routes: `--background`, `--panel`, `--panel-raised`, `--foreground`, `--muted`, `--hairline`, `--amber`, `--up`, and `--down`.

### Typography

| Role | Token | Font | Rule |
| --- | --- | --- | --- |
| Display | `--font-space` | Space Grotesk | Route titles and product names |
| Body | `--font-body` | IBM Plex Sans | Navigation, labels, explanatory copy |
| Data | `--font-data` | JetBrains Mono | Prices, percentages, timestamps, IDs |

Display text should use tight tracking and a short measure. Body copy must stay between 14px and 18px on marketing surfaces. Data must use the `num` class and tabular numerals. Copy must not simulate a terminal with all-caps body text.

### Spacing and shape

The base spacing unit is 4px. Use 4, 8, 12, 16, 20, 24, 32, 48, 64, and 96px. Teams must not introduce one-off spacing values when a scale value works.

| Token | Value | Usage |
| --- | --- | --- |
| `--radius-control` | `6px` | Buttons, inputs, small icon surfaces |
| `--radius-panel` | `10px` | Cards, inner frames, tables |
| `--radius-shell` | `14px` | Outer product shells and major CTA panels |
| Pill | Reserved | Status chips and compact network indicators only |

Panels should use the double-bezel pattern: an outer `surface-shell` with a hairline border and 6px inset, followed by a `surface-frame` inner surface. Marketing cards may use a single bezel when the content is editorial. Shadows should be sparse and broad; borders carry hierarchy.

## Layout families

### Marketing shell

The landing route uses a max width of 1440px, 16px to 32px responsive gutters, and an asymmetric hero split weighted toward the product preview. The sequence must be:

1. AppChrome
2. Asymmetric hero with one primary and one secondary action
3. One accessible live ticker
4. Five-cell feature composition
5. Discover, Shape, Deploy workflow
6. Final terminal CTA
7. Footer

The hero must keep the headline to two or three lines at common widths. The feature grid must contain five cells with varied spans. The first three cells may show real assets. The remaining cells should use functional icon-led compositions instead of fake dashboards.

### Terminal shell

Product routes use dense three-column or two-column layouts with compact labels, double-bezel panels, and chart or order-book regions. Product surfaces must preserve existing route functionality. The landing shell must not leak product controls into the marketing hierarchy.

## Shared components

### AppChrome

An AppChrome contains the custom cat mark, DreamCat wordmark, route navigation, network context, and a terminal action. It must preserve these route labels and slugs:

| Label | Route | Icon |
| --- | --- | --- |
| Terminal | `/terminal` | ChartLineUp |
| Lab | `/lab` | Flask |
| Fleet | `/fleet` | UsersThree |
| Board | `/leaderboard` | Trophy |
| Intel | `/intel` | Newspaper |

Default, hover, focus-visible, active, disabled, loading, and error states must be defined for any future interactive AppChrome action. Current route uses `aria-current="page"`. Desktop navigation may collapse on small screens, but mobile navigation must remain reachable through the labeled bottom dock. The dock must not obscure content; pages using it must include bottom safe space.

### Buttons and links

Primary actions use `bg-brand` and `text-brand-ink`. Secondary actions use `surface-1`, `line-strong`, and `text-1`. Every action must have a descriptive text label, visible focus ring, pointer cursor, hover state, active state, disabled state, loading state, and error feedback where an async action exists. Hover effects should change color or icon position with transform and opacity only. Layout-shifting scale is prohibited.

Keyboard behavior must follow native links and buttons. Enter activates both. Space activates buttons only. Touch targets must be at least 44px high on mobile.

### Feature cards

Feature cards use a `surface-1` outer frame, a `surface-2` media or icon region, a section kicker, a display title, supporting copy, and an `ArrowUpRight` affordance. The entire card is one link, not nested links. Image cards must provide explicit dimensions, descriptive alt text, and an object-fit crop that keeps the product region legible.

### Live ticker

The ticker is one semantic section with a visible `Live feed` label and a `Pause tape` or `Resume tape` button. The moving strip must duplicate its visual items only, while a screen-reader list exposes the current values without animation. Hover may pause the strip, the button must pause it by keyboard or pointer, and reduced-motion users must receive a static row. Empty and loading states must say `Connecting to the Somnia feed` without showing stale placeholder prices.

## State contract

All interactive components must implement these states, even when a state is visually subtle:

| State | Required behavior |
| --- | --- |
| Default | Uses the semantic surface, text, and line tokens |
| Hover | Raises contrast through `line-strong`, `text-1`, or `brand-strong` |
| Focus-visible | Shows a 2px brand outline with at least 3px offset |
| Active | Keeps the route or control visibly selected with `surface-3` or brand signal |
| Disabled | Lowers contrast, prevents pointer interaction, and exposes disabled semantics |
| Loading | Preserves layout, communicates progress, and prevents duplicate submissions |
| Error | Names the failed action and gives a recoverable next step |

## Route matrix

| Route | Layout override | Density | Primary task |
| --- | --- | --- | --- |
| `/` | Marketing shell, asymmetric hero, five-cell grid | Open | Understand the product and enter the terminal |
| `/terminal` | Dense terminal shell, chart and book | Dense | Analyze and manually trade a market |
| `/lab` | Dense lab shell with control groups | Medium | Simulate a strategy |
| `/fleet` | Dense fleet shell with equity summaries | Dense | Run paper-trading cats |
| `/leaderboard` | Table and comparison shell | Medium | Compare and clone runs |
| `/intel` | Feed and probability shell | Medium | Add context to a decision |

Page-specific rules live in `design-system/dreamcat-terminal/pages/`. They may refine layout and copy, but must not change global token meaning or accessibility requirements.

## Asset strategy

Real product screenshots are preferred over invented interface illustrations. Use `public/shot-terminal.png` for the primary terminal preview, `public/shot-fleet.png` for fleet context, and `public/signal-ledger.png` for the visual signal motif. All images must use `next/image` with width, height, responsive sizes, and alt text. Decorative images must use an empty alt value and `aria-hidden` context. Do not use gradient blobs, random avatars, fake customer logos, or unverified numerical claims.

## Motion

Motion must be native CSS or IntersectionObserver. Use 150ms for control feedback and 500ms to 700ms for reveal transitions. Animate transform and opacity only. The ticker must have a pause control and static reduced-motion behavior. IntersectionObserver reveal must disconnect after the first visible entry. No Motion, GSAP, blur-in, bouncing, or perpetual decorative animations are allowed.

## Content and tone

Copy must be concise, confident, and implementation-specific. Prefer verbs such as `Read`, `Draw`, `Shape`, `Compare`, and `Open`. Labels must describe the action or destination. Claims must be supported by an existing route or data source. Use `paper trading` where a route does not sign transactions. Avoid hype, fabricated performance, hidden fees, and vague labels such as `Explore` when a more specific action is available.

Visible UI copy must not use em dashes or en dashes. Use sentence punctuation, line breaks, or a short hyphen when required by a proper name.

## Accessibility acceptance criteria

- Every route must have one `h1`, a meaningful page title, and a skip link to main content.
- Every interactive element must be keyboard reachable in logical order and have a visible focus ring.
- Text and icons must meet WCAG 2.2 AA contrast against their actual surface.
- Icon-only controls must have an accessible name. Navigation icons must be paired with visible labels at the mobile breakpoint.
- Images must have descriptive alt text unless they are purely decorative.
- The ticker must be pausable, must expose a static list, and must respect `prefers-reduced-motion`.
- Fixed mobile navigation must not cover the final CTA or footer at 375px wide.
- Touch targets must measure at least 44px by 44px, including the pause control and mobile dock links.
- Async failures must be recoverable and must not leave an unlabeled spinner or disabled control.

## Anti-patterns

The product must not use purple or pink neon gradients, glassmorphism stacks, oversized pill navigation, decorative chart lines that look like live data, fake status metrics, emoji icons, raw hex values inside components, layout-shifting hover transforms, hidden focus indicators, or a second competing accent color.

## QA checklist

- [ ] `npm run lint` passes with `.agents/**` ignored narrowly and no product-route lint exceptions.
- [ ] `npm run build` passes on Next 16.
- [ ] `npm run typecheck` passes when available in the workspace.
- [ ] Landing route renders at 375px, 768px, 1024px, and 1440px without horizontal overflow.
- [ ] Hero stays within two or three headline lines at desktop and mobile.
- [ ] Ticker pause, resume, keyboard focus, hover pause, and reduced-motion behavior work.
- [ ] All five feature cells preserve route slugs and descriptive labels.
- [ ] Mobile dock leaves content and footer readable.
- [ ] Product route functionality remains unchanged.
- [ ] Screenshot and image alt text are descriptive and no placeholder copy is visible.
