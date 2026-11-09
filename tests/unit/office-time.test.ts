import { test } from "node:test";
import assert from "node:assert/strict";
import { OFFICES, clockTime, isOfficeOpen, officeFor, partOfDay, utcOffsetLabel, utcOffsetMinutes } from "../../src/lib/office-time";

test("office clocks use IANA zones; Nicosia follows EU daylight saving", () => {
  const winter = new Date("2026-11-09T11:27:00Z");
  const summer = new Date("2026-07-15T11:27:00Z");
  assert.equal(clockTime("Asia/Kuala_Lumpur", winter), "19:27");
  assert.equal(clockTime("Asia/Dhaka", winter), "17:27");
  assert.equal(clockTime("Asia/Colombo", winter), "16:57");
  assert.equal(clockTime("Asia/Nicosia", winter), "13:27"); // EET, UTC+2
  assert.equal(clockTime("Asia/Nicosia", summer), "14:27"); // EEST, UTC+3
  assert.equal(utcOffsetLabel("Asia/Colombo", winter), "UTC+5:30");
  assert.equal(utcOffsetMinutes("Asia/Nicosia", winter), 120);
  assert.equal(utcOffsetMinutes("Asia/Nicosia", summer), 180);
  // DST switch: last Sunday of March 2026 is 29 March, 01:00 UTC.
  assert.equal(utcOffsetMinutes("Asia/Nicosia", new Date("2026-03-29T00:59:00Z")), 120);
  assert.equal(utcOffsetMinutes("Asia/Nicosia", new Date("2026-03-29T01:00:00Z")), 180);
});

test("office hours respect each office's weekend (Dhaka rests Friday–Saturday)", () => {
  const friday10DhakaAndKL = new Date("2026-11-13T04:00:00Z"); // Fri 10:00 Dhaka, Fri 12:00 KL
  assert.equal(isOfficeOpen(officeFor("BD"), friday10DhakaAndKL), false);
  assert.equal(isOfficeOpen(officeFor("MY"), friday10DhakaAndKL), true);
  const sunday10Dhaka = new Date("2026-11-15T04:00:00Z");
  assert.equal(isOfficeOpen(officeFor("BD"), sunday10Dhaka), true);
  assert.equal(isOfficeOpen(officeFor("CY"), sunday10Dhaka), false);
  const monday1759Nicosia = new Date("2026-11-09T15:59:00Z");
  assert.equal(isOfficeOpen(officeFor("CY"), monday1759Nicosia), true);
  assert.equal(isOfficeOpen(officeFor("CY"), new Date("2026-11-09T16:00:00Z")), false);
});

test("greeting follows the viewer's office time", () => {
  assert.equal(partOfDay("Asia/Kuala_Lumpur", new Date("2026-11-09T01:00:00Z")), "Good morning"); // 09:00
  assert.equal(partOfDay("Asia/Kuala_Lumpur", new Date("2026-11-09T06:00:00Z")), "Good afternoon"); // 14:00
  assert.equal(partOfDay("Asia/Kuala_Lumpur", new Date("2026-11-09T11:00:00Z")), "Good evening"); // 19:00
  assert.equal(OFFICES.length, 4);
});
