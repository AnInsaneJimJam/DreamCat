"use client";

import {
  ArrowUpRight,
  Broadcast,
  ChartLineUp,
  Flask,
  Newspaper,
  Trophy,
  UsersThree,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";

export const NAV_ITEMS = [
  { href: "/terminal", label: "Terminal", icon: ChartLineUp },
  { href: "/lab", label: "Lab", icon: Flask },
  { href: "/fleet", label: "Fleet", icon: UsersThree },
  { href: "/leaderboard", label: "Board", icon: Trophy },
  { href: "/intel", label: "Intel", icon: Newspaper },
] as const;

export type NavKey = "home" | "terminal" | "lab" | "fleet" | "leaderboard" | "intel";

type AppChromeProps = {
  current?: NavKey;
  networkLabel?: string;
  networkState?: string;
};

function itemKey(href: string): NavKey {
  if (href === "/terminal") return "terminal";
  if (href === "/lab") return "lab";
  if (href === "/fleet") return "fleet";
  if (href === "/leaderboard") return "leaderboard";
  return "intel";
}

export default function AppChrome({
  current,
  networkLabel = "Somnia Shannon",
  networkState = "testnet",
}: AppChromeProps) {
  const pathname = usePathname();
  const activeKey = current ?? (pathname === "/" ? "home" : itemKey(pathname ?? "/terminal"));

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-7">
            <Link href="/" aria-label="DreamCat home" className="flex shrink-0 items-center gap-2.5">
              <BrandWordmark />
            </Link>
            <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeKey === itemKey(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                      active ? "bg-surface-2 text-text-1" : "text-text-2 hover:bg-surface-1 hover:text-text-1"
                    }`}
                  >
                    <Icon aria-hidden="true" size={16} weight={active ? "fill" : "regular"} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="hidden items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 py-2 text-[11px] text-text-2 sm:flex">
              <Broadcast aria-hidden="true" className="text-buy" size={14} weight="fill" />
              <span>{networkLabel}</span>
              <span className="text-text-3">{networkState}</span>
            </div>
            {activeKey !== "terminal" ? (
              <Link
                href="/terminal"
                className="group flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-brand px-3.5 text-xs font-semibold text-brand-ink transition-colors duration-150 hover:bg-brand-strong"
              >
                <span className="hidden sm:inline">Open terminal</span>
                <span className="sm:hidden">Open</span>
                <ArrowUpRight aria-hidden="true" className="transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" size={15} weight="bold" />
              </Link>
            ) : null}
          </div>
        </div>
      </header>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-[var(--radius-panel)] border border-line-strong bg-surface-2/95 p-1 shadow-2xl backdrop-blur-xl md:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeKey === itemKey(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] text-[10px] font-medium transition-colors duration-150 ${
                active ? "bg-surface-3 text-brand" : "text-text-2 hover:text-text-1"
              }`}
            >
              <Icon aria-hidden="true" size={17} weight={active ? "fill" : "regular"} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function BrandWordmark() {
  return (
    <>
      <BrandMark />
      <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-text-1">DreamCat</span>
    </>
  );
}
