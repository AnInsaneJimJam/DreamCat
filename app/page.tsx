import { ArrowRight, ArrowUpRight } from "@phosphor-icons/react/ssr";
import Image from "next/image";
import Link from "next/link";
import AppChrome from "@/components/AppChrome";
import { BrandMark } from "@/components/BrandMark";
import HeroContract from "@/components/landing/HeroContract";
import LandingTicker from "@/components/landing/LandingTicker";
import { Reveal } from "@/components/landing/Reveal";
import { CAT_IDENTITIES } from "@/lib/cats";

const CATS = [
  {
    ...CAT_IDENTITIES.maker,
    body: "Trades the imbalance. Buys YES when bids dominate depth, exits on reversion.",
  },
  {
    ...CAT_IDENTITIES.momentum,
    body: "Chases prints. Buys when the recent tape skews aggressively toward buys.",
  },
  {
    ...CAT_IDENTITIES.fade,
    body: "Fades euphoria. Sells into recent buy-skewed tapes by taking the NO side.",
  },
  {
    ...CAT_IDENTITIES.fairvalue,
    body: "Prices the contract from spot, strike and time to expiry, then buys whichever side the model calls cheap.",
  },
  {
    ...CAT_IDENTITIES.theta,
    body: "Rides convergence. Late in the window it buys the side spot has already decided and holds into expiry.",
  },
  {
    ...CAT_IDENTITIES.marketmaker,
    body: "Rests a bid and an ask either side of model fair value and earns the spread instead of paying it.",
  },
] as const;

const SURFACES = [
  {
    href: "/terminal",
    nav: "Terminal",
    title: "Terminal",
    use: "Trade it yourself",
    body: "The full book for one contract: live bids and asks, candles with drawing tools and indicators, and manual order entry straight from your wallet.",
    when: "You have your own read on the window and want to put it on yourself.",
  },
  {
    href: "/lab",
    nav: "Lab",
    title: "Strategy Lab",
    use: "Meet and tune a cat",
    body: "Pick one of the six cats, tune its edges, sizing and hold time, then dry-run it against the live book to see how it would have behaved.",
    when: "Before you give a strategy any capital — this is where a cat gets its settings.",
  },
  {
    href: "/fleet",
    nav: "Fleet",
    title: "Fleet Deck",
    use: "Run the cats",
    body: "Deploy up to five tuned cats side by side, each with its own capital and equity history. They keep trading in the background while you move around the app.",
    when: "You are done tuning and want the cats working the book, dry or live.",
  },
  {
    href: "/leaderboard",
    nav: "Board",
    title: "Leaderboard",
    use: "Compare and clone",
    body: "Published runs ranked by performance, with the configuration behind each one. Clone any of them straight into your own fleet.",
    when: "You want to see what is actually working before committing to a setup.",
  },
  {
    href: "/intel",
    nav: "Intel",
    title: "Intel Hub",
    use: "Get the context",
    body: "Headlines, whale prints, and cross-venue probabilities from other prediction markets, side by side with the DreamDEX window.",
    when: "Before you size up — context the order book alone will not give you.",
  },
] as const;

const LIFECYCLE = [
  {
    stage: "Trading",
    body: "The window is open. Bids and asks rest on the book, and this is the only state that accepts an order.",
  },
  {
    stage: "Close",
    body: "The window expires. The book stops, and whatever spot did against the strike is now the only thing that matters.",
  },
  {
    stage: "Resolve",
    body: "The oracle settles the contract. One side is worth a dollar, the other is worth nothing.",
  },
  {
    stage: "Claim",
    body: "Winnings sit on the contract until you claim them. Nothing lands in your wallet on its own.",
  },
] as const;

export default function Landing() {
  return (
    <div className="landing-shell relative min-h-dvh overflow-x-clip bg-canvas pb-24 md:pb-0">
      <div className="signal-field pointer-events-none fixed inset-0 z-0" aria-hidden="true" />
      <AppChrome current="home" />
      <main className="relative z-10">
        <section className="mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-14 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-20 lg:px-8 lg:pb-24 lg:pt-24">
          <div className="max-w-[620px]">
            <Reveal>
              <p className="section-kicker">Binary event contracts · Somnia Shannon</p>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-6 font-headline text-[clamp(3rem,6.4vw,6.4rem)] font-bold leading-[0.99] tracking-[-0.045em] text-text-1">
                Trade the
                <br />
                probability,
                <br />
                <span className="text-eye">not the price.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-8 max-w-[46ch] text-base leading-7 text-text-2 sm:text-lg">
                Every contract asks one question — will BTC or ETH be above a strike when the window
                closes — and pays a dollar to whoever is right. Read the book yourself, or hand it to
                a fleet of cats that read it for you.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link
                  className="group flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] bg-brand px-5 text-sm font-semibold text-brand-ink transition-colors duration-150 hover:bg-brand-strong"
                  href="/terminal"
                >
                  Open the terminal
                  <ArrowUpRight
                    aria-hidden="true"
                    className="transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    size={17}
                    weight="bold"
                  />
                </Link>
                <Link
                  className="flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-5 text-sm font-semibold text-text-1 transition-colors duration-150 hover:border-brand/60 hover:text-brand"
                  href="/lab"
                >
                  Meet the cats
                </Link>
              </div>
            </Reveal>
          </div>
          <Reveal delay={120}>
            <HeroContract />
          </Reveal>
        </section>

        <Reveal>
          <LandingTicker />
        </Reveal>

        <section className="mx-auto max-w-[1440px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28" id="fleet">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <Reveal>
              <div className="lg:sticky lg:top-24">
                <BrandMark className="rounded-[18px]" size={64} />
                <h2 className="mt-6 max-w-[14ch] font-headline text-4xl font-bold leading-[1.02] tracking-[-0.04em] text-text-1 sm:text-5xl">
                  Six cats. Six ways to be right.
                </h2>
                <p className="mt-5 max-w-[42ch] text-base leading-7 text-text-2">
                  Each cat is a strategy with its own read on the market — one watches depth, one
                  watches the tape, one prices the contract from scratch. Deploy up to five at once,
                  as a dry run against the live book or trading it for real.
                </p>
                <Link
                  className="group mt-7 inline-flex items-center gap-2 text-sm font-semibold text-brand"
                  href="/fleet"
                >
                  Build a fleet
                  <ArrowRight
                    aria-hidden="true"
                    className="transition-transform duration-150 group-hover:translate-x-1"
                    size={16}
                    weight="bold"
                  />
                </Link>
              </div>
            </Reveal>
            <div className="border-t border-line">
              {CATS.map((cat, index) => (
                <Reveal delay={index * 60} key={cat.name}>
                  <article className="grid grid-cols-[3.5rem_1fr] items-start gap-4 border-b border-line py-6 sm:grid-cols-[3.5rem_9rem_1fr] sm:gap-6">
                    <Image
                      alt=""
                      className="h-14 w-14 rounded-[12px]"
                      height={112}
                      src={cat.image}
                      width={112}
                    />
                    <div className="min-w-0">
                      <h3 className="font-headline text-xl font-bold tracking-[-0.03em] text-text-1">
                        {cat.name}
                      </h3>
                      <p className="num mt-1 text-[10px] uppercase tracking-[0.16em] text-brand">
                        {cat.role}
                      </p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <p className="max-w-[54ch] text-sm leading-6 text-text-2">{cat.body}</p>
                      <p className="num mt-2.5 text-[10px] uppercase tracking-[0.16em] text-text-3">
                        Reads · {cat.reads}
                      </p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28" id="surfaces">
          <Reveal>
            <div className="max-w-2xl">
              <p className="section-kicker">Where to go</p>
              <h2 className="mt-4 max-w-[16ch] font-headline text-4xl font-bold leading-[1.02] tracking-[-0.04em] text-text-1 sm:text-5xl">
                Five screens, one signal.
              </h2>
              <p className="mt-5 max-w-[52ch] text-base leading-7 text-text-2">
                Every screen in the terminal does one job. Read the book on Terminal, shape a cat in
                the Lab, put it to work on the Fleet Deck, check it against everyone else on the
                Board, and pick up context on Intel.
              </p>
            </div>
          </Reveal>
          <div className="mt-12 border-t border-line">
            {SURFACES.map((surface, index) => (
              <Reveal delay={index * 60} key={surface.href}>
                <Link
                  className="group grid grid-cols-1 items-start gap-3 border-b border-line py-7 transition-colors duration-150 hover:bg-surface-1/60 sm:grid-cols-[minmax(0,22rem)_1fr_auto] sm:gap-10 sm:px-3"
                  href={surface.href}
                >
                  <div>
                    <p className="num text-[10px] uppercase tracking-[0.16em] text-brand">
                      {surface.nav} · {surface.use}
                    </p>
                    <h3 className="mt-2 font-headline text-2xl font-bold tracking-[-0.035em] text-text-1 transition-colors duration-150 group-hover:text-brand sm:text-3xl">
                      {surface.title}
                    </h3>
                  </div>
                  <div className="min-w-0">
                    <p className="max-w-[62ch] text-base leading-7 text-text-2">{surface.body}</p>
                    <p className="mt-3 max-w-[62ch] border-l border-line-strong pl-3 text-sm leading-6 text-text-3">
                      {surface.when}
                    </p>
                  </div>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="hidden text-text-3 transition-[transform,color] duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand sm:block"
                    size={22}
                    weight="regular"
                  />
                </Link>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28" id="lifecycle">
          <Reveal>
            <div className="max-w-2xl">
              <p className="section-kicker">Contract lifecycle</p>
              <h2 className="mt-4 font-headline text-4xl font-bold leading-[1.02] tracking-[-0.04em] text-text-1 sm:text-5xl">
                A window, then an answer.
              </h2>
              <p className="mt-5 max-w-[48ch] text-base leading-7 text-text-2">
                Unlike spot, an event contract has an ending. Knowing which stage a market is in tells
                you whether you can still trade it, and what you have to do to get paid.
              </p>
            </div>
          </Reveal>
          <ol className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {LIFECYCLE.map((step, index) => (
              <li className="bg-surface-1" key={step.stage}>
                <Reveal className="h-full" delay={index * 70}>
                  <div className="flex h-full flex-col p-6 lg:p-7">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${index === 0 ? "bg-buy" : "bg-line-strong"}`}
                      />
                      <h3 className="num text-[11px] font-semibold uppercase tracking-[0.18em] text-text-1">
                        {step.stage}
                      </h3>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-text-2">{step.body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-[1440px] px-4 pb-24 sm:px-6 lg:px-8 lg:pb-32">
          <Reveal>
            <div className="flex flex-col gap-8 rounded-[var(--radius-shell)] border border-line bg-surface-1 p-8 sm:p-12 lg:flex-row lg:items-end lg:justify-between lg:p-16">
              <div className="max-w-2xl">
                <h2 className="font-headline text-4xl font-bold leading-[1.02] tracking-[-0.045em] text-text-1 sm:text-6xl">
                  The window is
                  <br />
                  <span className="text-eye">already open.</span>
                </h2>
                <p className="mt-6 max-w-[44ch] text-base leading-7 text-text-2">
                  Start on the book with your own read, or let a cat take the first trade while you
                  watch the equity curve.
                </p>
              </div>
              <Link
                className="group flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand px-6 text-sm font-semibold text-brand-ink transition-colors duration-150 hover:bg-brand-strong"
                href="/terminal"
              >
                Open the terminal
                <ArrowUpRight
                  aria-hidden="true"
                  className="transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  size={18}
                  weight="bold"
                />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>
      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-8 text-xs text-text-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Link aria-label="DreamCat home" className="flex items-center gap-2.5 text-text-1" href="/">
            <BrandMark className="rounded-md" size={22} />
            <span className="font-headline text-sm font-bold tracking-[-0.02em]">DreamCat</span>
          </Link>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <span>Somnia Shannon testnet</span>
            <span>Cats run dry or live — you choose per fleet</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
