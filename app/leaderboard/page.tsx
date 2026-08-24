import type { Metadata } from "next";
import Leaderboard from "@/components/Leaderboard";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Compare published DreamCat paper-trading runs and clone a strategy into your fleet.",
};

export default function LeaderboardPage() {
  return <Leaderboard />;
}
