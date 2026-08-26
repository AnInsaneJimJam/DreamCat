"use client";

import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  keccak256,
  parseUnits,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { SHANNON_CHAIN_ID } from "./wallet";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.infra.testnet.somnia.network";
const STORAGE_PREFIX = "dreamcat-burner-v1:";
const DERIVATION_VERSION = "v1";

export interface BurnerWallet {
  owner: Address;
  address: Address;
  privateKey: Hex;
  walletClient: WalletClient;
}

export const SDK_GAS_LIMIT = BigInt(10_000_000);

export interface GasHeadroom {
  balance: bigint;
  required: bigint;
  ok: boolean;
}

export async function gasHeadroom(address: Address): Promise<GasHeadroom> {
  const client = getRpcClient();
  const balance = await client.getBalance({ address });
  let maxFee: bigint;
  try {
    const fees = await client.estimateFeesPerGas();
    maxFee = fees.maxFeePerGas ?? (await client.getGasPrice());
  } catch {
    maxFee = await client.getGasPrice();
  }
  const required = SDK_GAS_LIMIT * maxFee;
  return { balance, required, ok: balance >= required };
}

export interface BurnerBalances {
  gas: bigint;
  collateral: bigint;
  collateralDecimals: number;
  collateralSymbol: string;
}

const cache = new Map<string, BurnerWallet>();
let publicClient: PublicClient | null = null;

export function getRpcClient(): PublicClient {
  if (!publicClient) {
    publicClient = createPublicClient({ chain: somniaShannon, transport: http(RPC_URL) });
  }
  return publicClient;
}

export function burnerMessageFor(owner: Address): string {
  return [
    "DreamCat fleet burner wallet",
    "",
    "Signing this creates a burner wallet your cats trade from.",
    "It is derived from this signature alone, so the same wallet",
    "and account always recover the same burner.",
    "",
    `owner: ${owner.toLowerCase()}`,
    `chain: ${SHANNON_CHAIN_ID}`,
    `version: ${DERIVATION_VERSION}`,
  ].join("\n");
}

function storageKey(owner: Address): string {
  return `${STORAGE_PREFIX}${owner.toLowerCase()}`;
}

function buildBurner(owner: Address, privateKey: Hex): BurnerWallet {
  const account = privateKeyToAccount(privateKey);
  return {
    owner,
    address: account.address,
    privateKey,
    walletClient: createWalletClient({ account, chain: somniaShannon, transport: http(RPC_URL) }),
  };
}

export function cachedBurner(owner: Address): BurnerWallet | null {
  const key = owner.toLowerCase();
  const held = cache.get(key);
  if (held) return held;
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(storageKey(owner));
    if (!stored || !/^0x[0-9a-f]{64}$/i.test(stored)) return null;
    const burner = buildBurner(owner, stored as Hex);
    cache.set(key, burner);
    return burner;
  } catch {
    return null;
  }
}

export async function deriveBurner(
  owner: Address,
  signMessage: (message: string) => Promise<Hex>
): Promise<BurnerWallet> {
  const existing = cachedBurner(owner);
  if (existing) return existing;
  const signature = await signMessage(burnerMessageFor(owner));
  if (!/^0x[0-9a-f]+$/i.test(signature)) {
    throw new Error("The wallet returned an unreadable signature. Try signing again.");
  }
  const privateKey = keccak256(signature) as Hex;
  const burner = buildBurner(owner, privateKey);
  cache.set(owner.toLowerCase(), burner);
  try {
    sessionStorage.setItem(storageKey(owner), privateKey);
  } catch {
    return burner;
  }
  return burner;
}

export function forgetBurner(owner: Address): void {
  cache.delete(owner.toLowerCase());
  try {
    sessionStorage.removeItem(storageKey(owner));
  } catch {
    return;
  }
}

export async function readBurnerBalances(address: Address, collateral: Address | null): Promise<BurnerBalances> {
  const client = getRpcClient();
  const gas = await client.getBalance({ address });
  if (!collateral) {
    return { gas, collateral: BigInt(0), collateralDecimals: 6, collateralSymbol: "tUSDC" };
  }
  const [balance, decimals, symbol] = await Promise.all([
    client.readContract({ address: collateral, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    client.readContract({ address: collateral, abi: erc20Abi, functionName: "decimals" }).catch(() => 6),
    client.readContract({ address: collateral, abi: erc20Abi, functionName: "symbol" }).catch(() => "tUSDC"),
  ]);
  return {
    gas,
    collateral: balance,
    collateralDecimals: Number(decimals),
    collateralSymbol: String(symbol),
  };
}

export async function fundBurnerGas(
  ownerClient: WalletClient,
  burner: Address,
  amount: string
): Promise<Hex> {
  const account = ownerClient.account;
  if (!account) throw new Error("Connect a wallet before funding the burner.");
  return ownerClient.sendTransaction({
    account,
    chain: somniaShannon,
    to: burner,
    value: parseUnits(amount, 18),
  });
}

export async function fundBurnerCollateral(
  ownerClient: WalletClient,
  burner: Address,
  collateral: Address,
  amount: string,
  decimals: number
): Promise<Hex> {
  const account = ownerClient.account;
  if (!account) throw new Error("Connect a wallet before funding the burner.");
  return ownerClient.writeContract({
    account,
    chain: somniaShannon,
    address: collateral,
    abi: erc20Abi,
    functionName: "transfer",
    args: [burner, parseUnits(amount, decimals)],
  });
}

export async function sweepBurner(
  burner: BurnerWallet,
  collateral: Address | null
): Promise<{ collateralHash?: Hex; gasHash?: Hex }> {
  const client = getRpcClient();
  const account = burner.walletClient.account;
  if (!account) throw new Error("The burner wallet is locked.");
  const result: { collateralHash?: Hex; gasHash?: Hex } = {};

  if (collateral) {
    const balance = await client.readContract({
      address: collateral,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [burner.address],
    });
    if (balance > BigInt(0)) {
      result.collateralHash = await burner.walletClient.writeContract({
        account,
        chain: somniaShannon,
        address: collateral,
        abi: erc20Abi,
        functionName: "transfer",
        args: [burner.owner, balance],
      });
      await client.waitForTransactionReceipt({ hash: result.collateralHash });
    }
  }

  const gas = await client.getBalance({ address: burner.address });
  const gasPrice = await client.getGasPrice();
  const reserve = gasPrice * BigInt(21000) * BigInt(2);
  if (gas > reserve) {
    result.gasHash = await burner.walletClient.sendTransaction({
      account,
      chain: somniaShannon,
      to: burner.owner,
      value: gas - reserve,
    });
  }
  return result;
}
