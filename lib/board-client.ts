"use client";

import type { Address } from "viem";
import { deleteMessage, publishMessage } from "@/lib/board-auth";
import type { StrategyParams } from "@/lib/strategy";
import {
  connectWalletProvider,
  discoverWalletProviders,
  rememberWalletProvider,
  rememberedWalletProvider,
  restoreWalletProvider,
  type WalletConnection,
} from "@/lib/wallet";

export interface BoardSigner {
  address: Address;
  signMessage: (message: string) => Promise<string>;
}

function signerFrom(connection: WalletConnection): BoardSigner {
  return {
    address: connection.address,
    signMessage: (message: string) =>
      connection.walletClient.signMessage({ account: connection.address, message }),
  };
}

export async function restoreBoardSigner(): Promise<BoardSigner | null> {
  const found = await discoverWalletProviders();
  const rememberedId = rememberedWalletProvider();
  const candidate = found.find((item) => item.id === rememberedId);
  if (!candidate) return null;
  const restored = await restoreWalletProvider(candidate);
  return restored ? signerFrom(restored) : null;
}

export async function connectBoardSigner(): Promise<BoardSigner> {
  const found = await discoverWalletProviders();
  const target = found[0];
  if (!target) throw new Error("No browser wallet was detected. Install one, then reload this page.");
  const connection = await connectWalletProvider(target);
  rememberWalletProvider(target.id);
  return signerFrom(connection);
}

async function errorFrom(response: Response, fallback: string): Promise<string> {
  try {
    const json = (await response.json()) as { error?: string };
    return json.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function publishRun(
  signer: BoardSigner,
  run: {
    catName: string;
    archetype: string;
    params: StrategyParams;
    pnl: number;
    trades: number;
    wins: number;
    marketLabel: string;
  }
): Promise<void> {
  const nonce = Date.now();
  const signature = await signer.signMessage(publishMessage(nonce, run.catName.slice(0, 40)));
  const response = await fetch("/api/leaderboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...run, owner: signer.address, nonce, signature }),
  });
  if (!response.ok) throw new Error(await errorFrom(response, "The board did not accept this run."));
}

export async function deleteRun(signer: BoardSigner, id: string): Promise<void> {
  const nonce = Date.now();
  const signature = await signer.signMessage(deleteMessage(id, nonce));
  const response = await fetch("/api/leaderboard", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, owner: signer.address, nonce, signature }),
  });
  if (!response.ok) throw new Error(await errorFrom(response, "The entry was not deleted."));
}
