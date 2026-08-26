"use client";

import { ArrowsClockwise, Copy, Lightning, SignOut, Wallet } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatUnits, type Address, type Hex, type WalletClient } from "viem";
import {
  cachedBurner,
  deriveBurner,
  forgetBurner,
  fundBurnerCollateral,
  fundBurnerGas,
  gasHeadroom,
  readBurnerBalances,
  sweepBurner,
  type BurnerBalances,
  type GasHeadroom,
  type BurnerWallet,
} from "@/lib/burner";
import { setFleetBurner } from "@/lib/fleet-runner";
import {
  connectWalletProvider,
  discoverWalletProviders,
  rememberWalletProvider,
  rememberedWalletProvider,
  restoreWalletProvider,
  type WalletProvider,
} from "@/lib/wallet";

const BALANCE_POLL_MS = 12000;

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

function amountLabel(raw: bigint, decimals: number, places = 4): string {
  const value = Number(formatUnits(raw, decimals));
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(places);
}

export default function BurnerPanel({ collateral }: { collateral: Address | null }) {
  const [providers, setProviders] = useState<WalletProvider[]>([]);
  const [owner, setOwner] = useState<Address | null>(null);
  const [ownerClient, setOwnerClient] = useState<WalletClient | null>(null);
  const [burner, setBurner] = useState<BurnerWallet | null>(null);
  const [balances, setBalances] = useState<BurnerBalances | null>(null);
  const [headroom, setHeadroom] = useState<GasHeadroom | null>(null);
  const [gasAmount, setGasAmount] = useState("1");
  const [fundAmount, setFundAmount] = useState("25");
  const [busy, setBusy] = useState<"connect" | "unlock" | "gas" | "fund" | "sweep" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const pollingRef = useRef(false);

  useEffect(() => {
    const kick = setTimeout(() => {
      void discoverWalletProviders().then(async (found) => {
        setProviders(found);
        const rememberedId = rememberedWalletProvider();
        const candidate = found.find((item) => item.id === rememberedId);
        if (!candidate) return;
        const restored = await restoreWalletProvider(candidate);
        if (!restored) return;
        setOwner(restored.address);
        setOwnerClient(restored.walletClient);
      });
    }, 0);
    return () => clearTimeout(kick);
  }, []);

  useEffect(() => {
    if (!owner) return;
    const kick = setTimeout(() => setBurner(cachedBurner(owner)), 0);
    return () => clearTimeout(kick);
  }, [owner]);

  useEffect(() => {
    setFleetBurner(burner);
  }, [burner]);

  const refreshBalances = useCallback(async () => {
    if (!burner || pollingRef.current) return;
    pollingRef.current = true;
    try {
      const [next, gas] = await Promise.all([
        readBurnerBalances(burner.address, collateral),
        gasHeadroom(burner.address).catch(() => null),
      ]);
      setBalances(next);
      setHeadroom(gas);
    } catch {
      return;
    } finally {
      pollingRef.current = false;
    }
  }, [burner, collateral]);

  useEffect(() => {
    if (!burner) return;
    const kick = setTimeout(() => void refreshBalances(), 0);
    const timer = setInterval(() => void refreshBalances(), BALANCE_POLL_MS);
    return () => {
      clearTimeout(kick);
      clearInterval(timer);
    };
  }, [burner, refreshBalances]);

  const connect = useCallback(async () => {
    setError("");
    setBusy("connect");
    try {
      let list = providers;
      if (list.length === 0) {
        list = await discoverWalletProviders();
        setProviders(list);
      }
      const target = list[0];
      if (!target) {
        setError("No browser wallet was detected. Install one, then reload this page.");
        return;
      }
      const connection = await connectWalletProvider(target);
      rememberWalletProvider(target.id);
      setOwner(connection.address);
      setOwnerClient(connection.walletClient);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The wallet did not connect.");
    } finally {
      setBusy(null);
    }
  }, [providers]);

  const unlock = useCallback(async () => {
    if (!owner || !ownerClient) return;
    setError("");
    setBusy("unlock");
    try {
      const next = await deriveBurner(owner, async (message) => {
        const account = ownerClient.account;
        if (!account) throw new Error("Reconnect your wallet before signing.");
        return (await ownerClient.signMessage({ account, message })) as Hex;
      });
      setBurner(next);
      setNotice("Burner unlocked. Fund it to let the cats trade.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The signature was rejected.");
    } finally {
      setBusy(null);
    }
  }, [owner, ownerClient]);

  const sendGas = useCallback(async () => {
    if (!ownerClient || !burner) return;
    setError("");
    setNotice("");
    setBusy("gas");
    try {
      await fundBurnerGas(ownerClient, burner.address, gasAmount);
      setNotice(`Sent ${gasAmount} STT for gas.`);
      await refreshBalances();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The gas transfer failed.");
    } finally {
      setBusy(null);
    }
  }, [ownerClient, burner, gasAmount, refreshBalances]);

  const sendCollateral = useCallback(async () => {
    if (!ownerClient || !burner || !collateral || !balances) return;
    setError("");
    setNotice("");
    setBusy("fund");
    try {
      await fundBurnerCollateral(ownerClient, burner.address, collateral, fundAmount, balances.collateralDecimals);
      setNotice(`Sent ${fundAmount} ${balances.collateralSymbol} to the cats.`);
      await refreshBalances();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The transfer failed.");
    } finally {
      setBusy(null);
    }
  }, [ownerClient, burner, collateral, balances, fundAmount, refreshBalances]);

  const sweep = useCallback(async () => {
    if (!burner) return;
    setError("");
    setNotice("");
    setBusy("sweep");
    try {
      await sweepBurner(burner, collateral);
      setNotice("Returned the burner balance to your wallet.");
      await refreshBalances();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The return transfer failed.");
    } finally {
      setBusy(null);
    }
  }, [burner, collateral, refreshBalances]);

  const copyAddress = useCallback(() => {
    if (!burner) return;
    void navigator.clipboard.writeText(burner.address).then(
      () => setCopied(true),
      () => setError("The address could not be copied.")
    );
  }, [burner]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const lock = useCallback(() => {
    if (!owner) return;
    forgetBurner(owner);
    setBurner(null);
    setBalances(null);
    setNotice("Burner locked. Sign again to restore the same wallet.");
  }, [owner]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Wallet aria-hidden="true" className="text-brand" size={15} />
        <h3 className="text-[10px] uppercase tracking-[0.18em] text-text-3">Cat wallet</h3>
      </div>

      {!owner ? (
        <>
          <p className="text-[11px] leading-4 text-text-3">
            Connect a wallet to create the burner your cats trade from.
          </p>
          <button type="button" onClick={() => void connect()} disabled={busy === "connect"} className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface-1 px-3 text-xs font-semibold text-text-1 transition-colors duration-150 hover:border-brand/60 hover:text-brand disabled:opacity-50">
            {busy === "connect" ? "Connecting" : "Connect wallet"}
          </button>
        </>
      ) : !burner ? (
        <>
          <p className="num text-[11px] text-text-3">owner {short(owner)}</p>
          <p className="text-[11px] leading-4 text-text-3">
            Sign once to derive the burner. The same wallet always recovers the same address.
          </p>
          <button type="button" onClick={() => void unlock()} disabled={busy === "unlock"} className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand px-3 text-xs font-semibold text-brand-ink transition-colors duration-150 hover:bg-brand-strong disabled:opacity-50">
            <Lightning aria-hidden="true" size={14} weight="fill" />
            {busy === "unlock" ? "Waiting for signature" : "Create cat wallet"}
          </button>
        </>
      ) : (
        <>
          <div className="rounded-[var(--radius-control)] border border-line bg-surface-1 px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="num truncate text-[11px] text-text-2">{short(burner.address)}</span>
              <button type="button" onClick={copyAddress} aria-label="Copy burner address" className="flex min-h-8 min-w-8 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-brand">
                <Copy aria-hidden="true" size={14} />
              </button>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-text-3">Gas</dt>
                <dd className="num text-sm font-semibold text-text-1">{balances ? amountLabel(balances.gas, 18) : "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-text-3">{balances?.collateralSymbol ?? "tUSDC"}</dt>
                <dd className="num text-sm font-semibold text-text-1">{balances ? amountLabel(balances.collateral, balances.collateralDecimals, 2) : "—"}</dd>
              </div>
            </dl>
            {headroom && !headroom.ok ? (
              <p className="mt-2 text-[10px] leading-4 text-sell">
                Needs at least {(Number(headroom.required) / 1e18).toFixed(3)} STT to submit an order. Each transaction reserves a 10,000,000 gas ceiling upfront; unused gas is refunded.
              </p>
            ) : headroom ? (
              <p className="mt-2 text-[10px] leading-4 text-text-3">
                Reserve per order {(Number(headroom.required) / 1e18).toFixed(3)} STT. Unused gas is refunded.
              </p>
            ) : null}
            {copied ? <p className="mt-1 text-[10px] text-buy" role="status">Address copied</p> : null}
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label htmlFor="burner-gas" className="sr-only">Gas amount in STT</label>
            <input id="burner-gas" value={gasAmount} onChange={(event) => setGasAmount(event.target.value)} inputMode="decimal" className="num min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-line bg-surface-1 px-2 text-xs text-text-1 outline-none focus:border-brand" />
            <button type="button" onClick={() => void sendGas()} disabled={busy !== null} className="min-h-11 cursor-pointer rounded-[var(--radius-control)] border border-line-strong px-3 text-xs font-semibold text-text-1 transition-colors duration-150 hover:border-brand/60 hover:text-brand disabled:opacity-50">
              {busy === "gas" ? "Sending" : "Send gas"}
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label htmlFor="burner-fund" className="sr-only">Collateral amount</label>
            <input id="burner-fund" value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} inputMode="decimal" disabled={!collateral} className="num min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-line bg-surface-1 px-2 text-xs text-text-1 outline-none focus:border-brand disabled:opacity-50" />
            <button type="button" onClick={() => void sendCollateral()} disabled={busy !== null || !collateral} className="min-h-11 cursor-pointer rounded-[var(--radius-control)] bg-brand px-3 text-xs font-semibold text-brand-ink transition-colors duration-150 hover:bg-brand-strong disabled:opacity-50">
              {busy === "fund" ? "Sending" : "Fund cats"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void sweep()} disabled={busy !== null} className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong px-2 text-xs font-semibold text-text-2 transition-colors duration-150 hover:text-text-1 disabled:opacity-50">
              <ArrowsClockwise aria-hidden="true" size={13} />
              {busy === "sweep" ? "Returning" : "Return funds"}
            </button>
            <button type="button" onClick={lock} className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong px-2 text-xs font-semibold text-text-2 transition-colors duration-150 hover:text-sell">
              <SignOut aria-hidden="true" size={13} />
              Lock
            </button>
          </div>

          {!collateral ? (
            <p className="text-[11px] leading-4 text-text-3">Collateral token unavailable from the market feed, so funding is disabled.</p>
          ) : null}
        </>
      )}

      {error ? <p className="text-[11px] leading-4 text-sell" role="alert">{error}</p> : null}
      {notice && !error ? <p className="text-[11px] leading-4 text-text-3" role="status">{notice}</p> : null}
    </div>
  );
}
