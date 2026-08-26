import type { Metadata } from "next";
import BotBuilder from "@/components/BotBuilder";

export const metadata: Metadata = {
  title: "Bot Builder",
  description: "Configure, validate, and export a DreamDEX spot or event-contract bot.",
};

export default function LabPage() {
  return <BotBuilder />;
}
