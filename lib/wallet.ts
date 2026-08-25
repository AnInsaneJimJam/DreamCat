"use client";

import {
  createWalletClient,
  custom,
  numberToHex,
  type Address,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";

export const SHANNON_CHAIN_ID = somniaShannon.id;

const SHANNON_CHAIN_HEX = numberToHex(SHANNON_CHAIN_ID);
const DISCOVERY_WINDOW_MS = 350;
const STORAGE_KEY = "dreamcat-wallet-provider";

export interface WalletProvider {
  id: string;
  name: string;
  icon: string | null;
  provider: EIP1193Provider;
}

export interface WalletConnection {
  address: Address;
  chainId: number;
  providerId: string;
  walletClient: WalletClient;
}

export interface WalletEvents {
  onAccountsChanged: (accounts: Address[]) => void;
  onChainChanged: (chainId: number) => void;
}

interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  rdns: string;
  icon?: string;
}

interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: EIP1193Provider;
}

interface BrowserWindow extends Window {
  ethereum?: EIP1193Provider & { providers?: EIP1193Provider[]; isMetaMask?: boolean };
}

function browserWindow(): BrowserWindow | null {
  return typeof window === "undefined" ? null : (window as BrowserWindow);
}

function legacyProviders(): WalletProvider[] {
  const injected = browserWindow()?.ethereum;
  if (!injected) return [];
  const list = Array.isArray(injected.providers) && injected.providers.length ? injected.providers : [injected];
  return list.map((provider, index) => ({
    id: `injected:${index}`,
    name: provider === injected && injected.isMetaMask ? "MetaMask" : index === 0 ? "Browser wallet" : `Browser wallet ${index + 1}`,
    icon: null,
    provider,
  }));
}

export function discoverWalletProviders(timeoutMs = DISCOVERY_WINDOW_MS): Promise<WalletProvider[]> {
  const view = browserWindow();
  if (!view) return Promise.resolve([]);
  return new Promise((resolve) => {
    const found = new Map<string, WalletProvider>();
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      if (!detail?.info?.rdns || !detail.provider) return;
      found.set(detail.info.rdns, {
        id: detail.info.rdns,
        name: detail.info.name || detail.info.rdns,
        icon: detail.info.icon ?? null,
        provider: detail.provider,
      });
    };
    view.addEventListener("eip6963:announceProvider", onAnnounce);
    view.dispatchEvent(new Event("eip6963:requestProvider"));
    const finish = () => {
      view.removeEventListener("eip6963:announceProvider", onAnnounce);
      const announced = [...found.values()];
      if (announced.length) {
        resolve(announced);
        return;
      }
      resolve(legacyProviders());
    };
    setTimeout(finish, timeoutMs);
  });
}

export function rememberWalletProvider(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    return;
  }
}

export function forgetWalletProvider(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}

export function rememberedWalletProvider(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function chainIdOf(provider: EIP1193Provider): Promise<number> {
  const raw = await provider.request({ method: "eth_chainId" });
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 16) : Number(raw);
  if (!Number.isFinite(parsed)) throw new Error("The wallet did not report a chain id.");
  return parsed;
}

function providerErrorCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const record = error as { code?: unknown; cause?: unknown };
  if (typeof record.code === "number") return record.code;
  return record.cause ? providerErrorCode(record.cause) : null;
}

export function isUnrecognizedChainError(error: unknown): boolean {
  const code = providerErrorCode(error);
  if (code === 4902 || code === -32602) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("unrecognized chain") || message.includes("chain with id") || message.includes("add this network");
}

export function isUserRejectedError(error: unknown): boolean {
  return providerErrorCode(error) === 4001;
}

async function addShannonChain(provider: EIP1193Provider): Promise<void> {
  await provider.request({
    method: "wallet_addEthereumChain",
    params: [{
      chainId: SHANNON_CHAIN_HEX,
      chainName: somniaShannon.name,
      nativeCurrency: somniaShannon.nativeCurrency,
      rpcUrls: [...somniaShannon.rpcUrls.default.http],
      blockExplorerUrls: [somniaShannon.blockExplorers.default.url],
    }],
  } as Parameters<EIP1193Provider["request"]>[0]);
}

export async function ensureShannonChain(provider: EIP1193Provider): Promise<number> {
  const current = await chainIdOf(provider);
  if (current === SHANNON_CHAIN_ID) return current;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SHANNON_CHAIN_HEX }],
    } as Parameters<EIP1193Provider["request"]>[0]);
  } catch (error) {
    if (isUserRejectedError(error)) {
      throw new Error("Somnia Shannon was not approved in your wallet. Approve the network switch to trade.");
    }
    if (!isUnrecognizedChainError(error)) throw error;
    await addShannonChain(provider);
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SHANNON_CHAIN_HEX }],
    } as Parameters<EIP1193Provider["request"]>[0]);
  }
  const next = await chainIdOf(provider);
  if (next !== SHANNON_CHAIN_ID) {
    throw new Error(`Your wallet is on chain ${next}. Switch it to Somnia Shannon (${SHANNON_CHAIN_ID}) to trade.`);
  }
  return next;
}

export async function ensureWalletClientChain(walletClient: WalletClient): Promise<number> {
  const current = await walletClient.getChainId();
  if (current === SHANNON_CHAIN_ID) return current;
  try {
    await walletClient.switchChain({ id: SHANNON_CHAIN_ID });
  } catch (error) {
    if (isUserRejectedError(error)) {
      throw new Error("Somnia Shannon was not approved in your wallet. Approve the network switch to trade.");
    }
    if (!isUnrecognizedChainError(error)) throw error;
    await walletClient.addChain({ chain: somniaShannon });
    await walletClient.switchChain({ id: SHANNON_CHAIN_ID });
  }
  const next = await walletClient.getChainId();
  if (next !== SHANNON_CHAIN_ID) {
    throw new Error(`Your wallet is on chain ${next}. Switch it to Somnia Shannon (${SHANNON_CHAIN_ID}) to trade.`);
  }
  return next;
}

export function walletClientFor(provider: EIP1193Provider, account: Address): WalletClient {
  return createWalletClient({ account, chain: somniaShannon, transport: custom(provider) });
}

function normalizeAccounts(value: unknown): Address[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Address => typeof item === "string" && item.startsWith("0x"));
}

export async function requestAccounts(provider: EIP1193Provider): Promise<Address[]> {
  return normalizeAccounts(await provider.request({ method: "eth_requestAccounts" }));
}

export async function readAccounts(provider: EIP1193Provider): Promise<Address[]> {
  try {
    return normalizeAccounts(await provider.request({ method: "eth_accounts" }));
  } catch {
    return [];
  }
}

export async function connectWalletProvider(target: WalletProvider): Promise<WalletConnection> {
  const accounts = await requestAccounts(target.provider);
  const address = accounts[0];
  if (!address) throw new Error("No wallet account was returned. Unlock your wallet and try again.");
  const chainId = await ensureShannonChain(target.provider);
  return {
    address,
    chainId,
    providerId: target.id,
    walletClient: walletClientFor(target.provider, address),
  };
}

export async function restoreWalletProvider(target: WalletProvider): Promise<WalletConnection | null> {
  const accounts = await readAccounts(target.provider);
  const address = accounts[0];
  if (!address) return null;
  let chainId: number;
  try {
    chainId = await chainIdOf(target.provider);
  } catch {
    return null;
  }
  return {
    address,
    chainId,
    providerId: target.id,
    walletClient: walletClientFor(target.provider, address),
  };
}

export function subscribeWalletEvents(provider: EIP1193Provider, events: WalletEvents): () => void {
  const onAccounts = (accounts: readonly string[]) => events.onAccountsChanged(normalizeAccounts(accounts));
  const onChain = (chainId: string) => {
    const parsed = typeof chainId === "string" ? Number.parseInt(chainId, 16) : Number(chainId);
    if (Number.isFinite(parsed)) events.onChainChanged(parsed);
  };
  provider.on("accountsChanged", onAccounts);
  provider.on("chainChanged", onChain);
  return () => {
    provider.removeListener("accountsChanged", onAccounts);
    provider.removeListener("chainChanged", onChain);
  };
}
