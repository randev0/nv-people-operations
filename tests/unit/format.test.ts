import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDueDay } from "../../src/lib/format";
import { dueDateFor } from "../../src/server/onboarding/dates";

test("relative deadline labels match the brief's wording", () => {
  assert.equal(formatDueDay(1), "Day 1");
  assert.equal(formatDueDay(2), "Day 2");
  assert.equal(formatDueDay(7), "Week 1");
  assert.equal(formatDueDay(14), "Week 2");
  assert.equal(formatDueDay(30), "Day 30");
});

test("labels and calendar dates agree (Day 1 = start, Week 1 = start + 6, Day 30 = start + 29)", () => {
  assert.equal(dueDateFor("2026-11-02", 1), "2026-11-02");
  assert.equal(dueDateFor("2026-11-02", 7), "2026-11-08");
  assert.equal(dueDateFor("2026-11-02", 30), "2026-12-01");
});
