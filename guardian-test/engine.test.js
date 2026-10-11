"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCursorCsv, parseEventJson, latestTrackerBuckets, detectIncidents, demoEvents, summarize, explain } = require("../guardian-server/engine");
const { mergeRawDatasets, reconcileBuckets } = require("../guardian-server/store");

const HEADER = "Date,Model,Cloud Agent ID,Automation ID,Kind,Input (w/ Cache Write),Input (w/o Cache Write),Cache Read,Output Tokens,Total Tokens,Cost";
const timestamp = "2026-10-10T12:00:00.000Z";
const csv = `${HEADER}\n${timestamp},claude-sonnet-4,agent-42,automation-7,Included in Pro,0,132586,24343,2188,159117,$0.62\n`;

test("imports current Cursor IDs and zero cache-inclusive sentinel without inventing charges", () => {
  const [event] = parseCursorCsv(csv);
  assert.equal(event.inputTokens, 132586);
  assert.equal(event.cacheWriteTokens, 0);
  assert.equal(event.totalTokens, 159117);
  assert.equal(event.automationId, "automation-7");
  assert.equal(event.cloudAgentId, "agent-42");
  assert.equal(event.billingKind, "included");
  assert.equal(event.costType, "reported");
  assert.equal(event.attribution, "observed");
  const summary = summarize([event]);
  assert.equal(summary.reportedCostUsd, 0.62);
  assert.equal(summary.includedCostUsd, 0.62);
  assert.equal(summary.knownChargedCostUsd, 0);
});

test("handles CSV quoted fields and validates malformed input", () => {
  const quoted = csv.replace("Included in Pro", '"Included, in Pro"').replace("claude-sonnet-4", '"model ""special"""');
  assert.equal(parseCursorCsv(quoted)[0].model, 'model "special"');
  assert.throws(() => parseCursorCsv('Date,Model\n"2026-10-10,model'), /unclosed/);
  assert.throws(() => parseCursorCsv("Date,Model\n2026-10-10,test"), /Missing columns/);
  assert.throws(() => parseCursorCsv(csv.replace("132586", "-10")), /non-negative/);
});

test("metadata allowlist drops conversation content and stable IDs retain identical-row multiplicity", () => {
  const rows = [{ source: "codex", timestamp, model: "gpt-5", inputTokens: 100, prompt: "SECRET PROMPT", messages: ["SECRET CONTENT"], toolArguments: { secret: true }, sessionId: "thread-1" }];
  const first = parseEventJson(rows);
  assert.deepEqual(first, parseEventJson(rows));
  assert.equal(JSON.stringify(first).includes("SECRET"), false);
  const [a, b] = parseEventJson([rows[0], rows[0]]);
  assert.notEqual(a.id, b.id);
  assert.throws(() => parseEventJson([{ ...rows[0], totalTokens: 20 }]), /cannot be smaller/);
  assert.throws(() => parseEventJson([{ ...rows[0], source: "browser" }]), /Unsupported source/);
});

test("uses latest source/model/bucket snapshot and does not infer request counts", () => {
  const original = { source: "cursor", model: "sonnet", hour_start: timestamp, input_tokens: 20, total_tokens: 20, conversation_count: 8 };
  const result = latestTrackerBuckets([original, { ...original, input_tokens: 50, total_tokens: 50 }, { ...original, hour_start: "invalid" }]);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].totalTokens, 50);
  assert.equal(result.events[0].costUsd, null);
  assert.equal(summarize(result.events).requestCount, null);
  assert.equal(result.diagnostics.malformedRows, 1);
});

test("the same detector finds ten-minute simulation recurrence and rejects account buckets", () => {
  const events = demoEvents(Date.parse(timestamp));
  const recurring = detectIncidents(events).find((event) => event.type === "recurring-automation");
  assert.equal(recurring.cadenceMinutes, 10);
  assert.equal(recurring.confidence, "observed");
  assert.equal(recurring.action, "investigate");
  assert.equal(recurring.evidenceIds.length, 7);
  assert.equal(detectIncidents(events).filter((event) => event.type === "usage-spike").length, 1);
  assert.equal(detectIncidents(events.map((event) => ({ ...event, grain: "bucket" }))).length, 0);
});

test("a repeating session is inferred and cannot prove unwanted background activity", () => {
  const events = parseEventJson(Array.from({ length: 6 }, (_, index) => ({ source: "codex", model: "gpt-5", timestamp: new Date(Date.parse(timestamp) + index * 600_000).toISOString(), inputTokens: 1000, sessionId: "thread" })));
  const [incident] = detectIncidents(events);
  assert.equal(incident.confidence, "inferred");
  assert.match(incident.description, /does not prove/);
  assert.equal(detectIncidents(events.map((e, i) => ({ ...e, timestamp: new Date(Date.parse(timestamp) + [0, 2, 13, 27, 30, 62][i] * 60_000).toISOString() }))).length, 0);
});

test("request spikes use a preceding observed baseline and remain investigatory", () => {
  const events = parseEventJson(Array.from({ length: 6 }, (_, index) => ({ source: "gemini", model: "gemini-pro", timestamp: new Date(Date.parse(timestamp) + index * 80_000).toISOString(), inputTokens: index === 5 ? 150000 : 2000 })));
  const [incident] = detectIncidents(events);
  assert.equal(incident.type, "usage-spike");
  assert.equal(incident.confidence, "inferred");
  assert.match(incident.limits[0], /does not prove/);
});

test("partial raw imports retain bucket residuals without double counting or fake cadence", () => {
  const buckets = latestTrackerBuckets([{ source: "cursor", model: "claude-sonnet-4", hour_start: timestamp, input_tokens: 200000, cached_input_tokens: 24343, output_tokens: 2188, total_tokens: 226531 }]).events;
  const raw = parseCursorCsv(csv);
  const events = reconcileBuckets(buckets, raw, []);
  assert.equal(events.length, 2);
  assert.equal(summarize(events).totalTokens, 226531);
  assert.equal(events.find((event) => event.grain === "bucket").totalTokens, 67414);
  assert.equal(detectIncidents(events).length, 0);
});

test("ledger and repeated CSV copies are matched while real identical requests remain", () => {
  const two = parseCursorCsv(csv + csv.split("\n")[1] + "\n");
  const ledger = two.map((event, i) => ({ ...event, id: `provider-${i}` }));
  assert.equal(mergeRawDatasets([ledger, two]).length, 2);
});

test("partial same-timestamp CSV imports match the right request and keep IDs stable", () => {
  const second = csv.split("\n")[1].replace("132586", "150000").replace("159117", "176531");
  const full = parseCursorCsv(csv + second + "\n");
  const partial = parseCursorCsv(`${HEADER}\n${second}\n`);
  assert.equal(partial[0].id, full[1].id);
  const merged = mergeRawDatasets([full.map((event, index) => ({ ...event, id: `ledger-${index}` })), partial]);
  assert.equal(merged.length, 2);
  assert.equal(summarize(merged).totalTokens, 159117 + 176531);
  const correction = parseCursorCsv(csv.replace("$0.62", "$0.70"));
  assert.equal(correction[0].id, full[0].id);
  assert.equal(mergeRawDatasets([full, correction])[0].costUsd, 0.70);
});

test("local companion cites evidence, separates included usage value and refuses stop claims", () => {
  const events = demoEvents(Date.parse(timestamp));
  const snapshot = { mode: "demo", events, summary: summarize(events), incidents: detectIncidents(events) };
  const response = explain("Why did my tokens drain?", snapshot);
  assert.match(response.answer, /simulated example/);
  assert.match(response.answer, /not necessarily an extra charge/);
  assert.equal(response.evidenceIds.length, 7);
  assert.match(explain("Pause it now", snapshot).answer, /cannot stop/);
});
