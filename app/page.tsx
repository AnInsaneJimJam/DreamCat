import {
  ArrowUpRight,
  ChartLineUp,
  Flask,
  Newspaper,
  Trophy,
  UsersThree,
} from "@phosphor-icons/react/ssr";
import Image from "next/image";
import Link from "next/link";
import AppChrome from "@/components/AppChrome";
import { BrandMark } from "@/components/BrandMark";
import LandingTicker from "@/components/landing/LandingTicker";
import { Reveal } from "@/components/landing/Reveal";

const FEATURES = [
  {
    href: "/terminal",
    span: "md:col-span-7",
    title: "Terminal",
    tag: "READ",
    body: "Analyze and manually trade live books, event windows, order flow, and chart tools.",
    image: "/shot-terminal.png",
    alt: "DreamCat terminal with a live chart and event contract order book",
    icon: ChartLineUp,
  },
  {
    href: "/lab",
    span: "md:col-span-5",
    title: "Strategy Lab",
    tag: "MODEL",
    body: "Shape maker, momentum, or fade strategies against the live book in a dry run.",
    image: "/signal-ledger.png",
    alt: "Signal Ledger visual with an amber market line",
    icon: Flask,
  },
  {
    href: "/fleet",
    span: "md:col-span-5",
    title: "Cat Fleet",
    tag: "RUN",
    body: "Run up to five paper-trading cats with separate capital and equity history.",
    image: "/shot-fleet.png",
    alt: "DreamCat fleet dashboard with strategy cards",
    icon: UsersThree,
  },
  {
    href: "/leaderboard",
    span: "md:col-span-7",
    title: "Board",
    tag: "COMPARE",
    body: "Compare published runs and clone a strategy into your fleet.",
    image: null,
    alt: "",
    icon: Trophy,
  },
  {
    href: "/intel",
    span: "md:col-span-12",
    title: "Intel Hub",
    tag: "CONTEXT",
    body: "Read news, whale prints, and cross-venue probabilities as read-only context for a trading idea.",
    image: null,
    alt: "",
    icon: Newspaper,
  },
] as const;

const WORKFLOW = [
  {
    title: "Discover",
    body: "Scan live markets, windows, books, and fresh prints from one terminal.",
  },
  {
    title: "Shape",
    body: "Draw levels, tune a strategy, and test the idea against the live book.",
  },
  {
    title: "Deploy",
    body: "Send a paper-trading pack to the fleet and follow its equity over time.",
  },
];

export default function Landing() {
  return (
    <div className="landing-shell relative min-h-dvh overflow-x-clip bg-canvas pb-24 md:pb-0">
      <div className="signal-field pointer-events-none fixed inset-0 z-0" aria-hidden="true" />
      <AppChrome current="home" />
      <main className="relative z-10">
        <section className="mx-auto grid max-w-[1440px] grid-cols-1 gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[0.84fr_1.16fr] lg:items-center lg:gap-16 lg:px-8 lg:pb-24 lg:pt-24">
          <div className="max-w-[650px]">
            <Reveal>
              <p className="section-kicker">Somnia event contracts</p>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-5 max-w-[12ch] font-display text-[clamp(3.4rem,7vw,7.8rem)] font-semibold leading-[0.96] tracking-[-0.065em] text-text-1">
                Read the odds <span className="text-brand">before the crowd.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-7 max-w-lg text-base leading-7 text-text-2 sm:text-lg">
                Discover live markets, draw levels, trade the book, or dry-run a five-cat fleet.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="/terminal"
                  className="group flex items-center gap-2 rounded-[var(--radius-control)] bg-brand px-4 py-3 text-sm font-semibold text-brand-ink transition-colors duration-150 hover:bg-brand-strong"
                >
                  Open terminal
                  <ArrowUpRight
                    aria-hidden="true"
                    className="transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    size={17}
                    weight="bold"
                  />
                </Link>
                <Link
                  href="/fleet"
                  className="flex items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-4 py-3 text-sm font-semibold text-text-1 transition-colors duration-150 hover:border-brand/60 hover:text-brand"
                >
                  Meet the fleet
                </Link>
              </div>
            </Reveal>
          </div>
          <Reveal className="lg:translate-y-8" delay={120}>
            <div className="surface-shell shadow-[0_30px_100px_rgba(0,0,0,0.35)]">
              <div className="surface-frame overflow-hidden">
                <Image
                  src="/shot-terminal.png"
                  alt="DreamCat terminal with a live chart and event contract order book"
                  width={1600}
                  height={1000}
                  priority
                  sizes="(max-width: 1023px) 100vw, 58vw"
                  className="h-auto w-full"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between px-1 text-[11px] text-text-3">
              <span>Terminal preview</span>
              <span className="num text-buy">Somnia Shannon</span>
            </div>
          </Reveal>
        </section>

        <Reveal>
          <LandingTicker />
        </Reveal>

        <section id="surfaces" className="mx-auto max-w-[1440px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <Reveal>
            <div className="max-w-2xl">
              <h2 className="font-display text-4xl font-semibold leading-tight tracking-[-0.04em] text-text-1 sm:text-5xl">
                Five ways to use it.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-text-2">
                Move from discovery to context to a testable trading idea without leaving the signal.
              </p>
            </div>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-12">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Reveal key={feature.href} className={`${feature.span} h-full`} delay={index * 70}>
                  <Link
                    href={feature.href}
                    className="group flex h-full min-h-[270px] flex-col rounded-[var(--radius-panel)] border border-line bg-surface-1 p-2 transition-colors duration-150 hover:border-line-strong"
                  >
                    {feature.image ? (
                      <div className="overflow-hidden rounded-[var(--radius-control)] bg-surface-2">
                        <Image
                          src={feature.image}
                          alt={feature.alt}
                          width={1600}
                          height={1000}
                          sizes="(max-width: 767px) 100vw, 50vw"
                          className="aspect-[16/7] h-full w-full object-cover object-top transition-transform duration-500 ease-terminal group-hover:scale-[1.025]"
                        />
                      </div>
                    ) : (
                      <div className="flex min-h-[128px] items-start justify-between rounded-[var(--radius-control)] bg-surface-2 p-5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] border border-line-strong text-brand">
                          <Icon aria-hidden="true" size={20} weight="regular" />
                        </div>
                        <ArrowUpRight
                          aria-hidden="true"
                          className="text-text-3 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand"
                          size={18}
                          weight="regular"
                        />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-4">
                        <span className="num text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">{feature.tag}</span>
                        {feature.image ? (
                          <ArrowUpRight
                            aria-hidden="true"
                            className="text-text-3 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand"
                            size={18}
                            weight="regular"
                          />
                        ) : null}
                      </div>
                      <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.035em] text-text-1">{feature.title}</h3>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-text-2">{feature.body}</p>
                    </div>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
          <div className="grid grid-cols-1 gap-12 border-t border-line pt-16 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20 lg:pt-20">
            <Reveal>
              <p className="section-kicker">Workflow</p>
              <h2 className="mt-4 max-w-md font-display text-4xl font-semibold leading-tight tracking-[-0.04em] text-text-1 sm:text-5xl">
                From signal to position.
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-text-2">
                Keep analysis, simulation, and execution in one deliberate loop.
              </p>
            </Reveal>
            <div>
              {WORKFLOW.map((step, index) => (
                <Reveal key={step.title} delay={index * 80}>
                  <div className="grid grid-cols-[5rem_1fr] gap-4 border-b border-line py-6 first:pt-0 sm:grid-cols-[7rem_1fr]">
                    <span className="num pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">0{index + 1}</span>
                    <div>
                      <h3 className="font-display text-2xl font-semibold tracking-[-0.035em] text-text-1">{step.title}</h3>
                      <p className="mt-2 max-w-lg text-sm leading-6 text-text-2">{step.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
          <Reveal>
            <div className="flex flex-col gap-8 rounded-[var(--radius-shell)] border border-line bg-surface-1 p-6 sm:p-10 lg:flex-row lg:items-end lg:justify-between lg:p-14">
              <div className="max-w-2xl">
                <h2 className="font-display text-4xl font-semibold leading-tight tracking-[-0.045em] text-text-1 sm:text-6xl">
                  Open the terminal.
                </h2>
                <p className="mt-4 max-w-lg text-base leading-7 text-text-2">
                  Start with the market feed, bring your own levels to the book, or send a strategy to paper trading.
                </p>
              </div>
              <Link
                href="/terminal"
                className="group flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand px-5 py-3 text-sm font-semibold text-brand-ink transition-colors duration-150 hover:bg-brand-strong"
              >
                Open terminal
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
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-7 text-xs text-text-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Link href="/" aria-label="DreamCat home" className="flex items-center gap-2 text-text-1">
            <BrandMark size={20} />
            <span className="font-display font-semibold">DreamCat</span>
          </Link>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <span>Somnia Shannon testnet</span>
            <span>Fleet runs are paper trading</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
