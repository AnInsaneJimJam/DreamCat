import assert from "node:assert/strict";
import { maxDuration, POST } from "../app/api/strategy-copilot/route";
import { COPILOT_MAX_REQUEST_BYTES, COPILOT_UPSTREAM_TIMEOUT_MS, strategyCopilotResponseSchema } from "../lib/strategy-copilot";
import { TEMPLATES, type StrategyParams } from "../lib/strategy";

const baseDraft = { archetype: "momentum" as const, params: { ...TEMPLATES[1].defaults } as StrategyParams };

function requestFor(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3111/api/strategy-copilot", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3111", ...headers },
    body,
  });
}

function validBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    message: "Explain the momentum entry signal",
    draft: baseDraft,
    revision: 0,
    ...overrides,
  });
}

async function errorBody(response: Response): Promise<{ error?: string; message?: string }> {
  return (await response.json()) as { error?: string; message?: string };
}

async function expectError(response: Response, status: number, code: string): Promise<void> {
  assert.equal(response.status, status);
  const body = await errorBody(response);
  assert.equal(body.error, code);
  assert.equal(typeof body.message, "string");
  assert.equal(response.headers.get("cache-control"), "no-store");
}

const savedApiKey = process.env.OPENROUTER_API_KEY;
const savedModel = process.env.OPENROUTER_MODEL;
const savedFetch = globalThis.fetch;
let upstreamCalls = 0;

async function main(): Promise<void> {
  assert.equal(maxDuration, 60);
  assert.equal(COPILOT_UPSTREAM_TIMEOUT_MS, 45_000);
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error("network disabled in strategy copilot route tests");
  };

  try {
    await expectError(
      await POST(requestFor(validBody(), { origin: "https://attacker.example" })),
      403,
      "origin_not_allowed",
    );

    await expectError(
      await POST(new Request("http://localhost:3111/api/strategy-copilot", { method: "POST", body: validBody() })),
      403,
      "origin_not_allowed",
    );

    await expectError(await POST(requestFor("not json")), 400, "invalid_request");

    await expectError(
      await POST(requestFor(validBody({ message: "   " }))),
      400,
      "invalid_request",
    );

    await expectError(
      await POST(requestFor(validBody({ draft: { ...baseDraft, unexpected: true } }))),
      400,
      "invalid_request",
    );

    await expectError(
      await POST(
        requestFor(
          validBody({
            draft: { ...baseDraft, params: { ...baseDraft.params, orderSize: 0 } },
          }),
        ),
      ),
      400,
      "invalid_request",
    );

    await expectError(
      await POST(
        requestFor("x".repeat(COPILOT_MAX_REQUEST_BYTES + 1), {
          "content-type": "application/json",
        }),
      ),
      400,
      "invalid_request",
    );

    const missingConfig = await POST(requestFor(validBody()));
    await expectError(missingConfig, 503, "copilot_not_configured");
    assert.equal(upstreamCalls, 0);

    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "openai/gpt-5.6-luna";
    const capturedPayloads: Record<string, unknown>[] = [];
    globalThis.fetch = async (_input, init) => {
      upstreamCalls += 1;
      capturedPayloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      const nullParams = Object.fromEntries([
        "orderSize",
        "entryEdge",
        "takeProfit",
        "stopLoss",
        "lookback",
        "maxHoldSec",
        "edgeThreshold",
        "settleSigmas",
        "maxEntryPrice",
        "tauGateSec",
        "quoteSpread",
        "maxQuoteAgeSec",
        "flattenSec",
        "tapeWindowSec",
      ].map((key) => [key, null]));
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ intent: "explain", reply: "Momentum follows recent buy-skewed prints.", patch: { archetype: null, params: nullParams }, fieldNotes: [], questions: [], warnings: [] }) } }],
      });
    };
    const configured = await POST(requestFor(validBody()));
    assert.equal(configured.status, 200);
    assert.equal(upstreamCalls, 1);
    const capturedPayload = capturedPayloads[0];
    assert.ok(capturedPayload);
    assert.equal(capturedPayload.model, "openai/gpt-5.6-luna");
    assert.equal("temperature" in capturedPayload, false);
    assert.deepEqual(capturedPayload.reasoning, { enabled: true });
    assert.equal("max_completion_tokens" in capturedPayload, false);
    assert.equal(capturedPayload.stream, false);
    assert.deepEqual(capturedPayload.response_format, {
      type: "json_schema",
      json_schema: {
        name: "dreamcat_strategy_copilot",
        strict: true,
        schema: strategyCopilotResponseSchema,
      },
    });
    assert.deepEqual(capturedPayload.provider, { require_parameters: true, data_collection: "deny" });
  } finally {
    if (savedApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = savedApiKey;
    if (savedModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = savedModel;
    globalThis.fetch = savedFetch;
  }

  console.log("strategy copilot route checks passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
