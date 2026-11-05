"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { toIso, makeWindow, planLabel, clampPercent } = require("../src/limits");

test("toIso accepts ISO strings, epoch seconds and epoch milliseconds", () => {
  assert.equal(toIso("2026-10-31T14:00:00+00:00"), "2026-10-31T14:00:00.000Z");
  assert.equal(toIso(1793458800), "2026-10-31T15:00:00.000Z");
  assert.equal(toIso(1793458800000), "2026-10-31T15:00:00.000Z");
  assert.equal(toIso("1793458800"), "2026-10-31T15:00:00.000Z");
  assert.equal(toIso(null), null);
  assert.equal(toIso("not a date"), null);
  assert.equal(toIso(0), null);
});

test("makeWindow clamps percentages and keeps unknown percentages out", () => {
  assert.deepEqual(makeWindow({ label: "5-hour", usedPercent: 120, resetsAt: null }), {
    label: "5-hour", usedPercent: 100, remainingPercent: 0, resetsAt: null,
  });
  assert.equal(makeWindow({ label: "5-hour", usedPercent: null }), null);
  assert.equal(makeWindow({ label: "5-hour", usedPercent: "n/a" }), null);
  assert.equal(clampPercent(-3), 0);
});

test("planLabel turns raw plan ids into short labels and rejects identifiers", () => {
  assert.equal(planLabel("claude_max"), "Max");
  assert.equal(planLabel("chatgpt-plus"), "Plus");
  assert.equal(planLabel(undefined, "pro"), "Pro");
  assert.equal(planLabel("someone@example.com"), null);
  assert.equal(planLabel(""), null);
});
