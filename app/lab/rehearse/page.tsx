import type { Metadata } from "next";
import StrategyLab from "@/components/StrategyLab";

export const metadata: Metadata = {
  title: "Live Strategy Rehearsal",
  description: "Paper-test a DreamCat strategy against a live DreamDEX event-contract book.",
};

export default function RehearsePage() {
  return <StrategyLab />;
}
