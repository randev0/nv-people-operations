import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { openaiProvider, extractOutputText } from "../../src/server/ai/openai-provider";

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key-not-real";
  process.env.OPENAI_MODEL = "gpt-6.1-sol";
});

const payload = (text: string) => ({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text }] }] });
const fake = (responses: (Response | Error)[], calls: RequestInit[] = []) =>
  (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init!);
    const r = responses.shift()!;
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;

test("sends strict json_schema request with configured model and parses output", async () => {
  const calls: RequestInit[] = [];
  const out = { categoryId: "c", priority: "LOW", suggestedDepartmentId: "d", suggestedAssigneeId: null, explanation: "x" };
  const r = await openaiProvider(fake([new Response(JSON.stringify(payload(JSON.stringify(out))), { status: 200 })], calls)).suggest("sys", "user");
  assert.deepEqual(r, { ok: true, output: out });
  const sent = JSON.parse(calls[0].body as string);
  assert.equal(sent.model, "gpt-6.1-sol");
  assert.equal(sent.text.format.type, "json_schema");
  assert.equal(sent.text.format.strict, true);
  assert.equal(sent.store, false);
  assert.equal((calls[0].headers as Record<string, string>).Authorization, "Bearer test-key-not-real");
});

test("missing key or model → UNCONFIGURED without calling the API", async () => {
  delete process.env.OPENAI_API_KEY;
  const calls: RequestInit[] = [];
  assert.deepEqual(await openaiProvider(fake([], calls)).suggest("s", "u"), { ok: false, reason: "UNCONFIGURED" });
  assert.equal(calls.length, 0);
});

test("retries once on 429/5xx, then gives up", async () => {
  const calls: RequestInit[] = [];
  const r = await openaiProvider(fake([new Response("", { status: 503 }), new Response("", { status: 429 })], calls)).suggest("s", "u");
  assert.deepEqual(r, { ok: false, reason: "PROVIDER_ERROR" });
  assert.equal(calls.length, 2);
});

test("4xx is not retried; timeout reported; non-JSON output rejected", async () => {
  const c1: RequestInit[] = [];
  assert.deepEqual(await openaiProvider(fake([new Response("", { status: 401 })], c1)).suggest("s", "u"), { ok: false, reason: "PROVIDER_ERROR" });
  assert.equal(c1.length, 1);
  const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  assert.deepEqual(await openaiProvider(fake([abort, abort])).suggest("s", "u"), { ok: false, reason: "TIMEOUT" });
  const bad = new Response(JSON.stringify(payload("not json")), { status: 200 });
  assert.deepEqual(await openaiProvider(fake([bad])).suggest("s", "u"), { ok: false, reason: "NO_STRUCTURED_OUTPUT" });
  assert.equal(extractOutputText({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }), null);
});
