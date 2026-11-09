import { test } from "node:test";
import assert from "node:assert/strict";
import { codexBridgeProvider } from "../../src/server/ai/codex-bridge-provider";

test("no socket configured → UNCONFIGURED", async () => {
  assert.deepEqual(await codexBridgeProvider("").suggest("s", "u"), { ok: false, reason: "UNCONFIGURED" });
});

test("passes system/user/schema and returns bridge output", async () => {
  let sent: { system: string; user: string; schema: { required: string[] } } | null = null;
  const p = codexBridgeProvider("/x.sock", async (_s, body) => {
    sent = JSON.parse(body);
    return { status: 200, text: JSON.stringify({ ok: true, output: { a: 1 } }) };
  });
  assert.deepEqual(await p.suggest("sys", "usr"), { ok: true, output: { a: 1 } });
  assert.equal(sent!.system, "sys");
  assert.ok(sent!.schema.required.includes("categoryId"));
});

test("bridge errors, unknown reasons, bad JSON, timeouts map to provider failures", async () => {
  const mk = (r: { status: number; text: string } | Error) => codexBridgeProvider("/x.sock", async () => { if (r instanceof Error) throw r; return r; });
  assert.deepEqual(await mk({ status: 200, text: JSON.stringify({ ok: false, reason: "TIMEOUT" }) }).suggest("s", "u"), { ok: false, reason: "TIMEOUT" });
  assert.deepEqual(await mk({ status: 200, text: JSON.stringify({ ok: false, reason: "WEIRD" }) }).suggest("s", "u"), { ok: false, reason: "PROVIDER_ERROR" });
  assert.deepEqual(await mk({ status: 500, text: "" }).suggest("s", "u"), { ok: false, reason: "PROVIDER_ERROR" });
  assert.deepEqual(await mk({ status: 200, text: "nope" }).suggest("s", "u"), { ok: false, reason: "PROVIDER_ERROR" });
  assert.deepEqual(await mk(Object.assign(new Error("t"), { name: "TimeoutError" })).suggest("s", "u"), { ok: false, reason: "TIMEOUT" });
});
