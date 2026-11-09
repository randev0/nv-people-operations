import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTemplateGraph, effectiveStatus, progressOf } from "../../src/server/onboarding/dependencies";

const t = (key: string, sortOrder: number, prerequisiteKeys: string[] = []) => ({ key, sortOrder, prerequisiteKeys });

test("valid DAG has no issues", () => {
  assert.deepEqual(validateTemplateGraph([t("a", 0), t("b", 1, ["a"]), t("c", 2, ["a", "b"])]), []);
});

test("self edge, missing prerequisite, duplicates", () => {
  const msgs = validateTemplateGraph([t("a", 0, ["a"]), t("b", 0, ["zzz"]), t("b", 2)]).map((i) => i.message);
  assert.ok(msgs.some((m) => m.includes("cannot depend on itself")));
  assert.ok(msgs.some((m) => m.includes('unknown task "zzz"')));
  assert.ok(msgs.some((m) => m.includes("Duplicate task key")));
  assert.ok(msgs.some((m) => m.includes("Duplicate sort order")));
});

test("cycle is detected and reported as a loop", () => {
  const issues = validateTemplateGraph([t("a", 0, ["c"]), t("b", 1, ["a"]), t("c", 2, ["b"]), t("d", 3)]);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /Dependency cycle: .* → .*/);
  const loop = issues[0].message.replace("Dependency cycle: ", "").replace(".", "").split(" → ");
  assert.equal(loop[0], loop[loop.length - 1]);
  assert.ok(!loop.includes("d"));
});

test("task count bounds", () => {
  assert.equal(validateTemplateGraph([]).length, 1);
  assert.equal(validateTemplateGraph(Array.from({ length: 31 }, (_, i) => t(`k${i}`, i))).length, 1);
});

test("effective status derives BLOCKED only for NOT_STARTED with incomplete prerequisites", () => {
  assert.equal(effectiveStatus("NOT_STARTED", [{ status: "IN_PROGRESS" }]), "BLOCKED");
  assert.equal(effectiveStatus("NOT_STARTED", [{ status: "COMPLETED" }]), "NOT_STARTED");
  assert.equal(effectiveStatus("NOT_STARTED", []), "NOT_STARTED");
  assert.equal(effectiveStatus("IN_PROGRESS", [{ status: "NOT_STARTED" }]), "IN_PROGRESS");
});

test("progress counts: blocked and overdue overlap, pending includes in-progress", () => {
  const p = progressOf([
    { status: "COMPLETED", effectiveStatus: "COMPLETED", isOverdue: false },
    { status: "IN_PROGRESS", effectiveStatus: "IN_PROGRESS", isOverdue: true },
    { status: "NOT_STARTED", effectiveStatus: "BLOCKED", isOverdue: true },
  ]);
  assert.deepEqual(p, { total: 3, completed: 1, pending: 2, inProgress: 1, blocked: 1, overdue: 2, percent: 33 });
});
