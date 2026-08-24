import type { Metadata } from "next";
import Terminal from "@/components/Terminal";

export const metadata: Metadata = {
  title: "Trading Terminal",
  description: "Analyze live Somnia event contracts, draw chart levels, and place manual orders from one terminal.",
};

export default function TerminalPage() {
  return <Terminal />;
}
