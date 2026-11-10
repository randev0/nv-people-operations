import { test } from "node:test";
import assert from "node:assert/strict";
import { explanationWithoutPerson } from "../../src/server/ai/redact";

const text = "Pending laptop handover blocks onboarding. Recommend IT candidate Ethan Raj in Malaysia, matching the requester's country. Requires human review.";

test("sentences naming the suggested person are dropped", () => {
  assert.equal(explanationWithoutPerson(text, "Ethan Raj"), "Pending laptop handover blocks onboarding. Requires human review.");
});

test("a first-name-only mention is dropped too", () => {
  assert.equal(explanationWithoutPerson("Printer fault. Ethan handles printers in KL.", "Ethan Raj"), "Printer fault.");
});

test("explanations without the name are unchanged; no name means no change", () => {
  const plain = "Recommend a Malaysia-based IT candidate for human review.";
  assert.equal(explanationWithoutPerson(plain, "Ethan Raj"), plain);
  assert.equal(explanationWithoutPerson(text, null), text);
});

test("names are matched as words, not inside other words", () => {
  assert.equal(explanationWithoutPerson("Ann Lee. Annual leave query.", "Ann Lee"), "Annual leave query.");
});
