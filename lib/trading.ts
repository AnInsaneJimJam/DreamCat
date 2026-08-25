"use client";

import { InvalidInputError, type UnifiedOrder } from "@somnia-chain/markets-sdk";
import type { Hex, WalletClient } from "viem";
import { getExchange } from "./dreamdex";
import {
  chainOutcomeSymbol,
  placeChainTrade,
  resolveChainExecutionMarket,
  type ChainMarketExpectation,
} from "./market-universe/chain-execution";
import { ensureWalletClientChain, SHANNON_CHAIN_ID } from "./wallet";

const MARKET_ID_PATTERN = /^0x[0-9a-f]{64}$/i;
const MAX_SAFE_AMOUNT = Number.MAX_SAFE_INTEGER;

export type ManualTradeOutcome = "YES" | "NO";
export type ManualTradeSide = "buy" | "sell";
export type ManualTradeType = "limit" | "market";

export interface ManualTradeInput {
  marketId: string;
  outcome: ManualTradeOutcome;
  side: ManualTradeSide;
  type?: ManualTradeType;
  amount: string | number;
  price?: string | number;
  slippage?: string | number;
  chainContext?: ChainMarketExpectation;
}

export interface ValidatedManualTrade {
  marketId: string;
  outcome: ManualTradeOutcome;
  side: ManualTradeSide;
  type: ManualTradeType;
  amount: number;
  price?: number;
  slippage?: number;
}

export interface ExecutableMarket {
  marketId: string;
  outcome: ManualTradeOutcome;
  symbol: string;
  pool: string;
  expiry: number;
}

function decimal(value: string | number | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new InvalidInputError(`${label} must be a finite decimal`);
  }
  const text = typeof value === "number" ? String(value) : value.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    throw new InvalidInputError(`${label} must be a finite decimal`);
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new InvalidInputError(`${label} must be a finite decimal`);
  return parsed;
}

function marketId(value: string): string {
  if (typeof value !== "string") throw new InvalidInputError("marketId must be a bytes32 hex id");
  const normalized = value.trim();
  if (!MARKET_ID_PATTERN.test(normalized)) throw new InvalidInputError("marketId must be a bytes32 hex id");
  return normalized;
}

export function validateManualTrade(input: ManualTradeInput): ValidatedManualTrade {
  const id = marketId(input.marketId);
  const amount = decimal(input.amount, "amount");
  if (amount === undefined || amount <= 0 || amount > MAX_SAFE_AMOUNT) {
    throw new InvalidInputError("amount must be greater than zero and safely representable");
  }
  const type = input.type ?? "limit";
  if (type !== "limit" && type !== "market") throw new InvalidInputError("type must be limit or market");
  if (input.outcome !== "YES" && input.outcome !== "NO") throw new InvalidInputError("outcome must be YES or NO");
  if (input.side !== "buy" && input.side !== "sell") throw new InvalidInputError("side must be buy or sell");

  const price = decimal(input.price, "price");
  if (type === "limit" && (price === undefined || price <= 0 || price >= 1)) {
    throw new InvalidInputError("limit price must be between 0 and 1");
  }
  if (type === "market" && price !== undefined && (price <= 0 || price >= 1)) {
    throw new InvalidInputError("market price must be between 0 and 1 when supplied");
  }

  const slippage = decimal(input.slippage, "slippage");
  if (slippage !== undefined && (slippage < 0 || slippage > 1)) {
    throw new InvalidInputError("slippage must be between 0 and 1");
  }

  return { marketId: id, outcome: input.outcome, side: input.side, type, amount, price, slippage };
}

export async function resolveExecutableMarket(
  marketId: string,
  outcome: ManualTradeOutcome = "YES",
): Promise<ExecutableMarket> {
  const id = marketIdValue(marketId);
  if (outcome !== "YES" && outcome !== "NO") throw new InvalidInputError("outcome must be YES or NO");
  const exchange = getExchange();
  await exchange.loadMarkets(true);
  const market = exchange.market(id);
  const tradable = exchange.market(`${market.marketSymbol}#${outcome}`);
  if (tradable.market.marketType !== "BINARY") {
    throw new InvalidInputError("market is not an executable binary prediction market");
  }
  const state = await exchange.client.getMarketOnchain(tradable.market.id as Hex);
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (state.pool.toLowerCase() !== tradable.pool.toLowerCase()) {
    throw new InvalidInputError("market pool binding changed; reload markets and try again");
  }
  if (state.status !== 1 || state.isResolved || state.isVoided || state.expiry <= now) {
    throw new InvalidInputError("market is not currently trading");
  }
  return { marketId: id, outcome, symbol: tradable.symbol, pool: state.pool, expiry: Number(state.expiry) };
}

export async function resolveChainExecutableMarket(
  marketId: string,
  outcome: ManualTradeOutcome = "YES",
  context?: ChainMarketExpectation,
): Promise<ExecutableMarket> {
  if (outcome !== "YES" && outcome !== "NO") throw new InvalidInputError("outcome must be YES or NO");
  const market = await resolveChainExecutionMarket(marketId, context);
  const symbol = outcome === "YES" ? context?.yesSymbol : context?.noSymbol;
  return {
    marketId: market.marketId,
    outcome,
    symbol: symbol ?? chainOutcomeSymbol(market.marketId, outcome, {
      asset: context?.asset ?? undefined,
      strike: context?.strike ?? undefined,
      expiry: context?.expiry == null ? undefined : context.expiry / 1000,
      quote: context?.quoteSymbol ?? undefined,
    }),
    pool: market.pool,
    expiry: market.expiry,
  };
}

function marketIdValue(value: string): string {
  return marketId(value).toLowerCase();
}

export async function placeManualTrade(
  walletClient: WalletClient,
  input: ManualTradeInput,
): Promise<UnifiedOrder & { price: number }> {
  if (!walletClient.account) throw new InvalidInputError("connect a wallet account before trading");
  if (walletClient.chain && walletClient.chain.id !== SHANNON_CHAIN_ID) {
    throw new InvalidInputError("wallet must be configured for Somnia Shannon");
  }
  try {
    await ensureWalletClientChain(walletClient);
  } catch (error) {
    throw new InvalidInputError(error instanceof Error ? error.message : "wallet must be connected to Somnia Shannon");
  }
  const account = typeof walletClient.account === "string" ? walletClient.account : walletClient.account.address;
  const accounts = await walletClient.getAddresses();
  if (accounts.length > 0 && !accounts.some((address) => address.toLowerCase() === account.toLowerCase())) {
    throw new InvalidInputError("wallet account changed; reconnect before trading");
  }
  const trade = validateManualTrade(input);
  if (input.chainContext) {
    return placeChainTrade(walletClient, {
      marketId: trade.marketId,
      outcome: trade.outcome,
      side: trade.side,
      type: trade.type,
      amount: trade.amount,
      price: trade.price,
      slippage: trade.slippage,
    }, input.chainContext);
  }
  let executable: ExecutableMarket;
  try {
    executable = await resolveExecutableMarket(trade.marketId, trade.outcome);
  } catch (officialError) {
    try {
      return await placeChainTrade(walletClient, {
        marketId: trade.marketId,
        outcome: trade.outcome,
        side: trade.side,
        type: trade.type,
        amount: trade.amount,
        price: trade.price,
        slippage: trade.slippage,
      });
    } catch {
      throw officialError;
    }
  }
  const exchange = getExchange();
  exchange.setSigner({ walletClient });
  const order = await exchange.createOrder(
    executable.symbol,
    trade.type,
    trade.side,
    trade.amount,
    trade.price,
    { slippage: trade.slippage },
  );
  if (order.price === undefined) throw new InvalidInputError("order price was not returned by the exchange");
  return { ...order, price: order.price };
}
