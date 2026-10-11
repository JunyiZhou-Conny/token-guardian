"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { parseEventJson, latestTrackerBuckets, summarize, normalizeSessionSnapshot, buildSessionInsights, detectIncidents, explain } = require("../guardian-server/engine");
const { safeSessions, createStore } = require("../guardian-server/store");

const START = "2026-10-11T10:00:00.000Z";
const END = "2026-10-11T12:00:00.000Z";
const raw = (rows) => parseEventJson(rows.map((row) => ({ source: "codex", timestamp: START, model: "gpt-5", inputTokens: 100, ...row })));
const sidecar = (fields = {}) => ({ source: "codex", session_hash: "local-hash", session_id: "session-a", started_at: START, ended_at: END, total_tokens: 1000, ...fields });
const snapshot = (events, sessions = []) => {
  const incidents = detectIncidents(events);
  return { mode: "local", events, incidents, summary: summarize(events), sessionInsights: buildSessionInsights(events, safeSessions(sessions), incidents) };
};

test("account buckets, projects and automation IDs cannot invent a session attribution", () => {
  const buckets = latestTrackerBuckets([{ source: "cursor", model: "sonnet", hour_start: START, input_tokens: 1000, total_tokens: 1000, session_id: "untrusted-bucket-session" }]).events;
  const events = [...buckets, ...raw([{ source: "cursor", inputTokens: 200, project: "/local/project", automationId: "scheduler-a" }])];
  const data = snapshot(events);
  assert.equal(data.sessionInsights.rankedSessions.length, 0);
  assert.equal(data.sessionInsights.projects[0].totalTokens, 200);
  assert.equal(data.sessionInsights.automations[0].automationId, "scheduler-a");
  assert.equal(data.sessionInsights.coverage.sessionAttributedTokens, 0);
  assert.equal(data.sessionInsights.coverage.sessionUnassignedTokens, 1200);
  assert.equal(data.sessionInsights.coverage.aggregateTokens, 1000);
  assert.equal(data.incidents.length, 0);
  const response = explain("Which session uses the most tokens?", data);
  assert.match(response.answer, /No session token total can be established/);
  assert.match(response.answer, /1,200 account tokens lack direct session attribution/);
  assert.deepEqual(response.evidenceIds, []);
  assert.equal(response.recommendations[0].type, "collect-session-metadata");
});

test("raw session ranking combines actual models, keeps reasoning as an output subset and separates cost measures", () => {
  const events = raw([
    { id: "a1", sessionId: "session-a", inputTokens: 100, outputTokens: 40, reasoningTokens: 20, cachedTokens: 30, costUsd: 0.2, costType: "estimated" },
    { id: "a2", sessionId: "session-a", model: "gpt-5-mini", timestamp: END, inputTokens: 300, outputTokens: 20, cacheWriteTokens: 10, costUsd: 0.5, billingKind: "included" },
    { id: "b1", sessionId: "session-b", inputTokens: 400, costUsd: 0.3, billingKind: "on-demand" },
    { id: "unassigned", inputTokens: 25 },
  ]);
  const data = snapshot(events);
  const [first] = data.sessionInsights.rankedSessions;
  assert.equal(first.sessionId, "session-a");
  assert.equal(first.totalTokens, 500);
  assert.equal(first.reasoningTokens, 20);
  assert.equal(first.model, "mixed");
  assert.equal(first.models.length, 2);
  assert.equal(first.requestCount, 2);
  assert.equal(first.reportedCostUsd, 0.5);
  assert.equal(first.estimatedCostUsd, 0.2);
  assert.equal(first.includedCostUsd, 0.5);
  assert.equal(first.knownChargedCostUsd, 0);
  assert.equal(data.sessionInsights.coverage.sessionAttributedTokens, 900);
  assert.equal(data.sessionInsights.coverage.sessionUnassignedTokens, 25);
  assert.equal(data.summary.totalTokens, 925);
  assert.match(first.id, /^session-[a-f0-9]{24}$/);
  assert.equal(first.id.includes("session-a"), false);
  const response = explain("Which session uses the most tokens?", data);
  assert.match(response.answer, /session-a; it used 500 tokens/);
  assert.match(response.answer, /not necessarily an extra charge/);
  assert.match(response.answer, /not a provider bill/);
  assert.match(response.answer, /25 account tokens remain unassigned/);
  assert.equal(response.focusId, first.id);
  assert.deepEqual(response.evidenceIds, first.eventIds);
});

test("latest whole-session revisions replace previous rows and native references sharing an actual ID", () => {
  const warnings = [];
  const sessions = safeSessions([
    sidecar({ total_tokens: 1000 }),
    sidecar({ total_tokens: 1400, cost_usd: 0.4 }),
    sidecar({ session_hash: "wsl-local-hash", total_tokens: 1600, cost_usd: 0.5 }),
    sidecar({ source: "claude", total_tokens: 700 }),
    sidecar({ source: "gemini", session_hash: "invalid-hash", session_id: "invalid", total_tokens: 100 }),
    sidecar({ source: "gemini", session_hash: "invalid-hash", session_id: "invalid", total_tokens: -1 }),
    { source: "grok", session_hash: "unsupported", total_tokens: 99999 },
  ], warnings);
  assert.equal(sessions.length, 2);
  assert.equal(sessions.find((entry) => entry.source === "codex").totalTokens, 1600);
  assert.equal(sessions.find((entry) => entry.source === "codex").id, "wsl-local-hash");
  assert.match(sessions[0].insightId, /^session-[a-f0-9]{24}$/);
  assert.match(warnings.join(" "), /1 latest local session snapshots/);
  assert.equal(sessions.some((entry) => entry.sessionId === "invalid"), false);
});

test("authoritative session totals retain sparse model breakdown, partial cost and output reasoning semantics", () => {
  const entry = normalizeSessionSnapshot(sidecar({
    total_tokens: 320,
    tokens: { input_tokens: 200, cached_input_tokens: 50, cache_creation_input_tokens: 10, output_tokens: 60, reasoning_output_tokens: 20, total_tokens: 320 },
    model_usage: [
      { model: "gpt-5", input_tokens: 100, cached_input_tokens: 50, output_tokens: 40, reasoning_output_tokens: 20 },
      { model: "gpt-5-mini", input_tokens: 100, cache_creation_input_tokens: 10, output_tokens: 20 },
    ],
    cost_usd: 0.18, cost_source: "mixed", cost_is_partial: true, prompt: "PRIVATE PROMPT", messages: ["PRIVATE MESSAGE"],
  }));
  assert.equal(entry.totalTokens, 320);
  assert.equal(entry.models.reduce((sum, model) => sum + model.totalTokens, 0), 320);
  assert.equal(entry.reasoningTokens, 20);
  assert.equal(entry.models.every((model) => model.costUsd === null), true);
  assert.equal(entry.estimatedCostUsd, 0.18);
  assert.equal(entry.reportedCostUsd, 0);
  assert.equal(entry.costIsPartial, true);
  assert.equal(entry.unknownCostEvents, 1);
  assert.equal(entry.requestCount, null);
  assert.equal(JSON.stringify(entry).includes("PRIVATE"), false);
  assert.match(entry.coverage.notes.join(" "), /known lower bound/);
  const reportedZero = normalizeSessionSnapshot(sidecar({ cost_source: "provider_reported", provider_cost_usd: 0, cost_usd: 9 }));
  assert.equal(reportedZero.costUsd, 0);
  assert.equal(reportedZero.costType, "reported");
  assert.equal(reportedZero.unknownCostEvents, 0);
});

test("overlapping raw requests and a wider session snapshot choose one basis without changing account totals", () => {
  const events = raw([{ sessionId: "session-a", inputTokens: 100 }, { sessionId: "session-a", timestamp: END, inputTokens: 200 }]);
  const data = snapshot(events, [sidecar({ total_tokens: 1200, model_usage: [{ model: "gpt-5", input_tokens: 1200 }] })]);
  const [entry] = data.sessionInsights.rankedSessions;
  assert.equal(entry.basis, "session-sidecar");
  assert.equal(entry.totalTokens, 1200);
  assert.equal(entry.rawObservedTokens, 300);
  assert.equal(entry.eventIds.length, 2);
  assert.equal(entry.evidenceIds.length, 3);
  assert.equal(data.sessionInsights.rawSessions[0].totalTokens, 300);
  assert.equal(data.sessionInsights.sidecarSessions[0].totalTokens, 1200);
  assert.equal(data.summary.totalTokens, 300);
  assert.equal(data.sessionInsights.coverage.sessionAttributedTokens, 300);
  assert.match(explain("Explain session session-a", data).answer, /separate view and are not added to account usage/);
});

test("a stale, narrow or smaller sidecar never overwrites directly observed session requests", () => {
  const events = raw([{ sessionId: "session-a", inputTokens: 100 }, { sessionId: "session-a", timestamp: END, inputTokens: 200 }]);
  for (const partial of [
    { total_tokens: 200 },
    { total_tokens: 1200, ended_at: START },
    { total_tokens: 1200, started_at: null, ended_at: null },
  ]) {
    const data = snapshot(events, [sidecar({ title: "Local metadata title", project_ref: "/local/session-project", ...partial })]);
    assert.equal(data.sessionInsights.rankedSessions.length, 1);
    const entry = data.sessionInsights.rankedSessions[0];
    assert.equal(entry.basis, "raw-events");
    assert.equal(entry.totalTokens, 300);
    assert.equal(entry.title, "Local metadata title");
    assert.equal(entry.project, "/local/session-project");
    assert.match(entry.coverage.notes.join(" "), /stale/);
    assert.equal(data.summary.totalTokens, 300);
  }
});

test("metadata-only sessions stay unknown, while true recorded zero and actual local hashes remain usable", () => {
  const metadata = normalizeSessionSnapshot({ source: "claude", session_hash: "observed-hash", total_tokens: null, title: "Metadata only", tokens: { total_tokens: null } });
  assert.equal(metadata.totalTokens, null);
  assert.equal(metadata.usageAvailable, false);
  assert.equal(metadata.sessionId, null);
  assert.equal(normalizeSessionSnapshot(sidecar({ total_tokens: 0 })).totalTokens, 0);
  const data = snapshot([], [{ source: "claude", session_hash: "observed-hash", title: "Metadata only" }]);
  const response = explain("Explain session observed-hash", data);
  assert.match(response.answer, /has no available token total/);
  assert.match(response.answer, /local session hash observed-hash/);
  assert.equal(response.sessionIds.length, 0);
  assert.equal(response.evidenceIds.length, 1);
  assert.match(explain("Which session uses most tokens?", data).answer, /No session token total can be established/);
});

test("exact session selection never substitutes an unrelated largest session and app collisions remain explicit", () => {
  const data = snapshot(raw([
    { sessionId: "large", inputTokens: 1000 },
    { sessionId: "small", inputTokens: 20 },
    { source: "claude", sessionId: "small", inputTokens: 30 },
  ]));
  const unknown = explain("Explain session missing-id", data);
  assert.match(unknown.answer, /No observed local session matches 'missing-id'/);
  assert.deepEqual(unknown.evidenceIds, []);
  assert.equal(unknown.focusId, null);
  assert.match(explain("Explain session small", data).answer, /appears in multiple apps/);
  const codex = explain("Explain codex session small", data);
  assert.match(codex.answer, /codex session small; it used 20 tokens/);
  assert.deepEqual(codex.sessionIds, ["small"]);
  assert.equal(codex.evidenceIds.length, 1);
  assert.match(explain("Explain gemini session small", data).answer, /different app/);
  const focus = data.sessionInsights.rankedSessions.find((entry) => entry.sessionId === "small" && entry.source === "codex").id;
  assert.equal(explain("What should I investigate?", data, { focusId: focus }).focusId, focus);
  assert.match(explain("Which session uses most tokens?", data, { focusId: "unknown-focus" }).answer, /unavailable in the current dataset/);
  assert.match(explain("Tell me about session usage", data).answer, /session large/);
});

test("recurrence recommendations cite request evidence and remain user investigations with no savings claim", () => {
  const events = raw(Array.from({ length: 6 }, (_, index) => ({ source: "cursor", sessionId: "scheduled-session", automationId: "scheduler-a", timestamp: new Date(Date.parse(START) + index * 600_000).toISOString(), inputTokens: 6000, costUsd: 0.02, billingKind: "included" })));
  const data = snapshot(events);
  const entry = data.sessionInsights.rankedSessions[0];
  const types = entry.recommendations.map((recommendation) => recommendation.type);
  assert.ok(types.includes("inspect-scheduler"));
  assert.ok(types.includes("review-context"));
  assert.ok(types.includes("compare-model"));
  for (const recommendation of entry.recommendations) {
    assert.equal(recommendation.action, "investigate");
    assert.equal(recommendation.automated, false);
    assert.equal(recommendation.savingsUsd, null);
    assert.equal(recommendation.evidenceIds.every((id) => entry.evidenceIds.includes(id)), true);
  }
  assert.match(entry.recommendations.find((recommendation) => recommendation.type === "review-context").detail, /do not prove/);
  assert.match(explain("Explain session scheduled-session", data).answer, /verify whether it is intended/);
  const automationFocus = data.sessionInsights.automations[0].id;
  assert.match(explain("Explain this pattern", data, { focusId: automationFocus }).answer, /automation scheduler-a/);
  assert.match(explain("Pause this session", data, { focusId: entry.id }).answer, /cannot stop/);
});

test("sidecar-only real usage stays local and does not add session totals to account usage", async (t) => {
  const trackerHome = await fs.mkdtemp(path.join(os.tmpdir(), "guardian-sessions-"));
  t.after(() => fs.rm(trackerHome, { recursive: true, force: true }));
  await fs.mkdir(path.join(trackerHome, "tracker"));
  await fs.writeFile(path.join(trackerHome, "tracker", "session.queue.jsonl"), [sidecar({ total_tokens: 500 }), sidecar({ total_tokens: 700 })].map((row) => JSON.stringify(row)).join("\n") + "\n");
  const data = await createStore({ trackerHome, now: () => Date.parse(END) }).snapshot();
  assert.equal(data.mode, "local");
  assert.equal(data.demoReason, null);
  assert.equal(data.summary.totalTokens, 0);
  assert.equal(data.events.length, 0);
  assert.equal(data.sessions.length, 1);
  assert.equal(data.sessionInsights.rankedSessions[0].totalTokens, 700);
  assert.equal(data.sessionInsights.coverage.sidecarSessionCount, 1);
  assert.equal(data.sessionInsights.coverage.sessionAttributionPercent, null);
  assert.match(explain("Which session uses the most tokens?", data).answer, /700 tokens/);
});
