import type { Metadata } from "next";
import StrategyLab from "@/components/StrategyLab";

export const metadata: Metadata = {
  title: "Strategy Lab",
  description: "Shape and paper-test strategy parameters against live Somnia event-contract books.",
};

export default function LabPage() {
  return <StrategyLab />;
}
