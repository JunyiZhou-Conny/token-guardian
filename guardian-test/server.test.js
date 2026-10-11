"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { createStore } = require("../guardian-server/store");
const { createChat } = require("../guardian-server/chat");
const { createGuardianServer, MAX_BODY_BYTES } = require("../guardian-server/server");
const { parseEventJson } = require("../guardian-server/engine");

async function setup(t, options = {}) {
  const trackerHome = await fs.mkdtemp(path.join(os.tmpdir(), "guardian-test-"));
  const store = createStore({ trackerHome, now: () => Date.parse("2026-10-10T12:00:00Z") });
  const server = createGuardianServer({ store, env: {}, ...options });
  t.after(async () => { await fs.rm(trackerHome, { recursive: true, force: true }); });
  const handler = server.listeners("request")[0];
  async function request(url, options = {}) {
    const body = options.body || "";
    const stream = Readable.from(body ? [Buffer.from(body)] : []);
    stream.method = options.method || "GET";
    stream.url = url;
    stream.socket = { localPort: 7681 };
    stream.headers = { host: "127.0.0.1:7681", ...Object.fromEntries(Object.entries(options.headers || {}).map(([key, value]) => [key.toLowerCase(), value])) };
    let status, headers, output;
    const response = { headersSent: false, writeHead(code, value) { status = code; headers = value; this.headersSent = true; }, end(value) { output = value === undefined ? "" : value.toString(); } };
    await handler(stream, response);
    return { status, headers, json: async () => JSON.parse(output), text: async () => output };
  }
  return { store, trackerHome, server, request };
}
const json = (data) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
const imported = { source: "codex", timestamp: "2026-10-10T12:00:00Z", model: "gpt-5", inputTokens: 150, outputTokens: 40, sessionId: "thread-1", prompt: "never persisted" };

test("empty data has labeled demo; imports select local data and repeated uploads are deduplicated", async (t) => {
  const { request, store } = await setup(t);
  const demo = await (await request("/api/guardian")).json();
  assert.equal(demo.mode, "demo");
  assert.match(demo.demoReason, /No supported local/);
  const empty = await (await request("/api/guardian?mode=local")).json();
  assert.equal(empty.events.length, 0);
  const first = await (await request("/api/guardian/import", json({ format: "json", data: [imported] }))).json();
  assert.equal(first.added, 1);
  const repeat = await (await request("/api/import", json({ format: "json", data: [imported] }))).json();
  assert.equal(repeat.duplicates, 1);
  assert.equal((await fs.readFile(store.importsPath, "utf8")).includes("never persisted"), false);
  const local = await (await request("/api/guardian")).json();
  assert.equal(local.mode, "local");
  assert.equal(local.summary.totalTokens, 190);
  assert.equal(local.events.length, 1);
  const chat = await (await request("/api/guardian/chat", json({ message: "Where did usage come from?" }))).json();
  assert.equal(chat.mode, "local");
  assert.match(chat.answer, /thread-1/);
  assert.equal(chat.llmStatus, "not-configured");
});

test("real canonical nested queue and Cursor ledger are read without session double counting", async (t) => {
  const { trackerHome, store } = await setup(t);
  await fs.mkdir(path.join(trackerHome, "tracker"));
  const bucket = { source: "cursor", model: "sonnet", hour_start: "2026-10-10T12:00:00Z", input_tokens: 100, total_tokens: 100 };
  await fs.writeFile(path.join(trackerHome, "queue.jsonl"), JSON.stringify({ ...bucket, input_tokens: 999, total_tokens: 999 }) + "\n");
  await fs.writeFile(path.join(trackerHome, "tracker", "queue.jsonl"), JSON.stringify(bucket) + "\n" + "incomplete\n");
  await fs.writeFile(path.join(trackerHome, "tracker", "cursor-guardian-events.jsonl"), JSON.stringify({ id: "cursor-provider-1", timestamp: bucket.hour_start, source: "cursor", model: "sonnet", inputTokens: 60, totalTokens: 60, automationId: "job-1", costUsd: 0.3, costType: "provider_reported", billingKind: "included", attribution: "confirmed", granularity: "event" }) + "\n");
  await fs.writeFile(path.join(trackerHome, "tracker", "session.queue.jsonl"), JSON.stringify({ source: "claude", session_hash: "h", session_id: "thread", project_ref: "/my/project", title: "A local title", total_tokens: 5000 }) + "\n");
  const snapshot = await store.snapshot();
  assert.equal(snapshot.mode, "local");
  assert.equal(snapshot.summary.totalTokens, 100);
  assert.equal(snapshot.summary.includedCostUsd, 0.3);
  assert.equal(snapshot.sessions.length, 1);
  assert.equal(snapshot.events.find((event) => event.grain === "bucket").totalTokens, 40);
  assert.equal(snapshot.events.find((event) => event.grain === "event").automationId, "job-1");
  assert.match(snapshot.coverage.warnings.join(" "), /malformed JSON/);
});

test("cross-origin, malformed, oversized and unsupported imports fail without mutating data", async (t) => {
  const { request, store } = await setup(t);
  assert.equal((await request("/api/import", { ...json({ format: "json", data: [imported] }), headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" } })).status, 403);
  assert.equal((await request("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).status, 400);
  assert.equal((await request("/api/import", json(null))).status, 400);
  assert.equal((await request("/api/import", json({ format: "csv", data: "not-a-csv" }))).status, 400);
  assert.equal((await request("/api/import", json({ format: "json", data: [ { ...imported, source: "unconnected-browser" } ] }))).status, 400);
  assert.equal((await request("/api/import", json({ format: "json", data: " ".repeat(MAX_BODY_BYTES) }))).status, 413);
  assert.equal((await store.snapshot({ mode: "local" })).events.length, 0);
});

test("static assets stay within the guardian folder and secret paths are not served", async (t) => {
  const staticDir = await fs.mkdtemp(path.join(os.tmpdir(), "guardian-static-"));
  await fs.writeFile(path.join(staticDir, "index.html"), "<title>Guardian</title>");
  await fs.writeFile(path.join(staticDir, ".env"), "must not be served");
  await fs.symlink(path.join(staticDir, ".env"), path.join(staticDir, "symlink.txt"));
  t.after(() => fs.rm(staticDir, { recursive: true, force: true }));
  const { request } = await setup(t, { staticDir });
  assert.equal((await request("/")).status, 200);
  assert.equal((await request("/.env")).status, 403);
  assert.equal((await request("/symlink.txt")).status, 403);
  assert.equal((await request("/%2e%2e%2f.env")).status, 403);
});

test("request listener delegates inside the upstream local server without its own listen", async (t) => {
  const { request, server } = await setup(t);
  assert.equal(server.address(), null);
  const response = await request("/api/guardian/health");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test("OpenAI opt-in is bounded, metadata-only, and does not call provider in demo", async (t) => {
  const { store } = await setup(t);
  await store.importEvents(parseEventJson([imported]));
  let calls = 0, captured;
  const companion = createChat({ store, env: { OPENAI_API_KEY: "test-placeholder", TOKENTRACKER_GUARDIAN_CHAT_DAILY_CALLS: "1" }, fetchImpl: async (url, options) => { calls++; captured = JSON.parse(options.body); return { ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: "A bounded explanation." }] }] }) }; } });
  assert.equal((await companion.chat("Compare my tools", await store.snapshot({ mode: "demo" }))).mode, "local");
  assert.equal(calls, 0);
  assert.equal((await companion.chat("Compare my tools", await store.snapshot())).mode, "openai");
  assert.equal(calls, 1);
  assert.equal(captured.max_output_tokens, 350);
  assert.equal(captured.store, false);
  assert.equal(JSON.stringify(captured).includes("never persisted"), false);
  assert.equal((await companion.chat("Compare my tools", await store.snapshot())).llmStatus, "daily-budget-reached");
  assert.equal(calls, 1);
});

test("separate companion instances cannot both spend the final daily allowance", async (t) => {
  const { store } = await setup(t);
  await store.importEvents(parseEventJson([imported]));
  const snapshot = await store.snapshot();
  let calls = 0;
  const options = { store, env: { OPENAI_API_KEY: "test-placeholder", TOKENTRACKER_GUARDIAN_CHAT_DAILY_CALLS: "1" }, fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ output_text: "Bounded." }) }; } };
  const replies = await Promise.all([createChat(options).chat("Usage?", snapshot), createChat(options).chat("Usage?", snapshot)]);
  assert.equal(calls, 1);
  assert.equal(replies.filter((reply) => reply.mode === "openai").length, 1);
  assert.equal(replies.filter((reply) => reply.mode === "local").length, 1);
});
