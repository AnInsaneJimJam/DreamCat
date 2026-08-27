import { TEMPLATES, type Archetype, type StrategyParams } from "./strategy";

export const COPILOT_ARCHETYPES = ["maker", "momentum", "fade", "fairvalue", "theta", "marketmaker"] as const;
export const STRATEGY_PARAM_KEYS = [
  "orderSize",
  "entryEdge",
  "takeProfit",
  "stopLoss",
  "lookback",
  "maxHoldSec",
  "edgeThreshold",
  "sigmaFloor",
  "settleSigmas",
  "maxEntryPrice",
  "tauGateSec",
  "quoteSpread",
  "requoteThreshold",
  "maxQuoteAgeSec",
  "flattenSec",
  "tapeWindowSec",
] as const;

export const COPILOT_PARAM_KEYS = STRATEGY_PARAM_KEYS.filter((key) => key !== "sigmaFloor" && key !== "requoteThreshold") as readonly Exclude<(typeof STRATEGY_PARAM_KEYS)[number], "sigmaFloor" | "requoteThreshold">[];

const COPILOT_WRITABLE_KEYS_BY_ARCHETYPE: Record<Archetype, readonly CopilotParamKey[]> = {
  maker: ["entryEdge", "orderSize", "takeProfit", "stopLoss", "lookback", "tapeWindowSec", "maxHoldSec"],
  momentum: ["entryEdge", "orderSize", "takeProfit", "stopLoss", "lookback", "tapeWindowSec", "maxHoldSec"],
  fade: ["entryEdge", "orderSize", "takeProfit", "stopLoss", "lookback", "tapeWindowSec", "maxHoldSec"],
  fairvalue: ["orderSize", "edgeThreshold", "takeProfit", "stopLoss", "maxHoldSec"],
  theta: ["orderSize", "settleSigmas", "maxEntryPrice", "tauGateSec", "stopLoss"],
  marketmaker: ["orderSize", "quoteSpread", "takeProfit", "stopLoss", "maxQuoteAgeSec", "flattenSec", "maxHoldSec"],
};

export function copilotWritableParamKeys(archetype: Archetype): readonly CopilotParamKey[] {
  return COPILOT_WRITABLE_KEYS_BY_ARCHETYPE[archetype];
}

export type CopilotArchetype = (typeof COPILOT_ARCHETYPES)[number];
export type StrategyParamKey = (typeof STRATEGY_PARAM_KEYS)[number];
export type CopilotParamKey = (typeof COPILOT_PARAM_KEYS)[number];
export type CopilotFieldPath = "archetype" | `params.${CopilotParamKey}`;
export type CopilotScalar = number | string | null;

export const COPILOT_FIELD_PATHS: readonly CopilotFieldPath[] = [
  "archetype",
  ...COPILOT_PARAM_KEYS.map((key) => `params.${key}` as const),
];

export const COPILOT_MAX_REQUEST_BYTES = 24 * 1024;
export const COPILOT_MAX_MESSAGE_CHARS = 2000;
export const COPILOT_MAX_HISTORY_TURNS = 8;
export const COPILOT_MAX_HISTORY_CHARS = 1000;
export const COPILOT_MAX_REPLY_CHARS = 2400;
export const COPILOT_MAX_NOTE_REASON_CHARS = 280;
export const COPILOT_MAX_NOTE_VALUE_CHARS = 120;
export const COPILOT_MAX_QUESTIONS = 3;
export const COPILOT_MAX_WARNINGS = 3;
export const COPILOT_MAX_LIST_ITEM_CHARS = 240;
export const COPILOT_MAX_FIELD_NOTES = 3;
export const COPILOT_MAX_REVISION = 2_147_483_647;
export const COPILOT_UPSTREAM_TIMEOUT_MS = 45_000;

export interface ParamRange {
  min: number;
  max: number;
  integer?: boolean;
}

export const STRATEGY_PARAM_RANGES: Record<StrategyParamKey, ParamRange> = {
  orderSize: { min: 1, max: 50, integer: true },
  entryEdge: { min: 0.5, max: 0.95 },
  takeProfit: { min: 0.01, max: 0.15 },
  stopLoss: { min: 0.01, max: 0.1 },
  lookback: { min: 3, max: 20, integer: true },
  maxHoldSec: { min: 30, max: 900, integer: true },
  edgeThreshold: { min: 0.02, max: 0.2 },
  sigmaFloor: { min: 0.0001, max: 0.02 },
  settleSigmas: { min: 0.5, max: 4 },
  maxEntryPrice: { min: 0.6, max: 0.98 },
  tauGateSec: { min: 60, max: 1800, integer: true },
  quoteSpread: { min: 0.005, max: 0.08 },
  requoteThreshold: { min: 0.001, max: 0.05 },
  maxQuoteAgeSec: { min: 15, max: 600, integer: true },
  flattenSec: { min: 15, max: 300, integer: true },
  tapeWindowSec: { min: 60, max: 3600, integer: true },
};

const REQUIRED_PARAM_KEYS = ["orderSize", "entryEdge", "takeProfit", "stopLoss", "lookback", "maxHoldSec"] as const;

export interface StrategyCopilotDraft {
  archetype: Archetype;
  params: StrategyParams;
}

export interface StrategyCopilotTurn {
  role: "user" | "assistant";
  content: string;
}

export interface StrategyCopilotRequest {
  message: string;
  draft: StrategyCopilotDraft;
  revision: number;
  history?: StrategyCopilotTurn[];
}

export type StrategyCopilotParamPatch = { [K in CopilotParamKey]: number | null };

export interface StrategyCopilotPatch {
  archetype: Archetype | null;
  params: StrategyCopilotParamPatch;
}

export interface StrategyCopilotFieldNote {
  path: CopilotFieldPath;
  before: CopilotScalar;
  after: CopilotScalar;
  reason: string;
}

export type StrategyCopilotIntent = "explain" | "configure" | "clarify";

export interface StrategyCopilotResponse {
  intent: StrategyCopilotIntent;
  reply: string;
  patch: StrategyCopilotPatch;
  fieldNotes: StrategyCopilotFieldNote[];
  questions: string[];
  warnings: string[];
}

export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

export interface ValidationFailure {
  ok: false;
  error: string;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: RecordValue, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasExactlyKeys(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && hasOnlyKeys(value, keys) && keys.every((key) => key in value);
}

function isArchetype(value: unknown): value is Archetype {
  return typeof value === "string" && (COPILOT_ARCHETYPES as readonly string[]).includes(value);
}

function characterCount(value: string): number {
  return Array.from(value).length;
}

function validText(value: unknown, maxChars: number, required = true): value is string {
  return typeof value === "string" && characterCount(value) <= maxChars && (!required || value.trim().length > 0);
}

function validNumber(value: unknown, range: ParamRange): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (!range.integer || Number.isInteger(value)) &&
    value >= range.min &&
    value <= range.max
  );
}

function validateParamObject(value: unknown, requireAll = false): ValidationResult<StrategyParams> {
  if (!isRecord(value) || !hasOnlyKeys(value, STRATEGY_PARAM_KEYS)) return { ok: false, error: "draft.params contains an unknown field" };
  for (const key of REQUIRED_PARAM_KEYS) {
    if (!(key in value)) return { ok: false, error: `draft.params.${key} is required` };
  }
  if (requireAll && !hasExactlyKeys(value, COPILOT_PARAM_KEYS)) return { ok: false, error: "params must include every copilot field" };
  for (const key of STRATEGY_PARAM_KEYS) {
    if (!(key in value)) continue;
    const candidate = value[key];
    if (!validNumber(candidate, STRATEGY_PARAM_RANGES[key])) return { ok: false, error: `params.${key} is outside its allowed range` };
  }
  return { ok: true, value: value as unknown as StrategyParams };
}

export function validateStrategyCopilotDraft(value: unknown): ValidationResult<StrategyCopilotDraft> {
  if (!isRecord(value) || !hasExactlyKeys(value, ["archetype", "params"])) return { ok: false, error: "draft must contain only archetype and params" };
  if (!isArchetype(value.archetype)) return { ok: false, error: "draft.archetype is invalid" };
  const params = validateParamObject(value.params);
  if (!params.ok) return params;
  return { ok: true, value: { archetype: value.archetype, params: params.value } };
}

function validateHistory(value: unknown): ValidationResult<StrategyCopilotTurn[] | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value) || value.length > COPILOT_MAX_HISTORY_TURNS) return { ok: false, error: "history is too long" };
  const history: StrategyCopilotTurn[] = [];
  for (const turn of value) {
    if (!isRecord(turn) || !hasExactlyKeys(turn, ["role", "content"])) return { ok: false, error: "history contains an invalid turn" };
    if (turn.role !== "user" && turn.role !== "assistant") return { ok: false, error: "history contains an invalid role" };
    if (!validText(turn.content, COPILOT_MAX_HISTORY_CHARS)) return { ok: false, error: "history contains oversized text" };
    history.push({ role: turn.role, content: turn.content });
  }
  return { ok: true, value: history };
}

export function validateStrategyCopilotRequest(value: unknown): ValidationResult<StrategyCopilotRequest> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["message", "draft", "revision", "history"])) return { ok: false, error: "request contains an unknown field" };
  if (!validText(value.message, COPILOT_MAX_MESSAGE_CHARS)) return { ok: false, error: "message is empty or too long" };
  if (typeof value.revision !== "number" || !Number.isInteger(value.revision) || value.revision < 0 || value.revision > COPILOT_MAX_REVISION) {
    return { ok: false, error: "revision is invalid" };
  }
  const draft = validateStrategyCopilotDraft(value.draft);
  if (!draft.ok) return draft;
  const history = validateHistory(value.history);
  if (!history.ok) return history;
  return { ok: true, value: { message: value.message.trim(), draft: draft.value, revision: value.revision, history: history.value } };
}

function scalarValue(value: unknown): value is CopilotScalar {
  return value === null || (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && characterCount(value) <= COPILOT_MAX_NOTE_VALUE_CHARS);
}

function validatePatch(value: unknown, draftArchetype: Archetype): ValidationResult<StrategyCopilotPatch> {
  if (!isRecord(value) || !hasExactlyKeys(value, ["archetype", "params"])) return { ok: false, error: "model patch is invalid" };
  if (value.archetype !== null && !isArchetype(value.archetype)) return { ok: false, error: "model archetype is invalid" };
  if (!isRecord(value.params) || !hasExactlyKeys(value.params, COPILOT_PARAM_KEYS)) return { ok: false, error: "model params are incomplete" };
  const targetArchetype = value.archetype ?? draftArchetype;
  const writableKeys = new Set(copilotWritableParamKeys(targetArchetype));
  const params = {} as StrategyCopilotParamPatch;
  for (const key of COPILOT_PARAM_KEYS) {
    const candidate = value.params[key];
    if (candidate !== null && !writableKeys.has(key)) return { ok: false, error: `model params.${key} is not used by the target strategy` };
    if (candidate !== null && !validNumber(candidate, STRATEGY_PARAM_RANGES[key])) return { ok: false, error: `model params.${key} is outside its allowed range` };
    params[key] = candidate as number | null;
  }
  return { ok: true, value: { archetype: value.archetype, params } };
}

function draftValueForPath(draft: StrategyCopilotDraft, path: CopilotFieldPath): CopilotScalar {
  if (path === "archetype") return draft.archetype;
  const key = path.slice("params.".length) as CopilotParamKey;
  return draft.params[key] ?? null;
}

function patchValueForPath(patch: StrategyCopilotPatch, path: CopilotFieldPath): CopilotScalar {
  if (path === "archetype") return patch.archetype;
  const key = path.slice("params.".length) as CopilotParamKey;
  return patch.params[key];
}

function validateFieldNotes(value: unknown, draft: StrategyCopilotDraft, patch: StrategyCopilotPatch): ValidationResult<StrategyCopilotFieldNote[]> {
  if (!Array.isArray(value) || value.length > COPILOT_MAX_FIELD_NOTES) return { ok: false, error: "model field notes are invalid" };
  const targetArchetype = patch.archetype ?? draft.archetype;
  const writableKeys = new Set(copilotWritableParamKeys(targetArchetype));
  const notes: StrategyCopilotFieldNote[] = [];
  for (const note of value) {
    if (!isRecord(note) || !hasExactlyKeys(note, ["path", "before", "after", "reason"])) return { ok: false, error: "model field note is invalid" };
    if (!(COPILOT_FIELD_PATHS as readonly string[]).includes(String(note.path))) return { ok: false, error: "model field note path is invalid" };
    if (!scalarValue(note.before) || !scalarValue(note.after) || !validText(note.reason, COPILOT_MAX_NOTE_REASON_CHARS)) return { ok: false, error: "model field note value is invalid" };
    const path = note.path as CopilotFieldPath;
    if (path !== "archetype") {
      const key = path.slice("params.".length) as CopilotParamKey;
      if (!writableKeys.has(key)) return { ok: false, error: "model field note is not used by the target strategy" };
    }
    const before = draftValueForPath(draft, path);
    const proposed = patchValueForPath(patch, path);
    notes.push({ path, before, after: proposed ?? before, reason: note.reason.trim() });
  }
  return { ok: true, value: notes };
}

function validateStringList(value: unknown, maxItems: number, label: string): ValidationResult<string[]> {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => !validText(item, COPILOT_MAX_LIST_ITEM_CHARS))) return { ok: false, error: `model ${label} are invalid` };
  return { ok: true, value: value.map((item) => item.trim()) };
}

export function normalizeStrategyCopilotResponse(value: unknown, draft: StrategyCopilotDraft): ValidationResult<StrategyCopilotResponse> {
  if (!isRecord(value) || !hasExactlyKeys(value, ["intent", "reply", "patch", "fieldNotes", "questions", "warnings"])) return { ok: false, error: "model response shape is invalid" };
  if (value.intent !== "explain" && value.intent !== "configure" && value.intent !== "clarify") return { ok: false, error: "model intent is invalid" };
  if (!validText(value.reply, COPILOT_MAX_REPLY_CHARS)) return { ok: false, error: "model reply is invalid" };
  const patch = validatePatch(value.patch, draft.archetype);
  if (!patch.ok) return patch;
  if (value.intent !== "configure" && (patch.value.archetype !== null || COPILOT_PARAM_KEYS.some((key) => patch.value.params[key] !== null))) {
    return { ok: false, error: "explanation responses cannot change strategy fields" };
  }
  const fieldNotes = validateFieldNotes(value.fieldNotes, draft, patch.value);
  if (!fieldNotes.ok) return fieldNotes;
  const questions = validateStringList(value.questions, COPILOT_MAX_QUESTIONS, "questions");
  if (!questions.ok) return questions;
  const warnings = validateStringList(value.warnings, COPILOT_MAX_WARNINGS, "warnings");
  if (!warnings.ok) return warnings;
  return {
    ok: true,
    value: {
      intent: value.intent,
      reply: value.reply.trim(),
      patch: patch.value,
      fieldNotes: fieldNotes.value,
      questions: questions.value,
      warnings: warnings.value,
    },
  };
}

export function applyStrategyCopilotProposal(draft: StrategyCopilotDraft, response: StrategyCopilotResponse): StrategyCopilotDraft {
  const nextArchetype = response.patch.archetype ?? draft.archetype;
  const changedArchetype = nextArchetype !== draft.archetype;
  const template = TEMPLATES.find((candidate) => candidate.archetype === nextArchetype);
  const nextParams: StrategyParams = changedArchetype && template ? { ...template.defaults } : { ...draft.params };
  const writableKeys = new Set(copilotWritableParamKeys(nextArchetype));
  for (const key of COPILOT_PARAM_KEYS) {
    const candidate = response.patch.params[key];
    if (candidate !== null && writableKeys.has(key)) nextParams[key] = candidate;
  }
  return { archetype: nextArchetype, params: nextParams };
}

const nullableNumber = (key: CopilotParamKey) => ({
  anyOf: [{ type: "null" }, { type: STRATEGY_PARAM_RANGES[key].integer ? "integer" : "number", minimum: STRATEGY_PARAM_RANGES[key].min, maximum: STRATEGY_PARAM_RANGES[key].max }],
});

export const strategyCopilotResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "reply", "patch", "fieldNotes", "questions", "warnings"],
  properties: {
    intent: { type: "string", enum: ["explain", "configure", "clarify"] },
    reply: { type: "string", minLength: 1, maxLength: COPILOT_MAX_REPLY_CHARS },
    patch: {
      type: "object",
      additionalProperties: false,
      required: ["archetype", "params"],
      properties: {
        archetype: { anyOf: [{ type: "null" }, { type: "string", enum: [...COPILOT_ARCHETYPES] }] },
        params: {
          type: "object",
          additionalProperties: false,
          required: [...COPILOT_PARAM_KEYS],
          properties: Object.fromEntries(COPILOT_PARAM_KEYS.map((key) => [key, nullableNumber(key)])),
        },
      },
    },
    fieldNotes: {
      type: "array",
      maxItems: COPILOT_MAX_FIELD_NOTES,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "before", "after", "reason"],
        properties: {
          path: { type: "string", enum: [...COPILOT_FIELD_PATHS] },
          before: { anyOf: [{ type: "null" }, { type: "number" }, { type: "string", maxLength: COPILOT_MAX_NOTE_VALUE_CHARS }] },
          after: { anyOf: [{ type: "null" }, { type: "number" }, { type: "string", maxLength: COPILOT_MAX_NOTE_VALUE_CHARS }] },
          reason: { type: "string", minLength: 1, maxLength: COPILOT_MAX_NOTE_REASON_CHARS },
        },
      },
    },
    questions: { type: "array", maxItems: COPILOT_MAX_QUESTIONS, items: { type: "string", minLength: 1, maxLength: COPILOT_MAX_LIST_ITEM_CHARS } },
    warnings: { type: "array", maxItems: COPILOT_MAX_WARNINGS, items: { type: "string", minLength: 1, maxLength: COPILOT_MAX_LIST_ITEM_CHARS } },
  },
} as const;
