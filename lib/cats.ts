import type { Archetype } from "./strategy";

export interface CatIdentity {
  archetype: Archetype;
  name: string;
  image: string;
  accent: string;
  role: string;
  reads: string;
}

export const CAT_IDENTITIES: Record<Archetype, CatIdentity> = {
  maker: {
    archetype: "maker",
    name: "Whiskers",
    image: "/cats/whiskers.webp",
    accent: "#0b6bb5",
    role: "Maker",
    reads: "Book depth",
  },
  momentum: {
    archetype: "momentum",
    name: "Pounce",
    image: "/cats/pounce.webp",
    accent: "#e8583f",
    role: "Momentum",
    reads: "Trade tape",
  },
  fade: {
    archetype: "fade",
    name: "Luna",
    image: "/cats/luna.webp",
    accent: "#6f7fd8",
    role: "Fade",
    reads: "Trade tape",
  },
  fairvalue: {
    archetype: "fairvalue",
    name: "Fairy",
    image: "/cats/fairy.webp",
    accent: "#0e7c7b",
    role: "Fair value",
    reads: "Pricing model",
  },
  theta: {
    archetype: "theta",
    name: "Theta",
    image: "/cats/theta.webp",
    accent: "#e0a133",
    role: "Theta decay",
    reads: "Model + clock",
  },
  marketmaker: {
    archetype: "marketmaker",
    name: "Mittens",
    image: "/cats/mittens.webp",
    accent: "#d33b5c",
    role: "Market maker",
    reads: "Two-sided quotes",
  },
};

export function catFor(archetype: Archetype): CatIdentity {
  return CAT_IDENTITIES[archetype];
}

export const CAT_ORDER: readonly Archetype[] = [
  "maker",
  "momentum",
  "fade",
  "fairvalue",
  "theta",
  "marketmaker",
];
