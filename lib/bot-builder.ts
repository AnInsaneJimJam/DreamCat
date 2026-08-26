export const BOT_CONFIG_VERSION = 1 as const;

export type BotConfigVersion = typeof BOT_CONFIG_VERSION;
export type BotMarketType = "spot" | "event";
export type BotNetwork = "testnet" | "mainnet";
export type BotMode = "dry-run" | "live";
export type StrategyId =
  | "starter"
  | "market-maker"
  | "grid"
  | "momentum"
  | "mean-reversion"
  | "twap"
  | "ensemble";

export const STRATEGY_IDS: readonly StrategyId[] = [
  "starter",
  "market-maker",
  "grid",
  "momentum",
  "mean-reversion",
  "twap",
  "ensemble",
];

export interface StarterParams {
  orderSize: number;
  quoteSpreadBps: number;
  refreshSec: number;
  maxInventory: number;
}

export interface MarketMakerParams {
  orderSize: number;
  spreadBps: number;
  refreshSec: number;
  maxInventory: number;
  inventorySkewBps: number;
  stopAfterLoss: number;
}

export interface GridParams {
  gridStepBps: number;
  lotSize: number;
  maxInventory: number;
  levels: number;
  stopAfterLoss: number;
}

export interface MomentumParams {
  orderSize: number;
  lookbackSec: number;
  entryThreshold: number;
  takeProfit: number;
  stopLoss: number;
  maxHoldSec: number;
}

export interface MeanReversionParams {
  orderSize: number;
  lookbackSec: number;
  deviationBps: number;
  takeProfit: number;
  stopLoss: number;
  maxHoldSec: number;
}

export interface TwapParams {
  totalSize: number;
  sliceSize: number;
  intervalSec: number;
  durationSec: number;
  maxSlippageBps: number;
}

export interface EnsembleParams {
  orderSize: number;
  lookbackSec: number;
  entryThreshold: number;
  momentumWeight: number;
  meanReversionWeight: number;
  imbalanceWeight: number;
  minAgreement: number;
  takeProfit: number;
  stopLoss: number;
}

export interface StrategyParamMap {
  starter: StarterParams;
  "market-maker": MarketMakerParams;
  grid: GridParams;
  momentum: MomentumParams;
  "mean-reversion": MeanReversionParams;
  twap: TwapParams;
  ensemble: EnsembleParams;
}

export type StrategyParams = StrategyParamMap[StrategyId];

export interface StrategyField {
  key: string;
  label: string;
  description: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  advanced?: boolean;
}

export interface StrategyTemplate<K extends StrategyId = StrategyId> {
  id: K;
  name: string;
  description: string;
  marketTypes: readonly BotMarketType[];
  fields: readonly StrategyField[];
  defaults: StrategyParamMap[K];
}

const spotAndEvent: readonly BotMarketType[] = ["spot", "event"];

export const STRATEGY_TEMPLATES: {
  [K in StrategyId]: StrategyTemplate<K>;
}[StrategyId][] = [
  {
    id: "starter",
    name: "Starter",
    description: "A compact baseline that quotes both sides with conservative limits.",
    marketTypes: spotAndEvent,
    fields: [
      { key: "orderSize", label: "Order size", description: "Size of each quote.", unit: "units", min: 0.01, max: 100000, step: 0.01 },
      { key: "quoteSpreadBps", label: "Quote spread", description: "Distance from the reference price on each side.", unit: "bps", min: 1, max: 5000, step: 1 },
      { key: "refreshSec", label: "Refresh interval", description: "How often quotes are refreshed.", unit: "sec", min: 1, max: 3600, step: 1, integer: true },
      { key: "maxInventory", label: "Max inventory", description: "Maximum net position before quoting pauses.", unit: "units", min: 0.01, max: 100000, step: 0.01 },
    ],
    defaults: { orderSize: 5, quoteSpreadBps: 30, refreshSec: 8, maxInventory: 25 },
  },
  {
    id: "market-maker",
    name: "Market Maker",
    description: "Rest two-sided quotes, earn spread, and skew quotes away from inventory risk.",
    marketTypes: spotAndEvent,
    fields: [
      { key: "orderSize", label: "Quote size", description: "Size placed on each side of the book.", unit: "units", min: 0.01, max: 100000, step: 0.01 },
      { key: "spreadBps", label: "Spread", description: "Target distance between the bid and ask.", unit: "bps", min: 1, max: 5000, step: 1 },
      { key: "refreshSec", label: "Refresh interval", description: "How often resting quotes are re-priced.", unit: "sec", min: 1, max: 3600, step: 1, integer: true },
      { key: "maxInventory", label: "Max inventory", description: "Hard inventory ceiling for this strategy.", unit: "units", min: 0.01, max: 100000, step: 0.01 },
      { key: "inventorySkewBps", label: "Inventory skew", description: "Quote adjustment per unit of inventory.", unit: "bps", min: 0, max: 5000, step: 1, advanced: true },
      { key: "stopAfterLoss", label: "Stop after loss", description: "Pause quoting after this realized loss.", unit: "quote", min: 0.01, max: 1000000, step: 0.01, advanced: true },
    ],
    defaults: { orderSize: 5, spreadBps: 30, refreshSec: 8, maxInventory: 25, inventorySkewBps: 12, stopAfterLoss: 25 },
  },
  {
    id: "grid",
    name: "Grid",
    description: "Place a ladder of orders around a reference price for range-bound markets.",
    marketTypes: spotAndEvent,
    fields: [
      { key: "gridStepBps", label: "Grid step", description: "Distance between adjacent grid levels.", unit: "bps", min: 1, max: 5000, step: 1 },
      { key: "lotSize", label: "Lot size", description: "Size assigned to each grid level.", unit: "units", min: 0.01, max: 100000, step: 0.01 },
      { key: "maxInventory", label: "Max inventory", description: "Maximum net position across the grid.", unit: "units", min: 0.01, max: 100000, step: 0.01 },
      { key: "levels", label: "Grid levels", description: "Number of levels on each side.", unit: "levels", min: 1, max: 100, step: 1, integer: true },
      { key: "stopAfterLoss", label: "Stop after loss", description: "Pause the grid after this realized loss.", unit: "quote", min: 0.01, max: 1000000, step: 0.01, advanced: true },
    ],
    defaults: { gridStepBps: 30, lotSize: 5, maxInventory: 90, levels: 6, stopAfterLoss: 25 },
  },
  {
    id: "momentum",
    name: "Momentum",
    description: "Follow directional flow after price and tape agree on a move.",
    marketTypes: spotAndEvent,
    fields: [
      { key: "orderSize", label: "Order size", description: "Size of each directional entry.", unit: "units", min: 0.01, max: 100000, step: 0.01 },
      { key: "lookbackSec", label: "Lookback", description: "Signal window used to measure momentum.", unit: "sec", min: 1, max: 86400, step: 1, integer: true },
      { key: "entryThreshold", label: "Entry threshold", description: "Minimum normalized signal to enter.", unit: "ratio", min: 0.01, max: 1, step: 0.01 },
      { key: "takeProfit", label: "Take profit", description: "Profit target in price units.", unit: "ratio", min: 0.0001, max: 1, step: 0.0001 },
      { key: "stopLoss", label: "Stop loss", description: "Loss limit in price units.", unit: "ratio", min: 0.0001, max: 1, step: 0.0001 },
      { key: "maxHoldSec", label: "Max hold", description: "Maximum time to hold an open position.", unit: "sec", min: 1, max: 604800, step: 1, integer: true, advanced: true },
    ],
    defaults: { orderSize: 5, lookbackSec: 60, entryThreshold: 0.65, takeProfit: 0.05, stopLoss: 0.025, maxHoldSec: 240 },
  },
  {
    id: "mean-reversion",
    name: "Mean Reversion",
    description: "Fade statistically stretched prices back toward a rolling reference.",
    marketTypes: spotAndEvent,
    fields: [
      { key: "orderSize", label: "Order size", description: "Size of each mean-reversion entry.", unit: "units", min: 0.01, max: 100000, step: 0.01 },
      { key: "lookbackSec", label: "Lookback", description: "Window used to calculate the rolling mean.", unit: "sec", min: 1, max: 86400, step: 1, integer: true },
      { key: "deviationBps", label: "Entry deviation", description: "Distance from the mean required before entry.", unit: "bps", min: 1, max: 5000, step: 1 },
      { key: "takeProfit", label: "Take profit", description: "Profit target in price units.", unit: "ratio", min: 0.0001, max: 1, step: 0.0001 },
      { key: "stopLoss", label: "Stop loss", description: "Loss limit in price units.", unit: "ratio", min: 0.0001, max: 1, step: 0.0001 },
      { key: "maxHoldSec", label: "Max hold", description: "Maximum time to wait for reversion.", unit: "sec", min: 1, max: 604800, step: 1, integer: true, advanced: true },
    ],
    defaults: { orderSize: 5, lookbackSec: 300, deviationBps: 80, takeProfit: 0.04, stopLoss: 0.03, maxHoldSec: 300 },
  },
  {
    id: "twap",
    name: "TWAP",
    description: "Split one larger order into timed slices to reduce timing and impact risk.",
    marketTypes: spotAndEvent,
    fields: [
      { key: "totalSize", label: "Total size", description: "Total quantity to execute.", unit: "units", min: 0.01, max: 1000000, step: 0.01 },
      { key: "sliceSize", label: "Slice size", description: "Quantity submitted at each interval.", unit: "units", min: 0.01, max: 1000000, step: 0.01 },
      { key: "intervalSec", label: "Slice interval", description: "Time between slices.", unit: "sec", min: 1, max: 86400, step: 1, integer: true },
      { key: "durationSec", label: "Duration", description: "Maximum schedule duration.", unit: "sec", min: 1, max: 604800, step: 1, integer: true },
      { key: "maxSlippageBps", label: "Max slippage", description: "Price tolerance for each slice.", unit: "bps", min: 0, max: 5000, step: 1, advanced: true },
    ],
    defaults: { totalSize: 100, sliceSize: 10, intervalSec: 60, durationSec: 600, maxSlippageBps: 50 },
  },
  {
    id: "ensemble",
    name: "Ensemble",
    description: "Combine momentum, reversion, and book pressure into one weighted decision.",
    marketTypes: spotAndEvent,
    fields: [
      { key: "orderSize", label: "Order size", description: "Size of each ensemble entry.", unit: "units", min: 0.01, max: 100000, step: 0.01 },
      { key: "lookbackSec", label: "Lookback", description: "Window shared by the component signals.", unit: "sec", min: 1, max: 86400, step: 1, integer: true },
      { key: "entryThreshold", label: "Entry threshold", description: "Minimum weighted signal to enter.", unit: "ratio", min: 0.01, max: 1, step: 0.01 },
      { key: "momentumWeight", label: "Momentum weight", description: "Weight assigned to directional flow.", unit: "weight", min: 0, max: 1, step: 0.01 },
      { key: "meanReversionWeight", label: "Reversion weight", description: "Weight assigned to stretch from the mean.", unit: "weight", min: 0, max: 1, step: 0.01 },
      { key: "imbalanceWeight", label: "Book weight", description: "Weight assigned to resting depth imbalance.", unit: "weight", min: 0, max: 1, step: 0.01 },
      { key: "minAgreement", label: "Min agreement", description: "Minimum share of component signals that must agree.", unit: "ratio", min: 0.34, max: 1, step: 0.01, advanced: true },
      { key: "takeProfit", label: "Take profit", description: "Profit target in price units.", unit: "ratio", min: 0.0001, max: 1, step: 0.0001 },
      { key: "stopLoss", label: "Stop loss", description: "Loss limit in price units.", unit: "ratio", min: 0.0001, max: 1, step: 0.0001 },
    ],
    defaults: { orderSize: 5, lookbackSec: 120, entryThreshold: 0.6, momentumWeight: 0.4, meanReversionWeight: 0.25, imbalanceWeight: 0.35, minAgreement: 0.67, takeProfit: 0.05, stopLoss: 0.03 },
  },
];

export const BOT_STRATEGY_TEMPLATES = STRATEGY_TEMPLATES;

export interface EventMarketTarget {
  marketId: string;
  outcome: "YES" | "NO" | "BOTH";
  symbol?: string;
}

export interface SpotMarketTarget {
  symbol: string;
  poolAddress?: string;
}

export type BotMarketTarget = EventMarketTarget | SpotMarketTarget;

export interface GlobalRiskLimits {
  maxCapital: number;
  maxPosition: number;
  maxLoss: number;
  maxDrawdownPct: number;
  maxConcurrentPositions: number;
  expiryHeadroomSec: number;
  cooldownSec: number;
}

export const DEFAULT_RISK_LIMITS: GlobalRiskLimits = {
  maxCapital: 1000,
  maxPosition: 100,
  maxLoss: 100,
  maxDrawdownPct: 10,
  maxConcurrentPositions: 1,
  expiryHeadroomSec: 60,
  cooldownSec: 30,
};

export interface BotConfig {
  version: BotConfigVersion;
  name: string;
  strategy: StrategyId;
  marketType: BotMarketType;
  market: BotMarketTarget;
  network: BotNetwork;
  mode: BotMode;
  params: StrategyParams;
  risk: GlobalRiskLimits;
}

export type BotBuilderDraft = Partial<Omit<BotConfig, "version">> & { version: BotConfigVersion };

export interface BotConfigIssue {
  path: string;
  message: string;
}

export class BotConfigValidationError extends Error {
  readonly issues: readonly BotConfigIssue[];

  constructor(issues: readonly BotConfigIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "BotConfigValidationError";
    this.issues = issues;
  }
}

const MARKET_ID_PATTERN = /^0x[0-9a-f]{64}$/i;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function templateFor(strategy: unknown): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES.find((template) => template.id === strategy);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validateNumber(
  value: unknown,
  path: string,
  issues: BotConfigIssue[],
  options?: { min?: number; max?: number; integer?: boolean },
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ path, message: "must be a finite number" });
    return;
  }
  if (options?.min != null && value < options.min) issues.push({ path, message: `must be at least ${options.min}` });
  if (options?.max != null && value > options.max) issues.push({ path, message: `must be at most ${options.max}` });
  if (options?.integer && !Number.isInteger(value)) issues.push({ path, message: "must be an integer" });
}

function finiteValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validateParams(strategy: StrategyId, value: unknown, issues: BotConfigIssue[]): void {
  const template = templateFor(strategy);
  if (!template) return;
  if (!isRecord(value)) {
    issues.push({ path: "params", message: "must be an object" });
    return;
  }
  const known = new Set(template.fields.map((field) => field.key));
  for (const field of template.fields) {
    validateNumber(value[field.key], `params.${field.key}`, issues, field);
  }
  for (const key of Object.keys(value)) {
    if (!known.has(key)) issues.push({ path: `params.${key}`, message: "is not supported by this strategy" });
  }
  const orderSize = finiteValue(value.orderSize);
  const maxInventory = finiteValue(value.maxInventory);
  if (strategy === "starter" && orderSize != null && maxInventory != null && orderSize > maxInventory) {
    issues.push({ path: "params.orderSize", message: "must not exceed maxInventory" });
  }
  if (strategy === "market-maker" && orderSize != null && maxInventory != null && orderSize > maxInventory) {
    issues.push({ path: "params.orderSize", message: "must not exceed maxInventory" });
  }
  if (strategy === "grid") {
    const lotSize = finiteValue(value.lotSize);
    const levels = finiteValue(value.levels);
    if (lotSize != null && maxInventory != null && lotSize > maxInventory) issues.push({ path: "params.lotSize", message: "must not exceed maxInventory" });
    if (levels != null && lotSize != null && maxInventory != null && levels * lotSize > maxInventory) issues.push({ path: "params.levels", message: "levels × lotSize must not exceed maxInventory" });
  }
  if (strategy === "twap") {
    const sliceSize = finiteValue(value.sliceSize);
    const totalSize = finiteValue(value.totalSize);
    const durationSec = finiteValue(value.durationSec);
    const intervalSec = finiteValue(value.intervalSec);
    if (sliceSize != null && totalSize != null && sliceSize > totalSize) issues.push({ path: "params.sliceSize", message: "must not exceed totalSize" });
    if (sliceSize != null && totalSize != null && durationSec != null && intervalSec != null) {
      const sliceCount = Math.ceil(totalSize / sliceSize);
      const requiredDuration = Math.max(0, sliceCount - 1) * intervalSec;
      if (durationSec < requiredDuration) issues.push({ path: "params.durationSec", message: "must fit every slice at the selected interval" });
    }
  }
  const momentumWeight = finiteValue(value.momentumWeight);
  const meanReversionWeight = finiteValue(value.meanReversionWeight);
  const imbalanceWeight = finiteValue(value.imbalanceWeight);
  if (strategy === "ensemble" && momentumWeight != null && meanReversionWeight != null && imbalanceWeight != null && momentumWeight + meanReversionWeight + imbalanceWeight <= 0) {
    issues.push({ path: "params", message: "at least one signal weight must be greater than zero" });
  }
}

function validateMarket(marketType: unknown, value: unknown, issues: BotConfigIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: "market", message: "must be an object" });
    return;
  }
  if (marketType === "event") {
    if (typeof value.marketId !== "string" || !MARKET_ID_PATTERN.test(value.marketId.trim())) {
      issues.push({ path: "market.marketId", message: "must be a bytes32 hex market id" });
    }
    if (value.outcome !== "YES" && value.outcome !== "NO" && value.outcome !== "BOTH") {
      issues.push({ path: "market.outcome", message: "must be YES, NO, or BOTH" });
    }
    if (value.symbol !== undefined && (typeof value.symbol !== "string" || value.symbol.length > 160 || /[\r\n]/.test(value.symbol))) {
      issues.push({ path: "market.symbol", message: "must be an optional short symbol" });
    }
    return;
  }
  if (marketType === "spot") {
    if (typeof value.symbol !== "string" || !value.symbol.trim() || value.symbol.length > 160 || /[\r\n]/.test(value.symbol)) {
      issues.push({ path: "market.symbol", message: "must be a non-empty symbol without line breaks" });
    }
    if (value.poolAddress !== undefined && (typeof value.poolAddress !== "string" || !ADDRESS_PATTERN.test(value.poolAddress.trim()))) {
      issues.push({ path: "market.poolAddress", message: "must be an optional hex address" });
    }
  }
}

function validateRisk(value: unknown, issues: BotConfigIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: "risk", message: "must be an object" });
    return;
  }
  const rules: Record<keyof GlobalRiskLimits, { min: number; max?: number; integer?: boolean }> = {
    maxCapital: { min: 0.01 },
    maxPosition: { min: 0.01 },
    maxLoss: { min: 0.01 },
    maxDrawdownPct: { min: 0.01, max: 100 },
    maxConcurrentPositions: { min: 1, max: 100, integer: true },
    expiryHeadroomSec: { min: 0, max: 604800, integer: true },
    cooldownSec: { min: 0, max: 604800, integer: true },
  };
  for (const [key, rule] of Object.entries(rules) as [keyof GlobalRiskLimits, { min: number; max?: number; integer?: boolean }][]) {
    validateNumber(value[key], `risk.${key}`, issues, rule);
  }
  for (const key of Object.keys(value)) {
    if (!hasOwn(rules as unknown as Record<string, unknown>, key)) issues.push({ path: `risk.${key}`, message: "is not a supported risk limit" });
  }
}

export function validateBotConfig(value: unknown): BotConfigIssue[] {
  const issues: BotConfigIssue[] = [];
  if (!isRecord(value)) return [{ path: "config", message: "must be an object" }];
  if (value.version !== BOT_CONFIG_VERSION) issues.push({ path: "version", message: `must be ${BOT_CONFIG_VERSION}` });
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 60 || /[\r\n]/.test(value.name)) {
    issues.push({ path: "name", message: "must be a non-empty name of at most 60 characters" });
  }
  if (!STRATEGY_IDS.includes(value.strategy as StrategyId)) {
    issues.push({ path: "strategy", message: "must be one of the supported strategy ids" });
  }
  if (value.marketType !== "spot" && value.marketType !== "event") {
    issues.push({ path: "marketType", message: "must be spot or event" });
  }
  if (value.network !== "testnet" && value.network !== "mainnet") {
    issues.push({ path: "network", message: "must be testnet or mainnet" });
  }
  if (value.mode !== "dry-run" && value.mode !== "live") {
    issues.push({ path: "mode", message: "must be dry-run or live" });
  }
  validateMarket(value.marketType, value.market, issues);
  const template = templateFor(value.strategy);
  if (template && value.marketType !== undefined && !template.marketTypes.includes(value.marketType as BotMarketType)) {
    issues.push({ path: "marketType", message: `${template.name} supports ${template.marketTypes.join(" and ")} markets` });
  }
  if (template) validateParams(template.id, value.params, issues);
  validateRisk(value.risk, issues);
  return issues;
}

export function assertValidBotConfig(value: unknown): asserts value is BotConfig {
  const issues = validateBotConfig(value);
  if (issues.length) throw new BotConfigValidationError(issues);
}

function copyParams(strategy: StrategyId, value: Record<string, unknown>): StrategyParams {
  const template = templateFor(strategy);
  if (!template) throw new BotConfigValidationError([{ path: "strategy", message: "unsupported strategy" }]);
  const params: Record<string, number> = {};
  for (const field of template.fields) params[field.key] = value[field.key] as number;
  return params as unknown as StrategyParams;
}

export function sanitizeBotConfig(value: unknown): BotConfig {
  if (!isRecord(value)) throw new BotConfigValidationError([{ path: "config", message: "must be an object" }]);
  const strategy = value.strategy as StrategyId;
  const marketType = value.marketType as BotMarketType;
  const marketValue = isRecord(value.market) ? value.market : {};
  const market: BotMarketTarget = marketType === "event"
    ? {
      marketId: typeof marketValue.marketId === "string" ? marketValue.marketId.trim().toLowerCase() : "",
      outcome: marketValue.outcome as EventMarketTarget["outcome"],
      ...(typeof marketValue.symbol === "string" ? { symbol: marketValue.symbol.trim() } : {}),
    }
    : {
      symbol: typeof marketValue.symbol === "string" ? marketValue.symbol.trim() : "",
      ...(typeof marketValue.poolAddress === "string" ? { poolAddress: marketValue.poolAddress.trim().toLowerCase() } : {}),
    };
  const paramsValue = isRecord(value.params) ? value.params : {};
  const riskValue = isRecord(value.risk) ? value.risk : {};
  const safe: BotConfig = {
    version: value.version as BotConfigVersion,
    name: typeof value.name === "string" ? value.name.trim() : "",
    strategy,
    marketType,
    market,
    network: value.network as BotNetwork,
    mode: value.mode as BotMode,
    params: copyParams(strategy, paramsValue),
    risk: {
      maxCapital: riskValue.maxCapital as number,
      maxPosition: riskValue.maxPosition as number,
      maxLoss: riskValue.maxLoss as number,
      maxDrawdownPct: riskValue.maxDrawdownPct as number,
      maxConcurrentPositions: riskValue.maxConcurrentPositions as number,
      expiryHeadroomSec: riskValue.expiryHeadroomSec as number,
      cooldownSec: riskValue.cooldownSec as number,
    },
  };
  assertValidBotConfig(safe);
  return safe;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
  return result;
}

export function stableBotConfigJson(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? "null";
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function botConfigHash(value: unknown): string {
  return fnv1a(stableBotConfigJson(sanitizeBotConfig(value)));
}

export const configHash = botConfigHash;

export function serializeBotConfig(value: unknown): string {
  const safe = sanitizeBotConfig(value);
  return JSON.stringify({ ...safe, configHash: botConfigHash(safe) }, null, 2);
}

export const exportBotJson = serializeBotConfig;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export function exportBotEnv(value: unknown): string {
  const safe = sanitizeBotConfig(value);
  const hash = botConfigHash(safe);
  const marketJson = stableBotConfigJson(safe.market);
  const paramsJson = stableBotConfigJson(safe.params);
  const riskJson = stableBotConfigJson(safe.risk);
  const lines = [
    `BOT_CONFIG_VERSION=${BOT_CONFIG_VERSION}`,
    `BOT_CONFIG_HASH=${shellQuote(hash)}`,
    `BOT_NAME=${shellQuote(safe.name)}`,
    `BOT_STRATEGY=${shellQuote(safe.strategy)}`,
    `BOT_MARKET_TYPE=${shellQuote(safe.marketType)}`,
    `BOT_MARKET_JSON=${shellQuote(marketJson)}`,
    `BOT_NETWORK=${shellQuote(safe.network)}`,
    `BOT_MODE=${shellQuote(safe.mode)}`,
    `BOT_PARAMS_JSON=${shellQuote(paramsJson)}`,
    `BOT_RISK_JSON=${shellQuote(riskJson)}`,
    "BOT_SIGNER_SOURCE='external-wallet-or-secret-manager'",
  ];
  return `${lines.join("\n")}\n`;
}

export const serializeBotEnv = exportBotEnv;

export function defaultBotConfig(
  strategy: StrategyId = "starter",
  marketType: BotMarketType = "event",
): BotBuilderDraft {
  const template = templateFor(strategy) ?? STRATEGY_TEMPLATES[0];
  return {
    version: BOT_CONFIG_VERSION,
    name: template.name,
    strategy,
    marketType,
    market: marketType === "event"
      ? { marketId: "", outcome: "YES" }
      : { symbol: "" },
    network: "testnet",
    mode: "dry-run",
    params: { ...template.defaults },
    risk: { ...DEFAULT_RISK_LIMITS },
  };
}
