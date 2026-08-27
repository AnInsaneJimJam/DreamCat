"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Candle {
  x: number;
  open: number;
  close: number;
  high: number;
  low: number;
  up: boolean;
}

const COUNT = 20;
const BASE = 80;

function buildCandles(seed: number): Candle[] {
  const out: Candle[] = [];
  let level = 40;
  for (let i = 0; i < COUNT; i += 1) {
    const drift = Math.sin(seed * 0.6 + i * 0.5) * 4.5 + Math.sin(seed * 1.3 + i * 0.19) * 6;
    const open = level;
    level = Math.max(12, Math.min(58, level + drift));
    const close = level;
    const up = close <= open;
    const wick = 2.5 + Math.abs(Math.sin(seed + i)) * 5;
    const high = Math.min(open, close) - wick;
    const low = Math.max(open, close) + wick;
    out.push({ x: 8 + i * 4.4, open, close, high, low, up });
  }
  return out;
}

const GOLD = { fur: "#d99a4e", furDark: "#b9772e", belly: "#f3d7a6", stripe: "#a5641f" };
const BROWN = { fur: "#9c6a41", furDark: "#7a4f2c", belly: "#e7c9a5", stripe: "#5f3c20" };

function SittingCat({
  pal,
  delay,
  tilt,
}: {
  pal: typeof GOLD;
  delay: number;
  tilt: number;
}) {
  return (
    <g>
      <ellipse cx="0" cy="1" rx="15" ry="3" fill="#000" opacity="0.28" />
      {/* curled tail */}
      <path
        className="hero-cat-tail"
        style={{ animationDelay: `${delay}s` }}
        d="M12 -2 Q26 0 24 -12 Q23 -20 15 -18"
        fill="none"
        stroke={pal.fur}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path d="M12 -2 Q26 0 24 -12" fill="none" stroke={pal.furDark} strokeWidth="1" strokeLinecap="round" opacity="0.5" />
      {/* haunch + body */}
      <path d="M-13 -1 Q-15 -20 0 -22 Q15 -20 13 -1 Z" fill={pal.fur} />
      <path d="M-6 -1 Q-7 -13 0 -15 Q7 -13 6 -1 Z" fill={pal.belly} opacity="0.9" />
      {/* front paws */}
      <ellipse cx="-5" cy="-1.5" rx="3" ry="2.4" fill={pal.belly} />
      <ellipse cx="5" cy="-1.5" rx="3" ry="2.4" fill={pal.belly} />
      {/* body stripes */}
      <path d="M-11 -8 Q-8 -9 -6 -8" stroke={pal.stripe} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" />
      <path d="M11 -8 Q8 -9 6 -8" stroke={pal.stripe} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" />

      {/* head group — tilts while thinking */}
      <g
        className="hero-cat-head"
        style={{ animationDelay: `${delay}s`, ["--tilt" as string]: `${tilt}deg` }}
      >
        {/* ears */}
        <path d="M-11 -26 L-14 -37 L-4 -30 Z" fill={pal.fur} />
        <path d="M11 -26 L14 -37 L4 -30 Z" fill={pal.fur} />
        <path d="M-10 -27 L-12 -33 L-6 -29 Z" fill="#f4a9b8" />
        <path d="M10 -27 L12 -33 L6 -29 Z" fill="#f4a9b8" />
        {/* ear twitch overlay */}
        <path
          className="hero-cat-ear"
          style={{ animationDelay: `${delay}s` }}
          d="M11 -26 L14 -37 L4 -30 Z"
          fill={pal.fur}
        />
        {/* face */}
        <ellipse cx="0" cy="-24" rx="12.5" ry="11" fill={pal.fur} />
        {/* forehead M stripes */}
        <path d="M-4 -33 L-3 -28 M0 -34 L0 -29 M4 -33 L3 -28" stroke={pal.stripe} strokeWidth="0.9" strokeLinecap="round" opacity="0.55" />
        {/* cheeks */}
        <ellipse cx="-6" cy="-20" rx="5" ry="4" fill={pal.belly} opacity="0.7" />
        <ellipse cx="6" cy="-20" rx="5" ry="4" fill={pal.belly} opacity="0.7" />
        {/* eyes */}
        <g className="hero-cat-eye" style={{ animationDelay: `${delay}s` }}>
          <ellipse cx="-4.6" cy="-25" rx="2.1" ry="2.6" fill="#2c2116" />
          <ellipse cx="4.6" cy="-25" rx="2.1" ry="2.6" fill="#2c2116" />
          <circle cx="-4" cy="-25.8" r="0.7" fill="#fff" opacity="0.85" />
          <circle cx="5.2" cy="-25.8" r="0.7" fill="#fff" opacity="0.85" />
        </g>
        {/* nose + mouth */}
        <path d="M-1.4 -19.5 L1.4 -19.5 L0 -18 Z" fill="#c56b6b" />
        <path d="M0 -18 Q-2 -16 -3.6 -17 M0 -18 Q2 -16 3.6 -17" stroke={pal.furDark} strokeWidth="0.7" fill="none" strokeLinecap="round" />
        {/* whiskers */}
        <g stroke={pal.belly} strokeWidth="0.5" strokeLinecap="round" opacity="0.85">
          <path d="M-7 -19 L-16 -20" />
          <path d="M-7 -18 L-16 -17" />
          <path d="M7 -19 L16 -20" />
          <path d="M7 -18 L16 -17" />
        </g>
      </g>

      {/* thought bubble */}
      <g className="hero-cat-think" style={{ animationDelay: `${delay + 0.3}s` }}>
        <circle cx="13" cy="-34" r="1.1" fill="var(--color-brand)" opacity="0.5" />
        <circle cx="16" cy="-39" r="1.6" fill="var(--color-brand)" opacity="0.75" />
        <circle cx="20" cy="-45" r="2.3" fill="var(--color-brand)" />
      </g>
    </g>
  );
}

function WalkingCat({ pal }: { pal: typeof GOLD }) {
  return (
    <g className="hero-cat-walk">
      <ellipse cx="0" cy="1" rx="13" ry="2.6" fill="#000" opacity="0.25" />
      {/* tail up */}
      <path d="M-12 -6 Q-20 -8 -18 -18" fill="none" stroke={pal.fur} strokeWidth="4.5" strokeLinecap="round" className="hero-cat-tail" style={{ animationDelay: "0.2s" }} />
      {/* body */}
      <ellipse cx="0" cy="-7" rx="13" ry="7.5" fill={pal.fur} />
      <ellipse cx="1" cy="-5" rx="9" ry="4.5" fill={pal.belly} opacity="0.55" />
      {/* legs */}
      <g className="hero-cat-legs">
        <rect x="-9" y="-3" width="2.4" height="6" rx="1.2" fill={pal.furDark} />
        <rect x="-2" y="-3" width="2.4" height="6" rx="1.2" fill={pal.fur} />
        <rect x="4" y="-3" width="2.4" height="6" rx="1.2" fill={pal.furDark} />
        <rect x="9" y="-3" width="2.4" height="6" rx="1.2" fill={pal.fur} />
      </g>
      {/* head */}
      <g transform="translate(11 -10)">
        <path d="M-2 -6 L-5 -13 L2 -9 Z" fill={pal.fur} />
        <path d="M6 -6 L9 -13 L3 -9 Z" fill={pal.fur} />
        <ellipse cx="2" cy="-4" rx="7" ry="6.5" fill={pal.fur} />
        <ellipse cx="4.6" cy="-4.5" rx="1.2" ry="1.5" fill="#2c2116" />
        <ellipse cx="-0.4" cy="-4.5" rx="1.2" ry="1.5" fill="#2c2116" />
        <path d="M1.4 -1.6 L2.8 -1.6 L2.1 -0.6 Z" fill="#c56b6b" />
      </g>
    </g>
  );
}

export function HeroStudy() {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState(0);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const kick = setTimeout(() => setMounted(true), 0);
    if (reduced.current) return () => clearTimeout(kick);
    const timer = setInterval(() => setPhase((p) => p + 1), 2600);
    return () => {
      clearTimeout(kick);
      clearInterval(timer);
    };
  }, []);

  const candles = useMemo(() => buildCandles(mounted ? phase * 0.9 + 2 : 2), [mounted, phase]);
  const linePath = useMemo(
    () => candles.map((c, i) => `${i === 0 ? "M" : "L"}${c.x} ${(c.open + c.close) / 2}`).join(" "),
    [candles]
  );

  return (
    <svg
      aria-label="Cats studying a live candlestick chart"
      className="block w-full overflow-visible"
      role="img"
      viewBox="0 0 100 86"
    >
      <defs>
        <linearGradient id="study-glow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-brand)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--color-brand)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[16, 34, 52].map((y) => (
        <line key={y} x1="4" x2="96" y1={y} y2={y} stroke="var(--line)" strokeWidth="0.25" />
      ))}

      <path d={`${linePath} L92 ${BASE - 8} L8 ${BASE - 8} Z`} fill="url(#study-glow)" className="hero-study-morph" />

      {candles.map((c, i) => (
        <g
          key={i}
          className="hero-study-morph"
          stroke={c.up ? "var(--buy)" : "var(--sell)"}
          fill={c.up ? "var(--buy)" : "var(--sell)"}
        >
          <line x1={c.x} x2={c.x} y1={c.high} y2={c.low} strokeWidth="0.45" />
          <rect
            x={c.x - 1.3}
            y={Math.min(c.open, c.close)}
            width="2.6"
            height={Math.max(0.8, Math.abs(c.close - c.open))}
            rx="0.4"
          />
        </g>
      ))}

      <line
        className="hero-study-scan"
        x1="8"
        x2="8"
        y1="8"
        y2={BASE - 8}
        stroke="var(--eye)"
        strokeWidth="0.35"
        strokeDasharray="1.5 2.5"
      />

      <line x1="4" x2="96" y1={BASE - 8} y2={BASE - 8} stroke="var(--line-strong)" strokeWidth="0.4" />

      <g transform={`translate(28 ${BASE - 8}) scale(0.33)`}>
        <SittingCat pal={GOLD} delay={0} tilt={-6} />
      </g>
      <g transform={`translate(70 ${BASE - 8}) scale(0.33)`}>
        <SittingCat pal={BROWN} delay={1.1} tilt={7} />
      </g>
      <g transform={`translate(0 ${BASE - 8}) scale(0.75)`}>
        <WalkingCat pal={GOLD} />
      </g>
    </svg>
  );
}
