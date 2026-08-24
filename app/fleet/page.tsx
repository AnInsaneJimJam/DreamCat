import type { Metadata } from "next";
import FleetDeck from "@/components/FleetDeck";

export const metadata: Metadata = {
  title: "Fleet Deck",
  description: "Run a paper-trading fleet across live Somnia event-contract windows.",
};

export default function FleetPage() {
  return <FleetDeck />;
}
