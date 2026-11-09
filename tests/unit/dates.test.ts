import { test } from "node:test";
import assert from "node:assert/strict";
import { dueDateFor, isOverdue, todayIn, parseDateOnly, addCalendarDays, COUNTRY_TIMEZONES } from "../../src/server/onboarding/dates";

test("Day 1/7/30 from joining date", () => {
  assert.equal(dueDateFor("2026-03-10", 1), "2026-03-10");
  assert.equal(dueDateFor("2026-03-10", 7), "2026-03-16");
  assert.equal(dueDateFor("2026-03-10", 30), "2026-04-08");
});

test("month, leap-year and year boundaries", () => {
  assert.equal(dueDateFor("2026-01-31", 2), "2026-02-01");
  assert.equal(dueDateFor("2028-02-28", 2), "2028-02-29");
  assert.equal(dueDateFor("2026-12-28", 7), "2027-01-03");
  assert.equal(addCalendarDays("2027-01-01", -1), "2026-12-31");
});

test("Cyprus DST change does not move the due date (EU DST ends 2026-10-25)", () => {
  assert.equal(dueDateFor("2026-10-20", 7), "2026-10-26");
  assert.equal(dueDateFor("2026-03-27", 7), "2026-04-02"); // DST starts 2026-03-29
});

test("rejects invalid dates and dueDay", () => {
  assert.throws(() => parseDateOnly("2026-02-30"));
  assert.throws(() => parseDateOnly("2026-2-3"));
  assert.throws(() => dueDateFor("2026-01-01", 0));
});

test("todayIn uses the IANA zone, not the server zone", () => {
  // 2026-11-09T17:30Z is 2026-11-10 01:30 in Kuala Lumpur, still 2026-11-09 19:30 in Nicosia.
  const now = new Date("2026-11-09T17:30:00Z");
  assert.equal(todayIn(COUNTRY_TIMEZONES.MY, now), "2026-11-10");
  assert.equal(todayIn(COUNTRY_TIMEZONES.CY, now), "2026-11-09");
  assert.equal(todayIn(COUNTRY_TIMEZONES.BD, now), "2026-11-09"); // 23:30 Dhaka
});

test("O11: not overdue on the local due date, overdue the next local day", () => {
  const task = { status: "IN_PROGRESS", dueDate: "2026-11-09" };
  assert.equal(isOverdue(task, "Asia/Kuala_Lumpur", new Date("2026-11-09T15:59:59Z")), false); // 23:59:59 local
  assert.equal(isOverdue(task, "Asia/Kuala_Lumpur", new Date("2026-11-09T16:00:00Z")), true); // 00:00 next day
  assert.equal(isOverdue({ ...task, status: "COMPLETED" }, "Asia/Kuala_Lumpur", new Date("2026-12-01T00:00:00Z")), false);
});

test("Cyprus overdue boundary across DST", () => {
  const task = { status: "NOT_STARTED", dueDate: "2026-10-25" };
  // 2026-10-25 22:00Z = 2026-10-26 00:00 EET (UTC+2 after DST end)
  assert.equal(isOverdue(task, "Asia/Nicosia", new Date("2026-10-25T21:59:00Z")), false);
  assert.equal(isOverdue(task, "Asia/Nicosia", new Date("2026-10-25T22:00:00Z")), true);
});
