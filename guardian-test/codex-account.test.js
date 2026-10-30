"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { Readable } = require("node:stream");
const { createCodexAccount, queryAppServer } = require("../guardian-server/codex-account");
const { createGuardianServer } = require("../guardian-server/server");

function fakeServer(behavior = "normal") {
  return (command, args, options) => {
    assert.equal(command, "codex");
    assert.deepEqual(args, ["app-server"]);
    assert.equal(options.shell, false);
    const program = `
      const readline = require('node:readline');
      const rl = readline.createInterface({input:process.stdin});
      const respond = o => process.stdout.write(JSON.stringify(o)+'\\n');
      rl.on('line', line => {
        const v = JSON.parse(line);
        if (v.method === 'initialize') respond({id:1,result:{userAgent:'secret'}});
        if (v.method === 'account/usage/read' && ${JSON.stringify(behavior)} !== 'hang') respond({id:2,result:{summary:{lifetimeTokens:42,peakDailyTokens:0,longestRunningTurnSec:8,currentStreakDays:2,longestStreakDays:3,email:'secret'},dailyUsageBuckets:[{startDate:'2026-10-30',tokens:12,privateField:'secret'}, {startDate:'2026-10-29',tokens:2}, {startDate:'bad',tokens:20}]}});
        if (v.method === 'account/rateLimits/read' && ${JSON.stringify(behavior)} !== 'hang') respond(${JSON.stringify(behavior)} === 'partial' ? {id:3,error:{message:'secret'}} : {id:3,result:{rateLimitsByLimitId:{codex:{primary:{usedPercent:55.5,windowDurationMins:300,resetsAt:1793376000,private:'secret'}}},credits:'secret'}});
      });`;
    return spawn(process.execPath, ["-e", program], { stdio: ["pipe", "pipe", "ignore"] });
  };
}

test("Codex account access is opt-in and never queries when disabled", async () => {
  const service = createCodexAccount({ query: () => assert.fail("unexpected query") });
  const result = await service.status();
  assert.equal(result.availability, "disabled");
  assert.equal(result.summary, null);
});

test("read-only app-server protocol returns allowlisted usage and quota separately", async () => {
  const service = createCodexAccount({ query: opts => queryAppServer({ ...opts, spawnImpl: fakeServer() }), now: () => 1793376000000 });
  const result = await service.status({ enabled: true });
  assert.equal(result.availability, "available");
  assert.deepEqual(result.summary, { lifetimeTokens: 42, peakDailyTokens: 0, currentStreakDays: 2, longestStreakDays: 3, longestRunningTurnSec: 8 });
  assert.deepEqual(result.dailyUsageBuckets, [{ startDate: "2026-10-29", tokens: 2 }, { startDate: "2026-10-30", tokens: 12 }]);
  assert.deepEqual(result.rateLimits, [{ limitId: "codex", window: "primary", usedPercent: 55.5, windowDurationMins: 300, resetsAt: "2026-10-30T16:00:00.000Z" }]);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("partial results are explicit, errors and private data are discarded", async () => {
  const service = createCodexAccount({ query: opts => queryAppServer({ ...opts, spawnImpl: fakeServer("partial") }) });
  const result = await service.status({ enabled: true });
  assert.equal(result.availability, "partial");
  assert.equal(result.rateLimits, null);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("hung child is terminated and failure is safely labeled", async () => {
  const service = createCodexAccount({ query: opts => queryAppServer({ ...opts, spawnImpl: fakeServer("hang"), timeoutMs: 50 }) });
  const result = await service.status({ enabled: true });
  assert.equal(result.availability, "unavailable");
  assert.equal(result.summary, null);
});

test("refresh and concurrent requests share an in-flight call; cached data never bypasses opt-in", async () => {
  let calls = 0;
  let resolve;
  const service = createCodexAccount({ query: () => { calls++; return new Promise(r => { resolve = r; }); }, now: () => 0 });
  const one = service.status({ enabled: true });
  const two = service.status({ enabled: true, refresh: true });
  assert.equal(calls, 1);
  resolve({ usage: { summary: { lifetimeTokens: 0 }, dailyUsageBuckets: [] }, limits: null });
  assert.equal((await one).summary.lifetimeTokens, 0);
  await two;
  assert.equal((await service.status({ enabled: true })).cached, true);
  assert.equal((await service.status()).summary, null);
});

test("disconnect clears cached data and prevents an older in-flight read from being reused", async () => {
  const pending = [];
  const service = createCodexAccount({ query: () => new Promise(resolve => pending.push(resolve)), now: () => 0 });
  const first = service.status({ enabled: true });
  pending[0]({ usage: { summary: { lifetimeTokens: 10 } }, limits: null });
  await first;
  assert.equal((await service.status({ enabled: true })).cached, true);
  await service.status({ enabled: false });
  const old = service.status({ enabled: true });
  assert.equal(pending.length, 2);
  await service.status({ enabled: false });
  const current = service.status({ enabled: true });
  assert.equal(pending.length, 3);
  pending[1]({ usage: { summary: { lifetimeTokens: 20 } }, limits: null });
  assert.equal((await old).availability, "disabled");
  const shared = service.status({ enabled: true });
  assert.equal(pending.length, 3);
  pending[2]({ usage: { summary: { lifetimeTokens: 30 } }, limits: null });
  assert.equal((await current).summary.lifetimeTokens, 30);
  assert.equal((await shared).summary.lifetimeTokens, 30);
  assert.equal((await service.status({ enabled: true })).summary.lifetimeTokens, 30);
});

test("Codex route requires explicit enable and never changes ledger snapshot", async () => {
  let called = [];
  const store = { guardianDir: require("node:os").tmpdir(), snapshot: async () => ({ coverage: {}, summary: { totalTokens: 100 } }) };
  const codexAccount = { status: async options => { called.push(options); return { enabled: options.enabled, summary: { lifetimeTokens: 1000 } }; } };
  const server = createGuardianServer({ store, env: {}, codexAccount });
  const handler = server.listeners("request")[0];
  async function get(url, headers = {}) {
    const req = Readable.from([]);
    Object.assign(req, { method: "GET", url, headers: { host: "127.0.0.1:7681", ...headers }, socket: { localPort: 7681 } });
    let status, body;
    await handler(req, { writeHead(n) { status = n; this.headersSent = true; }, end(value) { body = JSON.parse(String(value)); } });
    return { status, body };
  }
  assert.equal((await get("/api/guardian/codex?enabled=bad")).status, 400);
  assert.deepEqual(called, []);
  await get("/api/guardian/codex");
  assert.equal(called[0].enabled, false);
  assert.equal((await get("/api/guardian/codex?enabled=1")).status, 403);
  await get("/api/guardian/codex?enabled=1&refresh=1", { "x-guardian-intent": "codex-account" });
  assert.deepEqual(called[1], { enabled: true, refresh: true });
  assert.equal((await get("/api/guardian?mode=local")).body.summary.totalTokens, 100);
});
