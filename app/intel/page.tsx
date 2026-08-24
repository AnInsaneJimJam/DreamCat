import type { Metadata } from "next";
import IntelHub from "@/components/IntelHub";

export const metadata: Metadata = {
  title: "Intel Hub",
  description: "Read crypto market news, large prints, and cross-venue probabilities beside DreamCat markets.",
};

export default function IntelPage() {
  return <IntelHub />;
}
