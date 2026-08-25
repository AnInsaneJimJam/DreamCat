"use client";

import {
  fromHuman,
  InvalidInputError,
  ORDER_TYPE,
  toHuman,
  type UnifiedOrder,
} from "@somnia-chain/markets-sdk";
import type { Address, Hex, WalletClient } from "viem";
import { getExchange } from "../dreamdex";

export type ChainTradeOutcome = "YES" | "NO";
export type ChainTradeSide = "buy" | "sell";
export type ChainTradeType = "limit" | "market";

export interface ChainTradeParams {
  marketId: string;
  outcome: ChainTradeOutcome;
  side: ChainTradeSide;
  type: ChainTradeType;
  amount: number;
  price?: number;
  slippage?: number;
}

export interface ChainMarketExpectation {
  poolAddress?: string;
  marketAddress?: string;
  nonce?: string | null;
  collateral?: string | null;
  yesTokenId?: string | null;
  noTokenId?: string | null;
  expiry?: number;
  marketSymbol?: string | null;
  yesSymbol?: string | null;
  noSymbol?: string | null;
  asset?: string | null;
  strike?: string | number | null;
  quoteSymbol?: string | null;
}

export interface ChainExecutionMarket {
  marketId: Hex;
  marketAddress: Address;
  pool: Address;
  outcomeToken: Address;
  collateral: Address;
  yesId: bigint;
  noId: bigint;
  nonce: bigint;
  decimals: number;
  expiry: number;
}

export interface ChainBookLevel {
  price: number;
  qty: number;
}

export interface ChainBookSnapshot {
  bids: ChainBookLevel[];
  asks: ChainBookLevel[];
  bidDepth: number;
  askDepth: number;
  mid: number | null;
  spread: number | null;
  imbalance: number | null;
}

const ID_PATTERN = /^0x[0-9a-f]{64}$/i;

const poolBindingAbi = [{
  type: "function",
  name: "getBinaryPoolParams",
  stateMutability: "view",
  inputs: [],
  outputs: [{
    type: "tuple",
    components: [
      { type: "address", name: "collateralToken" },
      { type: "address", name: "market" },
      { type: "address", name: "outcomeToken" },
      { type: "uint256", name: "yesId" },
      { type: "uint256", name: "noId" },
      { type: "uint256", name: "oneCollateral" },
      { type: "uint256", name: "setBacking" },
      { type: "address", name: "feeRecipient" },
      { type: "uint256", name: "makerFeeBpsTimes1k" },
      { type: "uint256", name: "takerFeeBpsTimes1k" },
      { type: "uint256", name: "maxBuilderFeeBpsTimes1k" },
      { type: "uint256", name: "settlementFeeBpsTimes1k" },
      { type: "address", name: "settlement" },
      { type: "uint64", name: "marketNonce" },
      { type: "bool", name: "finalized" },
    ],
  }],
}] as const;

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function ensureMarketId(value: string): Hex {
  const id = value.trim();
  if (!ID_PATTERN.test(id)) throw new InvalidInputError("marketId must be a bytes32 hex id");
  return id.toLowerCase() as Hex;
}

function ensureAddressMatch(label: string, expected: string | null | undefined, actual: string): void {
  if (expected && normalized(expected) !== normalized(actual)) {
    throw new InvalidInputError(`${label} binding changed; reload the market and try again`);
  }
}

function ensureDecimal(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new InvalidInputError(`${label} must be finite and non-negative`);
}

function alignRaw(raw: bigint, step: bigint, direction: "down" | "up", one: bigint): bigint {
  if (step <= BigInt(0)) throw new InvalidInputError("market returned an invalid order-book tick");
  const remainder = raw % step;
  const aligned = direction === "up"
    ? remainder === BigInt(0) ? raw : raw + step - remainder
    : raw - remainder;
  const lowest = step;
  const highest = ((one - step) / step) * step;
  if (highest < lowest) throw new InvalidInputError("market returned an invalid order-book price range");
  return aligned < lowest ? lowest : aligned > highest ? highest : aligned;
}

function toOutcomeRaw(value: number, decimals: number): bigint {
  ensureDecimal(value, "price");
  if (value <= 0 || value >= 1) throw new InvalidInputError("price must be between 0 and 1");
  return fromHuman(value, decimals);
}

function toQuantityRaw(value: number, decimals: number, lotSize: bigint, minQuantity: bigint): bigint {
  ensureDecimal(value, "amount");
  if (value <= 0) throw new InvalidInputError("amount must be greater than zero");
  const raw = fromHuman(value, decimals);
  const quantity = (raw / lotSize) * lotSize;
  if (quantity < minQuantity || quantity <= BigInt(0)) throw new InvalidInputError("amount is below the market's minimum lot");
  return quantity;
}

function outcomeBook(
  book: Awaited<ReturnType<ReturnType<typeof getExchange>["client"]["getBinaryOrderBook"]>>,
  outcome: ChainTradeOutcome,
  side: ChainTradeSide,
) {
  if (outcome === "YES") return side === "buy" ? book.yesAsks : book.yesBids;
  return side === "buy" ? book.noAsks : book.noBids;
}

function readableSymbol(
  market: ChainExecutionMarket,
  outcome: ChainTradeOutcome,
  expected?: ChainMarketExpectation,
): string {
  const symbol = outcome === "YES" ? expected?.yesSymbol : expected?.noSymbol;
  if (symbol) return symbol;
  if (expected?.marketSymbol) return `${expected.marketSymbol}#${outcome}`;
  return `${market.marketId}#${outcome}`;
}

async function validatePoolBinding(market: ChainExecutionMarket): Promise<void> {
  const client = getExchange().client.getViemClient();
  const raw = await client.readContract({ address: market.pool, abi: poolBindingAbi, functionName: "getBinaryPoolParams" });
  const params = raw as unknown as Record<string, unknown> & readonly unknown[];
  const field = (name: string, index: number): unknown => Array.isArray(params) ? params[index] : params[name];
  const nonce = field("marketNonce", 13) as bigint | undefined;
  const collateral = String(field("collateralToken", 0) ?? "");
  const marketAddress = String(field("market", 1) ?? "");
  const outcomeToken = String(field("outcomeToken", 2) ?? "");
  const yesId = field("yesId", 3) as bigint | undefined;
  const noId = field("noId", 4) as bigint | undefined;
  if (nonce !== market.nonce || yesId !== market.yesId || noId !== market.noId || normalized(collateral) !== normalized(market.collateral) || normalized(marketAddress) !== normalized(market.marketAddress) || normalized(outcomeToken) !== normalized(market.outcomeToken)) {
    throw new InvalidInputError("market pool binding changed; reload the market and try again");
  }
}

export async function resolveChainExecutionMarket(
  marketId: string,
  expected?: ChainMarketExpectation,
): Promise<ChainExecutionMarket> {
  const id = ensureMarketId(marketId);
  const exchange = getExchange();
  const state = await exchange.client.getMarketOnchain(id);
  ensureAddressMatch("market", expected?.marketAddress, state.marketAddress);
  ensureAddressMatch("pool", expected?.poolAddress, state.pool);
  ensureAddressMatch("collateral", expected?.collateral, state.collateral);
  if (expected?.nonce != null && expected.nonce !== state.nonce.toString()) {
    throw new InvalidInputError("market nonce changed; reload the market and try again");
  }
  if (expected?.yesTokenId != null && expected.yesTokenId !== state.yesId.toString()) {
    throw new InvalidInputError("YES outcome binding changed; reload the market and try again");
  }
  if (expected?.noTokenId != null && expected.noTokenId !== state.noId.toString()) {
    throw new InvalidInputError("NO outcome binding changed; reload the market and try again");
  }
  if (state.status !== 1 || state.isResolved || state.isVoided || state.expiry <= BigInt(Math.floor(Date.now() / 1000))) {
    throw new InvalidInputError("market is not currently trading");
  }
  if (expected?.expiry != null && Math.abs(expected.expiry - Number(state.expiry) * 1000) > 1000) {
    throw new InvalidInputError("market expiry changed; reload the market and try again");
  }
  const market: ChainExecutionMarket = {
    marketId: id,
    marketAddress: state.marketAddress,
    pool: state.pool,
    outcomeToken: state.outcomeToken,
    collateral: state.collateral,
    yesId: state.yesId,
    noId: state.noId,
    nonce: state.nonce,
    decimals: state.decimals,
    expiry: Number(state.expiry),
  };
  await validatePoolBinding(market);
  return market;
}

export async function fetchChainOrderBook(
  market: ChainExecutionMarket,
  outcome: ChainTradeOutcome = "YES",
  depth = 8,
): Promise<ChainBookSnapshot> {
  if (!Number.isSafeInteger(depth) || depth <= 0) throw new InvalidInputError("book depth must be a positive integer");
  const raw = await getExchange().client.getBinaryOrderBook(market.pool, { depth, decimals: market.decimals });
  const levels = (value: typeof raw.yesBids): ChainBookLevel[] => value.map((level) => ({
    price: toHuman(level.price, market.decimals),
    qty: toHuman(level.quantity, market.decimals),
  }));
  const bids = outcome === "YES" ? levels(raw.yesBids) : levels(raw.noBids);
  const asks = outcome === "YES" ? levels(raw.yesAsks) : levels(raw.noAsks);
  const bidDepth = bids.reduce((sum, level) => sum + level.qty, 0);
  const askDepth = asks.reduce((sum, level) => sum + level.qty, 0);
  const bestBid = bids[0]?.price;
  const bestAsk = asks[0]?.price;
  return {
    bids,
    asks,
    bidDepth,
    askDepth,
    mid: bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : (bestBid ?? bestAsk ?? null),
    spread: bestBid != null && bestAsk != null ? bestAsk - bestBid : null,
    imbalance: bidDepth + askDepth > 0 ? bidDepth / (bidDepth + askDepth) : null,
  };
}

export async function placeChainTrade(
  walletClient: WalletClient,
  trade: ChainTradeParams,
  expected?: ChainMarketExpectation,
): Promise<UnifiedOrder & { price: number }> {
  const market = await resolveChainExecutionMarket(trade.marketId, expected);
  const exchange = getExchange();
  const params = await exchange.client.getBinaryBookParams(market.pool);
  const one = BigInt(10) ** BigInt(market.decimals);
  const quantity = toQuantityRaw(trade.amount, market.decimals, params.lotSize, params.minQuantity);
  let outcomePrice: bigint;
  if (trade.type === "market") {
    const rawBook = await exchange.client.getBinaryOrderBook(market.pool, { depth: 1, decimals: market.decimals });
    const opposite = outcomeBook(rawBook, trade.outcome, trade.side);
    const best = opposite[0]?.price;
    if (best === undefined) {
      throw new InvalidInputError(`cannot price a market ${trade.side} on ${readableSymbol(market, trade.outcome, expected)} — the opposite side of the book is empty`);
    }
    const slippage = trade.slippage ?? 0.01;
    ensureDecimal(slippage, "slippage");
    if (slippage > 1) throw new InvalidInputError("slippage must be between 0 and 1");
    const bestHuman = toHuman(best, market.decimals);
    const padded = trade.side === "buy" ? bestHuman * (1 + slippage) : bestHuman * (1 - slippage);
    const rawPadded = toOutcomeRaw(Math.min(1 - Number(toHuman(params.tickSize, market.decimals)), Math.max(Number(toHuman(params.tickSize, market.decimals)), padded)), market.decimals);
    outcomePrice = alignRaw(rawPadded, params.tickSize, trade.side === "buy" ? "up" : "down", one);
  } else {
    if (trade.price === undefined) throw new InvalidInputError("a limit order needs a price");
    const rawPrice = toOutcomeRaw(trade.price, market.decimals);
    outcomePrice = alignRaw(rawPrice, params.tickSize, trade.side === "buy" ? "down" : "up", one);
  }
  const yesPrice = trade.outcome === "YES" ? outcomePrice : one - outcomePrice;
  if (yesPrice <= BigInt(0) || yesPrice >= one || yesPrice % params.tickSize !== BigInt(0)) {
    throw new InvalidInputError("market price cannot be aligned to the pool's tick grid");
  }
  exchange.setSigner({ walletClient });
  const result = await exchange.trader.placeOrder({
    pool: market.pool,
    side: `${trade.side === "buy" ? "BUY" : "SELL"}_${trade.outcome}` as "BUY_YES" | "SELL_YES" | "BUY_NO" | "SELL_NO",
    price: yesPrice,
    quantity,
    orderType: trade.type === "market" ? ORDER_TYPE.MARKET : ORDER_TYPE.LIMIT,
    outcomeToken: market.outcomeToken,
    yesId: market.yesId,
    noId: market.noId,
    collateral: market.collateral,
  });
  const filledRaw = result.fills.reduce((sum, fill) => sum + fill.quantityFilled, BigInt(0));
  const filled = toHuman(filledRaw, market.decimals);
  const amount = toHuman(quantity, market.decimals);
  const remaining = Math.max(0, amount - filled);
  const resting = trade.type === "limit" && result.orderId !== undefined;
  const now = Date.now();
  const price = toHuman(outcomePrice, market.decimals);
  return {
    id: result.orderId?.toString() ?? result.hash,
    symbol: readableSymbol(market, trade.outcome, expected),
    type: trade.type,
    side: trade.side,
    price,
    amount,
    filled,
    remaining,
    status: remaining <= 0 ? "closed" : resting ? "open" : "canceled",
    txHash: result.hash,
    timestamp: now,
    datetime: new Date(now).toISOString(),
    info: result,
  };
}

export async function cancelChainOrder(
  walletClient: WalletClient,
  marketId: string,
  orderId: string,
  expected?: ChainMarketExpectation,
): Promise<{ id: string; status: "canceled"; info: unknown }> {
  const market = await resolveChainExecutionMarket(marketId, expected);
  if (!/^\d+$/.test(orderId)) throw new InvalidInputError("order id must be a decimal pool order id");
  const exchange = getExchange();
  exchange.setSigner({ walletClient });
  const result = await exchange.trader.cancelOrder({ pool: market.pool, orderId });
  return { id: orderId, status: "canceled", info: result };
}

export function chainOutcomeSymbol(
  marketId: string,
  outcome: ChainTradeOutcome,
  metadata?: { asset?: string; strike?: string | number; expiry?: number; quote?: string },
): string {
  const id = ensureMarketId(marketId);
  if (!metadata?.asset || metadata.expiry == null) return `${id}#${outcome}`;
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const date = new Date(metadata.expiry * 1000);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const year = String(date.getUTCFullYear() % 100).padStart(2, "0");
  const dateCode = `${day}${months[date.getUTCMonth()]}${year}`;
  const timeCode = metadata.expiry % 86400 === 0
    ? dateCode
    : `${dateCode}-${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}`;
  const strike = String(metadata.strike ?? "0").replaceAll(",", "").replace(/\.0+$/, "") || "0";
  const quote = metadata.quote?.replace(/[^A-Za-z0-9.]/g, "") || id.slice(-8).toUpperCase();
  const asset = metadata.asset.replace(/[^A-Za-z0-9.]/g, "") || "MKT";
  return `${asset}-${strike}-${timeCode}/${quote}#${outcome}`;
}
