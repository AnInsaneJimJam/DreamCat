"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, WalletClient } from "viem";
import { CaretDown, Wallet } from "@phosphor-icons/react";
import { useNow } from "@/lib/use-now";
import PriceChart from "@/components/PriceChart";
import SpotFlowPanel from "@/components/SpotFlowPanel";
import AppChrome from "@/components/AppChrome";
import { getExchange, listLiveMarkets, watchBook, watchFills, type BookSnapshot, type Fill, type LiveMarketRow } from "@/lib/dreamdex";
import { placeManualTrade, type ManualTradeInput } from "@/lib/trading";
import { cancelChainOrder } from "@/lib/market-universe/chain-execution";
import {
  connectWalletProvider,
  discoverWalletProviders,
  ensureShannonChain,
  forgetWalletProvider,
  rememberWalletProvider,
  rememberedWalletProvider,
  restoreWalletProvider,
  SHANNON_CHAIN_ID,
  subscribeWalletEvents,
  walletClientFor,
  type WalletConnection,
  type WalletProvider,
} from "@/lib/wallet";
import type { SpotAsset } from "@/lib/spot-flow";

const fmtCompact = (n: number) =>
  Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

const fmtProb = (n: number) => `${(n * 100).toFixed(1)}%`;

type Outcome = "YES" | "NO";
type OrderSide = "buy" | "sell";
type OrderType = "limit" | "market";
type OrderField = "amount" | "price" | "slippage";

interface LastOrder {
  amount: number;
  filled: number;
  id: string;
  outcome: Outcome;
  price: number;
  side: OrderSide;
  status: string;
  symbol: string;
  type: OrderType;
  marketId: string;
  chainContext: LiveMarketRow;
}

const CHAIN_ORDER_ID = /^\d+$/;
const CHAIN_MARKET_ID = /^0x[0-9a-f]{64}$/i;

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.split("\n")[0].slice(0, 180);
  return "The request could not be completed.";
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function Ttm({ expiry, now }: { expiry: number; now: number }) {
  const ms = expiry - now;
  if (ms <= 0) return <span className="num text-muted">expired</span>;
  if (ms >= 3_600_000) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return <span className="num text-muted">{`${h}h ${String(m).padStart(2, "0")}m`}</span>;
  }
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const urgent = ms < 60_000;
  return (
    <span className={`num ${urgent ? "text-down" : "text-foreground"}`}>
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

function PressureRibbon({ buyPct }: { buyPct: number }) {
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
      <div
        className="h-full bg-up ease-terminal transition-[width] duration-500"
        style={{ width: `${buyPct}%` }}
      />
      <div className="h-full flex-1 bg-down/70" />
    </div>
  );
}

function BookLadder({ book }: { book: BookSnapshot }) {
  const maxQty = Math.max(...book.bids.map((l) => l.qty), ...book.asks.map((l) => l.qty), 1e-9);
  const row = (level: { price: number; qty: number }, side: "bid" | "ask") => (
    <div key={`${side}-${level.price}`} className="relative flex items-center justify-between px-3 py-[3px] text-xs">
      <div
        className={`absolute inset-y-0 ${side === "bid" ? "left-0 bg-up/[0.08]" : "right-0 bg-down/[0.08]"} ease-terminal transition-[width] duration-300`}
        style={{ width: `${(level.qty / maxQty) * 100}%` }}
      />
      <span className={`num relative ${side === "bid" ? "text-up" : "text-down"}`}>
        {fmtProb(level.price)}
      </span>
      <span className="num relative text-muted">{fmtCompact(level.qty)}</span>
    </div>
  );
  return (
    <div>
      <div className="flex justify-between px-3 pb-1 text-[10px] uppercase tracking-[0.15em] text-muted">
        <span>Price</span>
        <span>Size</span>
      </div>
      {[...book.asks].reverse().map((l) => row(l, "ask"))}
      {book.mid != null && (
        <div className="my-1 flex items-center justify-between border-y border-hairline px-3 py-1.5">
          <span className="num text-sm font-semibold text-amber">{fmtProb(book.mid)}</span>
          <span className="num text-[10px] text-muted">
            spread {book.spread != null ? fmtProb(book.spread) : "Unavailable"}
          </span>
        </div>
      )}
      {book.bids.map((l) => row(l, "bid"))}
    </div>
  );
}

function Tape({ fills }: { fills: Fill[] }) {
  if (!fills.length) return <p className="px-3 py-2 text-xs text-muted">No prints yet.</p>;
  return (
    <div className="space-y-[2px]">
      {fills.slice(0, 10).map((f, i) => (
        <div key={`${f.ts}-${i}`} className="flex justify-between px-3 py-[2px] text-xs">
          <span className={f.side === "buy" ? "text-up" : "text-down"}>{f.side}</span>
          <span className="num text-muted">{fmtProb(f.price)}</span>
          <span className="num text-muted">{fmtCompact(f.qty)}</span>
          <span className="num text-muted">
            {new Date(f.ts).toLocaleTimeString("en-GB", { hour12: false })}
          </span>
        </div>
      ))}
    </div>
  );
}

function Stats({ market, book }: { market: LiveMarketRow; book: BookSnapshot | null }) {
  const rows: Array<[string, string]> = [
    ["Quote volume", `$${fmtCompact(market.volumeQuote)}`],
    ["Trades", String(market.tradeCount)],
    ["Interval", market.interval || "Unavailable"],
    ["Bid depth", book ? fmtCompact(book.bidDepth) : "Unavailable"],
    ["Ask depth", book ? fmtCompact(book.askDepth) : "Unavailable"],
  ];
  return (
    <dl className="space-y-1.5 px-3 pb-3">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between text-xs">
          <dt className="text-muted">{k}</dt>
          <dd className="num">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-hairline bg-panel p-1.5">
      <div className="rounded-lg bg-panel-raised px-0.5 py-0.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
        <h2 className="px-3 pt-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

export default function Terminal() {
  const [markets, setMarkets] = useState<LiveMarketRow[]>([]);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bookState, setBookState] = useState<{ id: string; book: BookSnapshot } | null>(null);
  const [fillsState, setFillsState] = useState<{ id: string; fills: Fill[] } | null>(null);
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [walletProviders, setWalletProviders] = useState<WalletProvider[]>([]);
  const [walletProviderId, setWalletProviderId] = useState<string | null>(null);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>("YES");
  const [orderSide, setOrderSide] = useState<OrderSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [slippage, setSlippage] = useState("1");
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderNotice, setOrderNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const [touchedFields, setTouchedFields] = useState<Record<OrderField, boolean>>({ amount: false, price: false, slippage: false });
  const [orderAttempted, setOrderAttempted] = useState(false);
  const [chartAsset, setChartAsset] = useState<SpotAsset>("BTC");
  const now = useNow();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  const refreshMarkets = useCallback(async () => {
    try {
      const rows = await listLiveMarkets();
      setMarkets(rows);
      setMarketsError(null);
      setConnected(true);
      setSelectedId((cur) =>
        cur && rows.some((r) => r.id === cur) ? cur : (rows[0]?.id ?? null)
      );
    } catch {
      setConnected(false);
      setMarketsError("DreamDEX markets are temporarily unavailable.");
    }
  }, []);

  useEffect(() => {
    const kick = setTimeout(refreshMarkets, 0);
    const t = setInterval(refreshMarkets, 5000);
    return () => {
      clearTimeout(kick);
      clearInterval(t);
    };
  }, [refreshMarkets]);

  const selected = useMemo(
    () => markets.find((m) => m.id === selectedId) ?? null,
    [markets, selectedId]
  );
  const selectedRef = useRef<LiveMarketRow | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  const book = bookState && bookState.id === selected?.id ? bookState.book : null;
  const fills = fillsState && fillsState.id === selected?.id ? fillsState.fills : [];
  const outcomeMid = book?.mid == null ? null : outcome === "YES" ? book.mid : 1 - book.mid;

  const watchId = selected?.id ?? null;
  const watchSymbol = selected?.yesSymbol ?? "";
  const watchMode = selected?.executionMode ?? null;
  const watchReady = selected?.executionReady ?? null;

  useEffect(() => {
    if (watchId == null || watchReady === false) return;
    const market = selectedRef.current;
    if (!market || market.id !== watchId) return;
    const id = watchId;
    const stopBook = watchBook(market.yesSymbol, (b) => {
      if (b.bids.length || b.asks.length) setBookState({ id, book: b });
    }, market);
    const stopFills = watchFills(market.yesSymbol, (f) => setFillsState({ id, fills: f }));
    return () => {
      stopBook();
      stopFills();
    };
  }, [watchId, watchSymbol, watchMode, watchReady]);

  const activeWalletProvider = useMemo(
    () => walletProviders.find((entry) => entry.id === walletProviderId) ?? null,
    [walletProviderId, walletProviders]
  );
  const wrongNetwork = walletAddress != null && walletChainId != null && walletChainId !== SHANNON_CHAIN_ID;

  const applyConnection = useCallback((connection: WalletConnection) => {
    getExchange().setSigner({ walletClient: connection.walletClient });
    setWalletProviderId(connection.providerId);
    setWalletAddress(connection.address);
    setWalletClient(connection.walletClient);
    setWalletChainId(connection.chainId);
    setWalletError(null);
  }, []);

  const clearConnection = useCallback(() => {
    getExchange().setSigner({});
    setWalletAddress(null);
    setWalletClient(null);
    setWalletChainId(null);
    setOrderNotice(null);
  }, []);

  useEffect(() => {
    let alive = true;
    const kick = setTimeout(() => {
      void discoverWalletProviders().then((found) => {
        if (alive) setWalletProviders(found);
      });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(kick);
    };
  }, []);

  useEffect(() => {
    if (!walletProviders.length) return;
    let alive = true;
    const kick = setTimeout(() => {
      void (async () => {
        const remembered = rememberedWalletProvider();
        const preferred = remembered ? walletProviders.filter((entry) => entry.id === remembered) : [];
        for (const candidate of [...preferred, ...walletProviders]) {
          const restored = await restoreWalletProvider(candidate);
          if (!alive) return;
          if (restored) {
            applyConnection(restored);
            return;
          }
        }
      })();
    }, 0);
    return () => {
      alive = false;
      clearTimeout(kick);
    };
  }, [applyConnection, walletProviders]);

  useEffect(() => {
    if (!activeWalletProvider) return;
    const provider = activeWalletProvider.provider;
    return subscribeWalletEvents(provider, {
      onAccountsChanged: (accounts) => {
        const next = accounts[0];
        if (!next) {
          clearConnection();
          return;
        }
        const nextClient = walletClientFor(provider, next);
        getExchange().setSigner({ walletClient: nextClient });
        setWalletAddress(next);
        setWalletClient(nextClient);
        setWalletError(null);
      },
      onChainChanged: (chainId) => setWalletChainId(chainId),
    });
  }, [activeWalletProvider, clearConnection]);

  const connectTo = useCallback(async (target: WalletProvider) => {
    setWalletPickerOpen(false);
    setWalletBusy(true);
    setWalletError(null);
    try {
      const connection = await connectWalletProvider(target);
      rememberWalletProvider(target.id);
      applyConnection(connection);
    } catch (error) {
      setWalletError(errorMessage(error));
    } finally {
      setWalletBusy(false);
    }
  }, [applyConnection]);

  const connectWallet = useCallback(async () => {
    if (walletAddress) {
      forgetWalletProvider();
      setWalletProviderId(null);
      setWalletError(null);
      setWalletPickerOpen(false);
      clearConnection();
      return;
    }
    if (walletPickerOpen) {
      setWalletPickerOpen(false);
      return;
    }
    let found = walletProviders;
    if (!found.length) {
      found = await discoverWalletProviders();
      setWalletProviders(found);
    }
    if (!found.length) {
      setWalletError("No browser wallet detected. Install a wallet extension to trade.");
      return;
    }
    if (found.length === 1) {
      await connectTo(found[0]);
      return;
    }
    const remembered = rememberedWalletProvider();
    const preferred = remembered ? found.find((entry) => entry.id === remembered) : undefined;
    if (preferred) {
      await connectTo(preferred);
      return;
    }
    setWalletPickerOpen(true);
  }, [clearConnection, connectTo, walletAddress, walletPickerOpen, walletProviders]);

  const switchNetwork = useCallback(async () => {
    if (!activeWalletProvider) return;
    setWalletBusy(true);
    setWalletError(null);
    try {
      const chainId = await ensureShannonChain(activeWalletProvider.provider);
      setWalletChainId(chainId);
    } catch (error) {
      setWalletError(errorMessage(error));
    } finally {
      setWalletBusy(false);
    }
  }, [activeWalletProvider]);

  const formError = useMemo(() => {
    if (!selected) return "Select a live market first.";
    if (selected.status !== "Trading") return "This market is no longer trading.";
    if (selected.executionReady === false) return "This market was discovered on-chain; execution metadata is still indexing.";
    if (selected.executionMode !== "chain-pool" && !selected.yesSymbol) return "This market has no executable outcome symbol yet.";
    if (wrongNetwork) return `Your wallet is on chain ${walletChainId}. Switch to Somnia Shannon to sign this order.`;
    const amountValue = Number(amount);
    if (!amount.trim() || !Number.isFinite(amountValue) || amountValue <= 0) return "Enter an amount greater than zero.";
    if (orderType === "limit") {
      const priceValue = Number(price);
      if (!price.trim() || !Number.isFinite(priceValue) || priceValue <= 0 || priceValue >= 100) {
        return "Limit probability must be between 0% and 100%.";
      }
    } else {
      const slippageValue = Number(slippage);
      if (!slippage.trim() || !Number.isFinite(slippageValue) || slippageValue < 0 || slippageValue > 100) {
        return "Slippage must be between 0% and 100%.";
      }
    }
    if (!walletAddress || !walletClient) return "Connect a Somnia Shannon wallet to sign this order.";
    return null;
  }, [amount, orderType, price, selected, slippage, walletAddress, walletChainId, walletClient, wrongNetwork]);

  const amountInvalid = !amount.trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0;
  const priceInvalid = !price.trim() || !Number.isFinite(Number(price)) || Number(price) <= 0 || Number(price) >= 100;
  const slippageInvalid = !slippage.trim() || !Number.isFinite(Number(slippage)) || Number(slippage) < 0 || Number(slippage) > 100;
  const errorField: OrderField | null = formError?.startsWith("Enter an amount")
    ? "amount"
    : formError?.startsWith("Limit probability")
      ? "price"
      : formError?.startsWith("Slippage")
        ? "slippage"
        : null;
  const marketUnavailable = formError?.startsWith("This market") ?? false;
  const showFormError = Boolean(formError && (orderAttempted || marketUnavailable || wrongNetwork || (errorField && touchedFields[errorField])));

  const submitOrder = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOrderAttempted(true);
    if (!selected || !walletClient || formError || orderBusy) return;
    setOrderBusy(true);
    setOrderNotice(null);
    try {
      const input: ManualTradeInput = {
        marketId: selected.id,
        outcome,
        side: orderSide,
        type: orderType,
        amount,
        ...(selected.executionMode === "chain-pool" ? { chainContext: selected } : {}),
        ...(orderType === "limit" ? { price: Number(price) / 100 } : { slippage: Number(slippage) / 100 }),
      };
      const order = await placeManualTrade(walletClient, input);
      setLastOrder({
        amount: order.amount,
        filled: order.filled,
        id: order.id,
        outcome,
        price: order.price,
        side: orderSide,
        status: order.status,
        symbol: order.symbol,
        type: orderType,
        marketId: selected.id,
        chainContext: selected,
      });
      setAmount("");
      setTouchedFields({ amount: false, price: false, slippage: false });
      setOrderAttempted(false);
      setOrderNotice({
        kind: "success",
        text: `${orderSide === "buy" ? "Buy" : "Sell"} ${outcome} order ${order.status}.`,
      });
    } catch (error) {
      setOrderNotice({ kind: "error", text: errorMessage(error) });
    } finally {
      setOrderBusy(false);
    }
  }, [amount, formError, orderBusy, orderSide, orderType, outcome, price, selected, slippage, walletClient]);

  const cancelLastOrder = useCallback(async () => {
    if (!lastOrder || !walletClient || lastOrder.status !== "open" || orderBusy) return;
    setOrderBusy(true);
    setOrderNotice(null);
    try {
      const isChainOrder =
        (lastOrder.chainContext.executionMode === "chain-pool" || CHAIN_ORDER_ID.test(lastOrder.id)) &&
        CHAIN_MARKET_ID.test(lastOrder.marketId);
      const canceled = isChainOrder
        ? await cancelChainOrder(walletClient, lastOrder.marketId, lastOrder.id, lastOrder.chainContext)
        : await getExchange().cancelOrder(lastOrder.id, lastOrder.symbol);
      setLastOrder((current) => current ? { ...current, status: canceled.status } : current);
      setOrderNotice({ kind: "success", text: "Resting order canceled." });
    } catch (error) {
      setOrderNotice({ kind: "error", text: errorMessage(error) });
    } finally {
      setOrderBusy(false);
    }
  }, [lastOrder, orderBusy, walletClient]);

  const visible = showAll ? markets : markets.slice(0, 10);
  const limitPrice = Number(price) / 100;
  const estimatedPrice = orderType === "limit" && price.trim() && Number.isFinite(limitPrice) && limitPrice > 0 && limitPrice < 1
    ? limitPrice
    : outcomeMid;
  const orderValue = amount.trim() && estimatedPrice != null && Number.isFinite(Number(amount)) && Number(amount) > 0
    ? Number(amount) * estimatedPrice
    : null;

  if (!mounted) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="num text-xs text-muted">Booting terminal</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh min-w-0 max-w-full flex-col overflow-x-hidden pb-24 md:pb-0">
      <AppChrome current="terminal" networkState={connected ? "live" : "connecting"} />
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-3 py-2 text-[11px] text-text-2 sm:px-6 lg:px-8">
        <h1 className="font-display text-sm font-semibold tracking-[-0.02em] text-text-1">Trading terminal</h1>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <span className="hidden sm:inline">Market data</span>
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-buy" : "bg-sell"}`} />
            {connected ? "Live" : "Connecting"}
          </span>
          {wrongNetwork && (
            <button
              type="button"
              onClick={switchNetwork}
              disabled={walletBusy}
              className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-sell/60 bg-sell/10 px-2.5 py-1 text-[11px] text-sell ease-terminal transition-colors hover:bg-sell/20 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 md:min-h-9"
            >
              {walletBusy ? "Switching" : "Switch to Somnia Shannon"}
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={connectWallet}
              disabled={walletBusy}
              aria-expanded={walletPickerOpen}
              className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong px-2.5 py-1 text-[11px] text-brand ease-terminal transition-colors hover:bg-surface-1 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 md:min-h-9"
              aria-label={walletAddress ? `Disconnect wallet ${walletAddress}` : "Connect wallet"}
            >
              <Wallet size={14} weight="regular" aria-hidden="true" />
              {walletBusy ? "Connecting" : walletAddress ? shortAddress(walletAddress) : "Connect wallet"}
            </button>
            {walletPickerOpen && !walletAddress && (
              <div
                role="menu"
                aria-label="Choose a wallet"
                className="absolute right-0 z-50 mt-1.5 w-56 rounded-[var(--radius-panel)] border border-line-strong bg-surface-2 p-1 shadow-2xl"
              >
                {walletProviders.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="menuitem"
                    onClick={() => { void connectTo(entry); }}
                    className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 text-left text-[11px] text-text-1 ease-terminal transition-colors hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-[-2px]"
                  >
                    {entry.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.icon} alt="" aria-hidden="true" className="h-4 w-4 rounded" />
                    ) : (
                      <Wallet size={16} weight="regular" aria-hidden="true" className="text-text-2" />
                    )}
                    {entry.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="num hidden md:inline">{new Date(now).toISOString().slice(11, 19)} UTC</span>
        </div>
      </div>

      <main className="flex min-w-0 max-w-full flex-1 flex-col gap-3 overflow-x-hidden p-3">
        <div className="grid min-w-0 items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <PriceChart asset={chartAsset} onAssetChange={setChartAsset} />
          {selected ? (
            <Panel title="Manual order">
              <form onSubmit={submitOrder} className="space-y-3 px-3 pb-3" aria-label="Manual order ticket">
                <div className="rounded-md border border-hairline bg-background/70 px-2.5 py-2">
                  <div className="flex items-center justify-between text-[10px] text-muted">
                    <span className="num font-medium text-amber">{selected.asset} / {selected.interval}</span>
                    <span className="num"><Ttm expiry={selected.expiry} now={now} /></span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/90">{selected.question}</p>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
                    <span>{selected.windowLabel}</span>
                    <span className="num">YES {book?.mid != null ? fmtProb(book.mid) : "Unavailable"}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1 rounded-md border border-hairline bg-background p-0.5" role="group" aria-label="Order side">
                  {(["buy", "sell"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={orderSide === value}
                      onClick={() => setOrderSide(value)}
                      className={`min-h-11 rounded-[4px] px-2 text-xs font-semibold capitalize ease-terminal transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 md:min-h-9 ${
                        orderSide === value
                          ? value === "buy"
                            ? "bg-up text-background shadow-[0_0_18px_rgba(34,197,94,0.12)]"
                            : "bg-down text-foreground shadow-[0_0_18px_rgba(239,68,68,0.12)]"
                          : "text-muted hover:bg-white/[0.05] hover:text-foreground"
                      }`}
                    >
                      {value === "buy" ? "Buy" : "Sell"}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5" role="group" aria-label="Outcome">
                  <span className="mr-1 text-[10px] text-muted">Contract</span>
                  {(["YES", "NO"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={outcome === value}
                      onClick={() => setOutcome(value)}
                      className={`min-h-11 rounded-md border px-3 py-1.5 text-[11px] font-medium ease-terminal transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 md:min-h-9 ${
                        outcome === value
                          ? value === "YES"
                            ? "border-up/50 bg-up/[0.12] text-up"
                            : "border-down/50 bg-down/[0.12] text-down"
                          : "border-hairline text-muted hover:bg-white/[0.04] hover:text-foreground"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between border-b border-hairline pb-1" role="group" aria-label="Order type">
                  <div className="flex items-center gap-4">
                    {(["limit", "market"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={orderType === value}
                        onClick={() => setOrderType(value)}
                        className={`relative min-h-11 py-1 text-[11px] capitalize ease-terminal transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 md:min-h-9 ${
                          orderType === value
                            ? "font-medium text-foreground after:absolute after:inset-x-0 after:-bottom-[5px] after:h-0.5 after:bg-amber"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-muted">Live book</span>
                </div>
                <div>
                  <label htmlFor="order-amount" className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
                    <span>Amount</span>
                    <span className="text-[10px]">contracts</span>
                  </label>
                  <div className="relative">
                    <input
                      id="order-amount"
                      name="amount"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={amount}
                      onChange={(event) => {
                        setTouchedFields((current) => ({ ...current, amount: true }));
                        setAmount(event.target.value);
                      }}
                      placeholder="0.00"
                      aria-describedby="order-amount-help"
                      aria-invalid={Boolean((touchedFields.amount || orderAttempted) && amountInvalid)}
                      className="num w-full rounded-md border border-hairline bg-background px-3 py-2.5 pr-20 text-sm text-foreground placeholder:text-muted/50 focus:border-amber/60 focus:outline-none focus:ring-1 focus:ring-amber/40"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-muted">contracts</span>
                  </div>
                  <p id="order-amount-help" className="mt-1 text-[10px] text-muted">Venue lot size is checked before signing.</p>
                </div>
                {orderType === "limit" ? (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label htmlFor="order-price" className="text-[11px] text-muted">Limit price</label>
                      <button
                        type="button"
                        onClick={() => outcomeMid != null && setPrice((outcomeMid * 100).toFixed(2))}
                        disabled={outcomeMid == null}
                        className="min-h-11 rounded border border-hairline px-2 py-1 text-[10px] text-muted hover:bg-white/[0.04] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 md:min-h-9"
                      >
                        Mid {outcomeMid != null ? fmtProb(outcomeMid) : "Unavailable"}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="order-price"
                        name="price"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="100"
                        step="0.01"
                        value={price}
                        onChange={(event) => {
                          setTouchedFields((current) => ({ ...current, price: true }));
                          setPrice(event.target.value);
                        }}
                        placeholder="50.00"
                        aria-describedby="order-price-help"
                        aria-invalid={Boolean((touchedFields.price || orderAttempted) && priceInvalid)}
                        className="num w-full rounded-md border border-hairline bg-background px-3 py-2.5 pr-24 text-sm text-foreground placeholder:text-muted/50 focus:border-amber/60 focus:outline-none focus:ring-1 focus:ring-amber/40"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-muted">%</span>
                    </div>
                    <p id="order-price-help" className="mt-1 text-[10px] text-muted">Probability from 0% to 100%.</p>
                  </div>
                ) : (
                  <details className="rounded-md border border-hairline/70 bg-background/40 group">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-2.5 py-2 text-[11px] text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 md:min-h-9">
                      <span>Advanced</span>
                      <CaretDown size={14} weight="regular" aria-hidden="true" className="transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-hairline px-2.5 pb-2.5 pt-2">
                      <label htmlFor="order-slippage" className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
                        <span>Max slippage</span>
                        <span className="text-[10px]">percent</span>
                      </label>
                      <div className="relative">
                        <input
                          id="order-slippage"
                          name="slippage"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="100"
                          step="0.1"
                          value={slippage}
                          onChange={(event) => {
                            setTouchedFields((current) => ({ ...current, slippage: true }));
                            setSlippage(event.target.value);
                          }}
                          aria-describedby="order-slippage-help"
                          aria-invalid={Boolean((touchedFields.slippage || orderAttempted) && slippageInvalid)}
                          className="num w-full rounded-md border border-hairline bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted/50 focus:border-amber/60 focus:outline-none focus:ring-1 focus:ring-amber/40"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-muted">%</span>
                      </div>
                      <p id="order-slippage-help" className="mt-1 text-[10px] text-muted">Market orders cross the opposing book.</p>
                    </div>
                  </details>
                )}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-hairline pt-2 text-[11px]">
                  <dt className="text-muted">Available</dt>
                  <dd className="num text-right">Unavailable</dd>
                  <dt className="text-muted">Position</dt>
                  <dd className="num text-right">Unavailable</dd>
                  <dt className="text-muted">Order size</dt>
                  <dd className="num text-right">{amount && Number.isFinite(Number(amount)) ? fmtCompact(Number(amount)) : "Unavailable"}</dd>
                  <dt className="text-muted">Order value</dt>
                  <dd className="num text-right">{orderValue != null ? fmtCompact(orderValue) : "Unavailable"}</dd>
                  <dt className="text-muted">Est. price</dt>
                  <dd className="num text-right">{estimatedPrice != null ? fmtProb(estimatedPrice) : "Unavailable"}</dd>
                  <dt className="text-muted">Slippage</dt>
                  <dd className="num text-right">{orderType === "market" && slippage.trim() ? `${slippage}%` : "Unavailable"}</dd>
                  <dt className="text-muted">Fees</dt>
                  <dd className="num text-right">Unavailable</dd>
                </dl>
                {walletError && <p role="alert" className="text-[11px] text-down">{walletError}</p>}
                <p aria-live="polite" className={`text-[11px] ${showFormError ? "text-down" : "text-muted"}`}>
                  {showFormError ? formError : walletAddress ? "Review the order before signing." : "Connect a Somnia Shannon wallet to sign."}
                </p>
                {walletAddress && !wrongNetwork && (
                  <p className="flex items-center justify-between text-[11px] text-muted">
                    <span>Signing as</span>
                    <span className="num text-foreground">{shortAddress(walletAddress)}</span>
                  </p>
                )}
                {orderNotice && (
                  <p role={orderNotice.kind === "error" ? "alert" : "status"} className={`text-[11px] ${orderNotice.kind === "error" ? "text-down" : "text-up"}`}>
                    {orderNotice.text}
                  </p>
                )}
                {!walletAddress ? (
                  <button
                    type="button"
                    onClick={connectWallet}
                    disabled={walletBusy}
                    className="min-h-11 w-full rounded-md bg-foreground px-3 py-2.5 text-xs font-semibold text-background ease-terminal transition-[opacity,transform] hover:opacity-90 active:translate-y-px disabled:cursor-wait disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
                  >
                    {walletBusy ? "Connecting" : "Connect wallet"}
                  </button>
                ) : wrongNetwork ? (
                  <button
                    type="button"
                    onClick={switchNetwork}
                    disabled={walletBusy}
                    className="min-h-11 w-full rounded-md bg-amber px-3 py-2.5 text-xs font-semibold text-background ease-terminal transition-[opacity,transform] hover:opacity-90 active:translate-y-px disabled:cursor-wait disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
                  >
                    {walletBusy ? "Switching network" : "Switch to Somnia Shannon"}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={Boolean(formError) || orderBusy || !walletClient}
                    aria-busy={orderBusy}
                    className={`min-h-11 w-full rounded-md px-3 py-2.5 text-xs font-semibold text-background ease-terminal transition-[opacity,transform] hover:opacity-90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 ${orderSide === "buy" ? "bg-up" : "bg-down"}`}
                  >
                    {orderBusy ? "Signing" : `${orderSide === "buy" ? "Buy" : "Sell"} ${outcome}`}
                  </button>
                )}
                {lastOrder && (
                  <div className="border-t border-hairline pt-2 text-[11px]" aria-live="polite">
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Last order</span>
                      <span className={lastOrder.status === "open" ? "text-amber" : lastOrder.status === "closed" ? "text-up" : "text-muted"}>
                        {lastOrder.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1 text-muted">
                      <span>{lastOrder.side} {lastOrder.outcome} / {lastOrder.type}</span>
                      <span className="num">{fmtCompact(lastOrder.filled)}/{fmtCompact(lastOrder.amount)} @ {fmtProb(lastOrder.price)}</span>
                    </div>
                    {lastOrder.status === "open" && (
                      <button
                        type="button"
                        onClick={cancelLastOrder}
                        disabled={orderBusy || !walletClient}
                        className="mt-2 min-h-11 w-full rounded-md border border-hairline px-2 py-1.5 text-[11px] text-muted hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
                      >
                        Cancel resting order
                      </button>
                    )}
                  </div>
                )}
                <p className="text-[10px] leading-relaxed text-muted">DreamDEX execution only. External feeds remain read-only.</p>
              </form>
            </Panel>
          ) : (
            <Panel title="Manual order">
              <p className="px-3 pb-3 text-xs text-muted" role="status">Select a market below to place an order.</p>
            </Panel>
          )}
        </div>
        <div className="grid min-w-0 items-start gap-3 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
        <Panel title={`Event contracts / ${visible.length} of ${markets.length} live`}>
          <div className="min-w-0 max-w-full overflow-x-auto">
            <table className="min-w-[620px] text-left text-xs">
              <thead>
                <tr className="border-b border-hairline text-[10px] uppercase tracking-[0.15em] text-muted">
                  <th className="px-3 py-2 font-medium">Asset</th>
                  <th className="px-3 py-2 font-medium">Market</th>
                  <th className="px-3 py-2 font-medium">Window</th>
                  <th className="px-3 py-2 text-right font-medium">TTM</th>
                  <th className="px-3 py-2 text-right font-medium">Last</th>
                  <th className="px-3 py-2 text-right font-medium">Vol</th>
                  <th className="px-3 py-2 text-right font-medium">Trades</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(m.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-pressed={m.id === selectedId}
                    className={`h-11 cursor-pointer border-b border-hairline/50 ease-terminal transition-colors duration-200 hover:bg-white/[0.03] focus-visible:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-[-2px] ${
                      m.id === selectedId ? "bg-amber/[0.06]" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <span className="num font-semibold text-amber">{m.asset}</span>
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2.5">
                      {m.kind === "ladder" ? `≥ $${m.strikeLabel}` : "Above open"}
                      <span className="ml-1.5 text-[10px] text-muted">{m.interval}</span>
                    </td>
                    <td className="num px-3 py-2.5 text-muted">{m.windowLabel}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Ttm expiry={m.expiry} now={now} />
                    </td>
                    <td className="num px-3 py-2.5 text-right">
                      {m.lastPrice != null ? fmtProb(m.lastPrice) : "Unavailable"}
                    </td>
                    <td className="num px-3 py-2.5 text-right text-muted">${fmtCompact(m.volumeQuote)}</td>
                    <td className="num px-3 py-2.5 text-right text-muted">{m.tradeCount}</td>
                  </tr>
                ))}
                {!markets.length && (
                  <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted" role="status">
                    {marketsError ?? "No live event contracts yet."}
                  </td>
                </tr>
              )}
              </tbody>
            </table>
          </div>
          {markets.length > 10 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              type="button"
              className="min-h-11 cursor-pointer px-3 py-2 text-left text-[11px] text-amber hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 md:min-h-9"
            >
              {showAll ? "Show top 10" : `Show all ${markets.length} markets`}
            </button>
          )}
        </Panel>
          {selected && (
            <>
              <Panel title="Recent prints">
                <Tape fills={fills} />
              </Panel>
              <Panel title="Window stats">
                <Stats market={selected} book={book} />
              </Panel>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <SpotFlowPanel asset={chartAsset} />
          {selected ? (
            <>
                <Panel title="Selected window">
                  <div className="px-3 pb-2">
                    <p className="pb-1 text-xs leading-relaxed text-foreground/90">{selected.question}</p>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="num text-2xl font-semibold text-amber">
                        {book?.mid != null ? fmtProb(book.mid) : "Unavailable"}
                      </span>
                      <span className="num text-[10px] text-muted">YES probability</span>
                    </div>
                  </div>
                </Panel>
                <Panel title="Order flow pressure">
                  {(() => {
                    const buyPct = Math.round((book?.imbalance ?? 0.5) * 100);
                    return (
                      <div className="px-3 pb-3 pt-1">
                        <PressureRibbon buyPct={buyPct} />
                        <div className="flex justify-between pt-1.5 text-[10px]">
                          <span className="num text-up">buy {buyPct}%</span>
                          <span className="num text-down">sell {100 - buyPct}%</span>
                        </div>
                      </div>
                    );
                  })()}
                </Panel>
                <Panel title="YES order book">
                  <div className="pb-2">{book ? <BookLadder book={book} /> : <p className="px-3 py-2 text-xs text-muted" role="status">Waiting for depth</p>}</div>
                </Panel>
            </>
          ) : (
            <Panel title="Selected window">
              <p className="px-3 pb-3 text-xs text-muted">Select a market to inspect its flow.</p>
            </Panel>
          )}
          </div>
        </div>
      </main>
    </div>
  );
}
