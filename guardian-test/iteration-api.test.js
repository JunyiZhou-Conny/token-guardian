"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { createStore } = require("../guardian-server/store");
const { createGuardianServer } = require("../guardian-server/server");
const { parseEventJson } = require("../guardian-server/engine");

async function setup(t, options = {}) {
  const trackerHome = await fs.mkdtemp(path.join(os.tmpdir(), "guardian-api-"));
  const store = createStore({ trackerHome });
  const server = createGuardianServer({ store, env: {}, ...options });
  t.after(() => fs.rm(trackerHome, { recursive: true, force: true }));
  const handler = server.listeners("request")[0];
  async function request(url, { method = "GET", body = Buffer.alloc(0), headers = {} } = {}) {
    const incoming = Readable.from(body.length ? [Buffer.from(body)] : []);
    Object.assign(incoming, { method, url, socket: { localPort: 7681 }, headers: { host: "127.0.0.1:7681", ...headers } });
    let status, output;
    const response = { headersSent: false, writeHead(code) { status = code; this.headersSent = true; }, end(value) { output = String(value || ""); } };
    await handler(incoming, response);
    return { status, body: JSON.parse(output) };
  }
  return { store, request };
}
const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("HTTP health advertises provider capabilities without keys and rejects invalid model selections", async (t) => {
  let calls = 0;
  const { request } = await setup(t, { env: { OPENAI_API_KEY: "private-openai-key", DEEPSEEK_API_KEY: "private-deepseek-key" }, fetchImpl: async () => { calls++; throw new Error("No calls expected"); } });
  const health = await request("/api/guardian/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.voice.configured, true);
  assert.deepEqual(health.body.chat.availableProviders.map((provider) => provider.id), ["local", "openai", "deepseek"]);
  assert.equal(JSON.stringify(health).includes("private-"), false);
  for (const payload of [{ message: "Usage?", provider: "custom-endpoint" }, { message: "Usage?", focusId: {} }]) {
    assert.equal((await request("/api/guardian/chat", json(payload))).status, 400);
  }
  assert.equal(calls, 0);
});

test("HTTP DeepSeek selection uses recorded metadata while local and preview selections stay free", async (t) => {
  let calls = 0, destination;
  const { request, store } = await setup(t, { env: { DEEPSEEK_API_KEY: "private-key" }, fetchImpl: async (url) => { calls++; destination = url; return { ok: true, json: async () => ({ choices: [{ message: { content: "Review the recorded session before changing its schedule." } }] }) }; } });
  await store.importEvents(parseEventJson([{ source: "cursor", timestamp: new Date().toISOString(), model: "sonnet", inputTokens: 100, outputTokens: 20, sessionId: "recorded-session" }]));
  assert.equal((await request("/api/guardian/chat", json({ message: "Which session used most tokens?", provider: "local" }))).body.mode, "local");
  assert.equal((await request("/api/guardian/chat", json({ message: "Which session used most tokens?", provider: "deepseek", datasetMode: "demo" }))).body.mode, "local");
  assert.equal(calls, 0);
  const reply = await request("/api/guardian/chat", json({ message: "Which session used most tokens?", provider: "deepseek" }));
  assert.equal(reply.status, 200);
  assert.equal(reply.body.mode, "deepseek");
  assert.equal(destination, "https://api.deepseek.com/chat/completions");
  assert.equal(calls, 1);
});

test("audio HTTP requests reject foreign origins before transcription and never persist the draft", async (t) => {
  let calls = 0;
  const { request, store } = await setup(t, { env: { OPENAI_API_KEY: "private-key" }, fetchImpl: async (url) => { calls++; assert.equal(url, "https://api.openai.com/v1/audio/transcriptions"); return { ok: true, json: async () => ({ text: "Private spoken question" }) }; } });
  const clip = { method: "POST", headers: { "content-type": "audio/webm" }, body: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]) };
  assert.equal((await request("/api/guardian/transcribe", { ...clip, headers: { ...clip.headers, origin: "https://foreign.example" } })).status, 403);
  assert.equal(calls, 0);
  const reply = await request("/api/guardian/transcribe", clip);
  assert.equal(reply.status, 200);
  assert.equal(reply.body.text, "Private spoken question");
  assert.equal(calls, 1);
  const files = await fs.readdir(store.guardianDir);
  assert.deepEqual(files, ["voice-budget.json"]);
  assert.equal((await fs.readFile(path.join(store.guardianDir, "voice-budget.json"), "utf8")).includes("Private spoken"), false);
});

test("Grok HTTP opt-in stays separate from token totals and validates query controls", async (t) => {
  const options = [];
  const { request } = await setup(t, { grokbot: { status: async (value) => { options.push(value); return { provider: "grokbot", enabled: value.enabled === true, usedPercent: value.enabled === true ? 45.5 : null, source: "cursor-official-rpc" }; } } });
  assert.equal((await request("/api/guardian/grokbot?enabled=maybe")).status, 400);
  assert.equal(options.length, 0);
  const before = (await request("/api/guardian?mode=local")).body.summary.totalTokens;
  const disabled = await request("/api/guardian/grokbot?enabled=0");
  assert.equal(disabled.body.enabled, false);
  const quota = await request("/api/guardian/grokbot?enabled=1&refresh=1");
  assert.equal(quota.body.usedPercent, 45.5);
  assert.deepEqual(options.at(-1), { enabled: true, refresh: true });
  assert.equal((await request("/api/guardian?mode=local")).body.summary.totalTokens, before);
});
