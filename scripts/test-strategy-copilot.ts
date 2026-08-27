import assert from "node:assert/strict";
import {
  applyStrategyCopilotProposal,
  COPILOT_PARAM_KEYS,
  copilotWritableParamKeys,
  normalizeStrategyCopilotResponse,
  strategyCopilotResponseSchema,
  STRATEGY_PARAM_KEYS,
  validateStrategyCopilotRequest,
  type StrategyCopilotResponse,
} from "../lib/strategy-copilot";
import { TEMPLATES, type StrategyParams } from "../lib/strategy";

const baseParams: StrategyParams = { ...TEMPLATES[1].defaults };
const baseDraft = { archetype: "momentum" as const, params: baseParams };
const nullParams = Object.fromEntries(COPILOT_PARAM_KEYS.map((key) => [key, null])) as StrategyCopilotResponse["patch"]["params"];

const request = validateStrategyCopilotRequest({
  message: "Explain the entry signal",
  draft: baseDraft,
  revision: 4,
  history: [{ role: "user", content: "What does momentum do?" }],
});
assert.equal(request.ok, true);
assert.deepEqual(copilotWritableParamKeys("fairvalue"), ["orderSize", "edgeThreshold", "takeProfit", "stopLoss", "maxHoldSec"]);
assert.deepEqual(copilotWritableParamKeys("theta"), ["orderSize", "settleSigmas", "maxEntryPrice", "tauGateSec", "stopLoss"]);

const explanation = normalizeStrategyCopilotResponse({
  intent: "explain",
  reply: "Momentum follows recent buy-skewed prints.",
  patch: { archetype: null, params: nullParams },
  fieldNotes: [],
  questions: [],
  warnings: [],
}, baseDraft);
assert.equal(explanation.ok, true);

const configuration = normalizeStrategyCopilotResponse({
  intent: "configure",
  reply: "Fair value is a model-led setup. I tightened size and required a clearer edge.",
  patch: {
    archetype: "fairvalue",
    params: { ...nullParams, orderSize: 2, edgeThreshold: 0.09 },
  },
  fieldNotes: [
    { path: "archetype", before: "momentum", after: "fairvalue", reason: "Use the spot and strike model for the requested fair-value behavior." },
    { path: "params.orderSize", before: 5, after: 2, reason: "Smaller size keeps the paper test conservative." },
  ],
  questions: [],
  warnings: ["This is a paper-trading suggestion, not a performance claim."],
}, baseDraft);
assert.equal(configuration.ok, true);
if (configuration.ok) {
  assert.equal(configuration.value.fieldNotes[0].before, "momentum");
  const merged = applyStrategyCopilotProposal(baseDraft, configuration.value);
  assert.equal(merged.archetype, "fairvalue");
  assert.equal(merged.params.orderSize, 2);
  assert.equal(merged.params.edgeThreshold, 0.09);
  assert.equal(merged.params.sigmaFloor, TEMPLATES[3].defaults.sigmaFloor);
  assert.equal(merged.params.tapeWindowSec, undefined);
}

const unknownDraftField = validateStrategyCopilotRequest({
  message: "hello",
  draft: { ...baseDraft, params: { ...baseParams, notAField: 1 } },
  revision: 0,
});
assert.equal(unknownDraftField.ok, false);

const outOfRange = normalizeStrategyCopilotResponse({
  intent: "configure",
  reply: "Try this.",
  patch: { archetype: null, params: { ...nullParams, stopLoss: 0.5 } },
  fieldNotes: [],
  questions: [],
  warnings: [],
}, baseDraft);
assert.equal(outOfRange.ok, false);

const numericString = normalizeStrategyCopilotResponse({
  intent: "configure",
  reply: "Try this.",
  patch: { archetype: null, params: { ...nullParams, orderSize: "3" } },
  fieldNotes: [],
  questions: [],
  warnings: [],
}, baseDraft);
assert.equal(numericString.ok, false);

const inactiveCurrentField = normalizeStrategyCopilotResponse({
  intent: "configure",
  reply: "Try a wider model edge.",
  patch: { archetype: null, params: { ...nullParams, edgeThreshold: 0.09 } },
  fieldNotes: [],
  questions: [],
  warnings: [],
}, baseDraft);
assert.equal(inactiveCurrentField.ok, false);

const targetField = normalizeStrategyCopilotResponse({
  intent: "configure",
  reply: "Switching to fair value uses a model edge.",
  patch: { archetype: "fairvalue", params: { ...nullParams, edgeThreshold: 0.09 } },
  fieldNotes: [{ path: "params.edgeThreshold", before: null, after: 0.09, reason: "Require a measurable gap between model fair value and the offer." }],
  questions: [],
  warnings: [],
}, baseDraft);
assert.equal(targetField.ok, true);

const inactiveTargetField = normalizeStrategyCopilotResponse({
  intent: "configure",
  reply: "Switching to fair value.",
  patch: { archetype: "fairvalue", params: { ...nullParams, tapeWindowSec: 300 } },
  fieldNotes: [],
  questions: [],
  warnings: [],
}, baseDraft);
assert.equal(inactiveTargetField.ok, false);

const inactiveTargetNote = normalizeStrategyCopilotResponse({
  intent: "configure",
  reply: "Switching to fair value.",
  patch: { archetype: "fairvalue", params: nullParams },
  fieldNotes: [{ path: "params.tapeWindowSec", before: 300, after: null, reason: "This tape control is not used by fair value." }],
  questions: [],
  warnings: [],
}, baseDraft);
assert.equal(inactiveTargetNote.ok, false);

const preservedSameArchetype = normalizeStrategyCopilotResponse({
  intent: "configure",
  reply: "Increase the time stop.",
  patch: { archetype: null, params: { ...nullParams, maxHoldSec: 360 } },
  fieldNotes: [{ path: "params.maxHoldSec", before: 240, after: 360, reason: "Allow the tape setup more time to resolve." }],
  questions: [],
  warnings: [],
}, baseDraft);
assert.equal(preservedSameArchetype.ok, true);
if (preservedSameArchetype.ok) {
  const merged = applyStrategyCopilotProposal(baseDraft, preservedSameArchetype.value);
  assert.equal(merged.archetype, "momentum");
  assert.equal(merged.params.maxHoldSec, 360);
  assert.equal(merged.params.tapeWindowSec, baseDraft.params.tapeWindowSec);
}

const unsafeHiddenPatch = {
  intent: "configure",
  reply: "Hidden fields must not be applied.",
  patch: { archetype: "fairvalue", params: { ...nullParams, tapeWindowSec: 120 } },
  fieldNotes: [],
  questions: [],
  warnings: [],
} as unknown as StrategyCopilotResponse;
const hiddenMerge = applyStrategyCopilotProposal(baseDraft, unsafeHiddenPatch);
assert.equal(hiddenMerge.archetype, "fairvalue");
assert.equal(hiddenMerge.params.tapeWindowSec, undefined);

assert.equal((strategyCopilotResponseSchema as { additionalProperties?: boolean }).additionalProperties, false);
assert.equal(((strategyCopilotResponseSchema as { properties: { patch: { additionalProperties?: boolean } } }).properties.patch).additionalProperties, false);
assert.equal(STRATEGY_PARAM_KEYS.includes("sigmaFloor"), true);
assert.equal(COPILOT_PARAM_KEYS.includes("sigmaFloor" as (typeof COPILOT_PARAM_KEYS)[number]), false);
assert.equal(COPILOT_PARAM_KEYS.includes("requoteThreshold" as (typeof COPILOT_PARAM_KEYS)[number]), false);
console.log("strategy copilot checks passed");
