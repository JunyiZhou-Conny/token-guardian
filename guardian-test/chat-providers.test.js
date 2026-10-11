"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createChat } = require("../guardian-server/chat");
const { createStore } = require("../guardian-server/store");
const { parseEventJson, summarize, explain } = require("../guardian-server/engine");

const CLOCK = Date.parse("2026-10-11T12:00:00Z");
const KEYS = { OPENAI_API_KEY: "test-openai-placeholder", DEEPSEEK_API_KEY: "test-deepseek-placeholder" };
const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

async function setup(t) {
  const trackerHome = await fs.mkdtemp(path.join(os.tmpdir(), "guardian-providers-"));
  t.after(() => fs.rm(trackerHome, { recursive: true, force: true }));
  const store = createStore({ trackerHome, now: () => CLOCK });
  const events = parseEventJson([{ id: "provider-evidence", source: "codex", timestamp: new Date(CLOCK).toISOString(), model: "gpt-5", inputTokens: 500, outputTokens: 100, sessionId: "raw-session", costUsd: 0.2, costType: "estimated", prompt: "PRIVATE_ORIGINAL_PROMPT" }]);
  const snapshot = { mode: "local", events, incidents: [], summary: summarize(events), coverage: { notes: ["Some usage costs are unknown."], warnings: [] } };
  return { trackerHome, store, snapshot, budgetPath: path.join(store.guardianDir, "chat-budget.json") };
}
function reply(answer = "A bounded answer.") { return { ok: true, json: async () => ({ output_text: answer, choices: [{ message: { content: answer } }] }) }; }
function mockRequests() {
  const requests = [];
  const fetchImpl = async (url, options) => { requests.push({ url, options, body: JSON.parse(options.body) }); return reply(); };
  return { requests, fetchImpl };
}

test("configuration selects available providers without returning credentials", async t => {
  const { store } = await setup(t);
  for (const [env, provider, model, configured] of [
    [{}, "local", null, false],
    [{ OPENAI_API_KEY: KEYS.OPENAI_API_KEY }, "openai", "gpt-4.1-mini", true],
    [{ DEEPSEEK_API_KEY: KEYS.DEEPSEEK_API_KEY }, "deepseek", "deepseek-chat", true],
    [KEYS, "openai", "gpt-4.1-mini", true],
    [{ ...KEYS, TOKENTRACKER_GUARDIAN_CHAT_PROVIDER: "deepseek" }, "deepseek", "deepseek-chat", true],
    [{ ...KEYS, TOKENTRACKER_GUARDIAN_CHAT_PROVIDER: "local" }, "local", null, false],
    [{ ...KEYS, TOKENTRACKER_GUARDIAN_CHAT_PROVIDER: "unrecognized" }, "local", null, false],
  ]) {
    const config = createChat({ store, env }).configuration();
    assert.equal(config.provider, provider);
    assert.equal(config.model, model);
    assert.equal(config.configured, configured);
    assert.deepEqual(config.availableProviders.map(p => p.id), ["local", "openai", "deepseek"]);
    assert.equal(config.availableProviders[0].configured, true);
    assert.equal(JSON.stringify(config).includes(KEYS.OPENAI_API_KEY), false);
    assert.equal(JSON.stringify(config).includes(KEYS.DEEPSEEK_API_KEY), false);
  }
});

test("provider-specific models do not apply the default provider's model to another API", async t => {
  const { store, snapshot } = await setup(t);
  const { requests, fetchImpl } = mockRequests();
  const chat = createChat({ store, env: { ...KEYS, TOKENTRACKER_GUARDIAN_CHAT_MODEL: "gpt-custom", TOKENTRACKER_GUARDIAN_CHAT_DEEPSEEK_MODEL: "deepseek-reasoner" }, fetchImpl, now: () => CLOCK });
  assert.equal(chat.configuration().model, "gpt-custom");
  await chat.chat("Compare tools", snapshot);
  await chat.chat("Compare tools", snapshot, { provider: "deepseek" });
  assert.equal(requests[0].body.model, "gpt-custom");
  assert.equal(requests[1].body.model, "deepseek-reasoner");
  const defaults = createChat({ store, env: { ...KEYS, TOKENTRACKER_GUARDIAN_CHAT_MODEL: "gpt-custom" } }).configuration();
  assert.equal(defaults.availableProviders.find(p => p.id === "deepseek").model, "deepseek-chat");
});

test("DeepSeek uses only the official chat completions endpoint and extracts final content", async t => {
  const { store, snapshot } = await setup(t);
  const { requests, fetchImpl } = mockRequests();
  const chat = createChat({ store, env: { DEEPSEEK_API_KEY: KEYS.DEEPSEEK_API_KEY, OPENAI_BASE_URL: "https://untrusted.example", TOKENTRACKER_GUARDIAN_CHAT_URL: "https://untrusted.example" }, fetchImpl, now: () => CLOCK });
  const result = await chat.chat("Where did usage come from?", snapshot);
  assert.equal(result.mode, "deepseek");
  assert.equal(result.provider, "deepseek");
  assert.equal(result.model, "deepseek-chat");
  assert.equal(result.llmStatus, "answered");
  assert.equal(result.answer, "A bounded answer.");
  assert.equal(requests.length, 1);
  const { url, options, body } = requests[0];
  assert.equal(url, DEEPSEEK_URL);
  assert.equal(options.redirect, "error");
  assert.equal(options.headers.Authorization, `Bearer ${KEYS.DEEPSEEK_API_KEY}`);
  assert.equal(body.max_tokens, 350);
  assert.equal(body.stream, false);
  assert.deepEqual(body.messages.map(m => m.role), ["system", "user"]);
  assert.equal(body.store, undefined);
  assert.equal(body.max_output_tokens, undefined);
  const payload = JSON.parse(body.messages[1].content);
  assert.equal(payload.question, "Where did usage come from?");
  assert.equal(payload.evidence.events[0].sessionId, undefined);
  assert.equal(JSON.stringify(payload.evidence).includes("raw-session"), false);
  assert.deepEqual(result.evidenceIds, explain("Where did usage come from?", snapshot).evidenceIds);
  assert.equal(JSON.stringify(body).includes("PRIVATE_ORIGINAL_PROMPT"), false);
  assert.equal(JSON.stringify(body).includes(KEYS.DEEPSEEK_API_KEY), false);
});

test("OpenAI preserves Responses storage opt-out and nested answer extraction", async t => {
  const { store, snapshot } = await setup(t);
  let request;
  const chat = createChat({ store, env: KEYS, now: () => CLOCK, fetchImpl: async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ output: [{ content: [{ type: "reasoning", text: "not an answer" }, { type: "output_text", text: "First." }] }, { content: [{ type: "output_text", text: "Second." }] }] }) };
  } });
  const result = await chat.chat("Compare tools", snapshot, { provider: "openai" });
  assert.equal(result.mode, "openai");
  assert.equal(result.answer, "First.\nSecond.");
  assert.equal(request.url, OPENAI_URL);
  assert.equal(request.body.store, false);
  assert.equal(request.body.max_output_tokens, 350);
  assert.equal(request.body.model, "gpt-4.1-mini");
  assert.equal(request.body.messages, undefined);
  assert.match(request.body.instructions, /never promise unmeasured savings/i);
});

test("local selections, missing keys, invalid settings and demos never spend a remote allowance", async t => {
  const { store, snapshot, budgetPath } = await setup(t);
  let calls = 0;
  const fetchImpl = async () => { calls++; return reply(); };
  const cases = [
    [{}, {}, snapshot, "not-configured"],
    [KEYS, { provider: "local" }, snapshot, "local-selected"],
    [KEYS, { useOpenAI: false }, snapshot, "local-selected"],
    [{ OPENAI_API_KEY: KEYS.OPENAI_API_KEY }, { provider: "deepseek" }, snapshot, "not-configured"],
    [KEYS, { provider: "unrecognized" }, snapshot, "invalid-provider"],
    [{ ...KEYS, TOKENTRACKER_GUARDIAN_CHAT_PROVIDER: "unrecognized" }, {}, snapshot, "invalid-provider"],
    [KEYS, { provider: "openai" }, { ...snapshot, mode: "demo" }, "simulation-local"],
    [KEYS, { provider: "deepseek" }, { ...snapshot, mode: "demo" }, "simulation-local"],
  ];
  for (const [env, options, data, status] of cases) {
    const result = await createChat({ store, env, fetchImpl, now: () => CLOCK }).chat("Compare tools", data, options);
    assert.equal(result.mode, "local");
    assert.equal(result.provider, "local");
    assert.equal(result.llmStatus, status);
  }
  assert.equal(calls, 0);
  await assert.rejects(fs.readFile(budgetPath), { code: "ENOENT" });
});

test("remote errors and missing final answers are explicit local fallbacks and retain reservations", async t => {
  const { store, snapshot, budgetPath } = await setup(t);
  for (const [provider, response, status] of [
    ["deepseek", { ok: false, status: 429 }, "provider-error"],
    ["openai", { ok: false, status: 401 }, "provider-error"],
    ["deepseek", { ok: true, json: async () => ({ choices: [{ message: { reasoning_content: "hidden reasoning only", content: " " } }] }) }, "empty-response"],
    ["openai", { ok: true, json: async () => ({ output_text: {}, output: {} }) }, "empty-response"],
    ["deepseek", { ok: true, json: async () => { throw new Error("invalid JSON"); } }, "unavailable"],
  ]) {
    const result = await createChat({ store, env: KEYS, now: () => CLOCK, fetchImpl: async () => response }).chat("Compare tools", snapshot, { provider });
    assert.equal(result.mode, "local");
    assert.equal(result.llmStatus, status);
    assert.ok(result.notice);
    assert.equal(result.answer.includes("hidden reasoning only"), false);
  }
  const failed = await createChat({ store, env: KEYS, now: () => CLOCK, fetchImpl: async () => { throw new Error("mock timeout"); } }).chat("Compare tools", snapshot, { provider: "deepseek" });
  assert.equal(failed.llmStatus, "unavailable");
  assert.equal(JSON.parse(await fs.readFile(budgetPath, "utf8")).calls, 6);
});

test("one persistent shared call budget covers provider switches and new chat instances", async t => {
  const { store, snapshot, budgetPath } = await setup(t);
  const { requests, fetchImpl } = mockRequests();
  const env = { ...KEYS, TOKENTRACKER_GUARDIAN_CHAT_DAILY_CALLS: "1" };
  const openai = createChat({ store, env, fetchImpl, now: () => CLOCK });
  assert.equal((await openai.chat("Compare tools", snapshot)).mode, "openai");
  const deepseek = createChat({ store, env, fetchImpl, now: () => CLOCK });
  assert.equal((await deepseek.chat("Compare tools", snapshot, { provider: "deepseek" })).llmStatus, "daily-budget-reached");
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(await fs.readFile(budgetPath, "utf8")), { day: "2026-10-11", calls: 1, reservedOutputTokens: 350 });
});

test("simultaneous different provider instances cannot both spend the final allowance", async t => {
  const { store, snapshot } = await setup(t);
  let calls = 0;
  const options = { store, env: { ...KEYS, TOKENTRACKER_GUARDIAN_CHAT_DAILY_CALLS: "1" }, now: () => CLOCK, fetchImpl: async () => { calls++; return reply(); } };
  const results = await Promise.all([
    createChat(options).chat("Compare tools", snapshot, { provider: "openai" }),
    createChat(options).chat("Compare tools", snapshot, { provider: "deepseek" }),
  ]);
  assert.equal(calls, 1);
  assert.equal(results.filter(r => r.mode !== "local").length, 1);
  assert.equal(results.filter(r => r.mode === "local").length, 1);
});

test("output reservations are shared and roll over only with a new UTC day", async t => {
  const { store, snapshot, budgetPath } = await setup(t);
  const { requests, fetchImpl } = mockRequests();
  let clock = CLOCK;
  const chat = createChat({ store, env: { ...KEYS, TOKENTRACKER_GUARDIAN_CHAT_OUTPUT_TOKENS: "200", TOKENTRACKER_GUARDIAN_CHAT_DAILY_OUTPUT_TOKENS: "350" }, fetchImpl, now: () => clock });
  assert.equal((await chat.chat("Compare tools", snapshot)).mode, "openai");
  assert.equal((await chat.chat("Compare tools", snapshot, { provider: "deepseek" })).llmStatus, "daily-budget-reached");
  clock += 86_400_000;
  assert.equal((await chat.chat("Compare tools", snapshot, { provider: "deepseek" })).mode, "deepseek");
  assert.equal(requests.length, 2);
  assert.deepEqual(JSON.parse(await fs.readFile(budgetPath, "utf8")), { day: "2026-10-12", calls: 1, reservedOutputTokens: 200 });
});

test("separate processes share the last allowance across OpenAI and DeepSeek", async t => {
  const { store, budgetPath } = await setup(t);
  const program = `
    const { createChat } = require(process.argv[1]);
    const { summarize } = require(require('node:path').join(require('node:path').dirname(process.argv[1]), 'engine.js'));
    const events = [{ id: 'event-child', source: 'codex', timestamp: '2026-10-11T12:00:00Z', model: 'gpt-5', totalTokens: 100, inputTokens: 100, outputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, costUsd: null, costType: 'unknown', billingKind: 'unknown', grain: 'event' }];
    const snapshot = { mode: 'local', events, incidents: [], summary: summarize(events), coverage: { notes: [], warnings: [] } };
    let calls = 0;
    const chat = createChat({ store: { guardianDir: process.argv[2] }, env: { OPENAI_API_KEY: 'test-openai-placeholder', DEEPSEEK_API_KEY: 'test-deepseek-placeholder', TOKENTRACKER_GUARDIAN_CHAT_DAILY_CALLS: '1' }, now: () => Date.parse('2026-10-11T12:00:00Z'), fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ output_text: 'Mock.', choices: [{ message: { content: 'Mock.' } }] }) }; } });
    chat.chat('Compare tools', snapshot, { provider: process.argv[3] }).then(result => process.stdout.write(JSON.stringify({ mode: result.mode, llmStatus: result.llmStatus, calls }))).catch(() => { process.exitCode = 1; });
  `;
  const run = provider => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", program, path.resolve(__dirname, "../guardian-server/chat.js"), store.guardianDir, provider], { env: {}, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", errors = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { errors += chunk; });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) return reject(new Error(`Mock provider child failed (${code}): ${errors}`));
      if (!output) return resolve({ executionUnavailable: true });
      try { resolve(JSON.parse(output)); } catch (error) { reject(error); }
    });
  });
  const results = await Promise.all([run("openai"), run("deepseek")]);
  if (results.some(result => result.executionUnavailable)) {
    t.skip("Execution environment suppresses spawned Node output; shared-instance and lock checks still run.");
    return;
  }
  assert.equal(results.reduce((sum, result) => sum + result.calls, 0), 1);
  assert.equal(results.filter(result => result.mode !== "local").length, 1);
  assert.equal(JSON.parse(await fs.readFile(budgetPath, "utf8")).calls, 1);
});

test("corrupt prior-day budgets and orphaned locks fail closed without provider calls", async t => {
  const { store, snapshot, budgetPath } = await setup(t);
  await fs.mkdir(store.guardianDir, { recursive: true });
  let calls = 0;
  const chat = createChat({ store, env: KEYS, now: () => CLOCK, fetchImpl: async () => { calls++; return reply(); } });
  await fs.writeFile(budgetPath, JSON.stringify({ day: "2026-10-10", calls: "invalid", reservedOutputTokens: 0 }));
  assert.equal((await chat.chat("Compare tools", snapshot, { provider: "deepseek" })).llmStatus, "budget-unavailable");
  await fs.unlink(budgetPath);
  await fs.writeFile(path.join(store.guardianDir, "chat-budget.lock"), "orphaned");
  assert.equal((await chat.chat("Compare tools", snapshot)).llmStatus, "budget-unavailable");
  assert.equal(calls, 0);
});

test("session evidence is bounded, preserves uncertainty and omits local sidecar identity and prose", async t => {
  const { store, snapshot } = await setup(t);
  const { requests, fetchImpl } = mockRequests();
  const sidecarId = "sidecar-" + "a".repeat(24);
  const sessionId = "session-" + "b".repeat(24);
  const recommendation = { id: "check-context", type: "context-review", title: "PRIVATE_SIDECAR_TITLE", detail: "PRIVATE_SIDECAR_DETAIL", confidence: "inferred", action: "investigate", automated: false, savingsUsd: null, evidenceIds: [snapshot.events[0].id, sidecarId, "invented-reference"] };
  const row = { id: sessionId, source: "codex", sessionId: "PRIVATE_SIDECAR_SESSION", sessionHash: "PRIVATE_SIDECAR_HASH", title: "PRIVATE_SIDECAR_TITLE", project: "PRIVATE_SIDECAR_PATH", totalTokens: 5000, inputTokens: 4900, outputTokens: 100, cachedTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, model: "gpt-5", models: [{ model: "gpt-5", totalTokens: 5000, costUsd: null, costType: "unknown", prompt: "PRIVATE_MODEL_PROMPT" }], basis: "session-sidecar", attribution: "observed", costIsPartial: true, requestCount: null, evidenceIds: [sidecarId, snapshot.events[0].id, "invented-reference"], eventIds: [snapshot.events[0].id], recommendations: [recommendation], coverage: { scope: "session-sidecar" }, period: { start: "2026-10-11T10:00:00Z", end: "2026-10-11T12:00:00Z" } };
  snapshot.sessionInsights = { rankedSessions: Array.from({ length: 20 }, (_, i) => ({ ...row, id: "session-" + i.toString(16).padStart(24, "0") })), recommendations: [recommendation], period: row.period, coverage: { scope: "partial" }, prompt: "PRIVATE_INSIGHTS_PROMPT" };
  snapshot.events[0].prompt = "PRIVATE_EVENT_PROMPT";
  snapshot.events[0].project = "PRIVATE_RAW_PROJECT_PATH";
  snapshot.events[0].requestId = "PRIVATE_RAW_REQUEST_ID";
  const result = await createChat({ store, env: KEYS, fetchImpl, now: () => CLOCK }).chat("Compare tools", snapshot);
  assert.equal(result.mode, "openai");
  const evidence = JSON.parse(requests[0].body.input).evidence;
  assert.equal(evidence.sessionInsights.rankedSessions.length, 6);
  assert.equal(evidence.limits.partialEvidence, true);
  const ranked = evidence.sessionInsights.rankedSessions[0];
  assert.equal(ranked.basis, "session-sidecar");
  assert.equal(ranked.costIsPartial, true);
  assert.equal(ranked.requestCount, null);
  assert.equal(ranked.models[0].costUsd, null);
  assert.equal(ranked.sessionId, undefined);
  assert.equal(ranked.project, undefined);
  assert.deepEqual(ranked.evidenceIds, [sidecarId, snapshot.events[0].id]);
  assert.equal(JSON.stringify(evidence).includes("PRIVATE_"), false);
  assert.equal(JSON.stringify(evidence).includes("invented-reference"), false);
  assert.ok(Buffer.byteLength(requests[0].body.input, "utf8") <= 24_000);
  const local = explain("Compare tools", snapshot);
  for (const name of ["evidenceIds", "recommendations", "sessionIds", "focusId"]) assert.deepEqual(result[name], local[name]);
});

test("questions and generated answers are bounded without sending original metadata bodies", async t => {
  const { store, snapshot } = await setup(t);
  let input;
  const chat = createChat({ store, env: KEYS, now: () => CLOCK, fetchImpl: async (url, options) => { input = JSON.parse(JSON.parse(options.body).input); return reply("x".repeat(8000)); } });
  const result = await chat.chat("q".repeat(4000), snapshot);
  assert.equal(input.question.length, 3000);
  assert.equal(result.answer.length, 6000);
  assert.equal(input.evidence.events[0].prompt, undefined);
});
