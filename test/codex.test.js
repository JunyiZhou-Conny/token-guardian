"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { fetchCodexLimits, USAGE_URL, windowLabel } = require("../src/providers/codex");
const { FIXTURES, NOW, fixture, fakeJwt, fakeFetch, fakeFiles, now } = require("./helpers");

const HOME = "/Users/test";
const AUTH_PATH = `${HOME}/.codex/auth.json`;
const TOKEN = "SYNTHETIC-CODEX-ACCESS-TOKEN";
const FAKE_CODEX = path.join(FIXTURES, "fake-codex.cjs");
const idToken = fakeJwt({ "https://api.openai.com/auth": { chatgpt_plan_type: "plus", chatgpt_account_id: "acct-from-jwt" } });
const authFile = JSON.stringify({ tokens: { access_token: TOKEN, refresh_token: "SYNTHETIC-REFRESH", id_token: idToken, account_id: "acct-123" } });
const noCodexCli = () => { throw Object.assign(new Error("spawn codex ENOENT"), { code: "ENOENT" }); };

function deps(overrides = {}) {
  return {
    env: {},
    home: HOME,
    platform: "linux",
    readFile: fakeFiles({ [AUTH_PATH]: authFile }),
    exists: () => false,
    spawnFn: noCodexCli,
    fetch: fakeFetch({ body: fixture("codex-wham-usage.json") }),
    now,
    ...overrides,
  };
}

test("reads 5-hour and weekly windows from ChatGPT usage", async () => {
  const fetch = fakeFetch({ body: fixture("codex-wham-usage.json") });
  const result = await fetchCodexLimits(deps({ fetch }));
  assert.equal(result.status, "ok");
  assert.equal(result.source, "chatgpt");
  assert.equal(result.plan, "Plus");
  assert.deepEqual(result.windows, [
    { label: "5-hour", usedPercent: 13, remainingPercent: 87, resetsAt: new Date(1793458800 * 1000).toISOString() },
    { label: "Weekly", usedPercent: 27, remainingPercent: 73, resetsAt: new Date(1793912040 * 1000).toISOString() },
  ]);
  assert.equal(fetch.calls[0].url, USAGE_URL);
  assert.equal(fetch.calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(fetch.calls[0].headers["ChatGPT-Account-Id"], "acct-123");
});

test("labels windows by length, so a weekly window in the primary slot stays weekly", async () => {
  const result = await fetchCodexLimits(deps({ fetch: fakeFetch({ body: fixture("codex-wham-usage-free.json") }) }));
  assert.equal(result.plan, "Free");
  assert.deepEqual(result.windows, [
    { label: "Weekly", usedPercent: 80, remainingPercent: 20, resetsAt: new Date(NOW + 3600_000).toISOString() },
  ]);
  assert.equal(windowLabel(undefined, "primary"), "5-hour");
  assert.equal(windowLabel(undefined, "secondary"), "Weekly");
  assert.equal(windowLabel(86400, "primary"), "1-day");
});

test("never puts tokens or account ids in the result", async () => {
  for (const response of [{ body: fixture("codex-wham-usage.json") }, { status: 401 }, { status: 500 }]) {
    const text = JSON.stringify(await fetchCodexLimits(deps({ fetch: fakeFetch(response) })));
    for (const secret of [TOKEN, "SYNTHETIC-REFRESH", "acct-123", "acct-from-jwt", idToken]) {
      assert.ok(!text.includes(secret), secret);
    }
  }
});

test("falls back to the Codex CLI app-server when the web sign-in is rejected", async () => {
  const result = await fetchCodexLimits(deps({
    env: { TOKEN_MONITOR_CODEX_COMMAND: FAKE_CODEX, PATH: process.env.PATH },
    spawnFn: require("node:child_process").spawn,
    fetch: fakeFetch({ status: 401 }),
  }));
  assert.equal(result.status, "ok");
  assert.equal(result.source, "codex-cli");
  assert.equal(result.plan, "Pro");
  assert.deepEqual(result.windows.map((w) => [w.label, w.usedPercent]), [["5-hour", 5], ["Weekly", 33]]);
});

test("uses the Codex CLI when there is no auth.json at all", async () => {
  const result = await fetchCodexLimits(deps({
    readFile: fakeFiles({}),
    env: { TOKEN_MONITOR_CODEX_COMMAND: FAKE_CODEX, PATH: process.env.PATH },
    spawnFn: require("node:child_process").spawn,
  }));
  assert.equal(result.status, "ok");
  assert.equal(result.source, "codex-cli");
});

test("stops a Codex CLI that never answers and keeps the web status", async () => {
  const started = Date.now();
  const result = await fetchCodexLimits(deps({
    env: { TOKEN_MONITOR_CODEX_COMMAND: FAKE_CODEX, FAKE_CODEX_MODE: "hang", PATH: process.env.PATH },
    spawnFn: require("node:child_process").spawn,
    fetch: fakeFetch({ status: 401 }),
    rpcTimeoutMs: 300,
  }));
  assert.equal(result.status, "expired");
  assert.ok(Date.now() - started < 5000);
});

test("reports notConfigured when there is no sign-in and no Codex CLI", async () => {
  const fetch = fakeFetch();
  const result = await fetchCodexLimits(deps({ readFile: fakeFiles({}), fetch }));
  assert.equal(result.status, "notConfigured");
  assert.equal(fetch.calls.length, 0);
});

test("maps web errors to labeled statuses when the CLI is unavailable", async () => {
  const cases = [
    [{ status: 401 }, "expired", null],
    [{ status: 429 }, "throttled", null],
    [{ status: 502 }, "unavailable", "HTTP 502"],
    [{ error: new TypeError("fetch failed") }, "unavailable", "network"],
    [{ body: { rate_limit: {} } }, "unavailable", "no usage windows"],
  ];
  for (const [response, status, detail] of cases) {
    const result = await fetchCodexLimits(deps({ fetch: fakeFetch(response) }));
    assert.equal(result.status, status, JSON.stringify(response));
    assert.equal(result.detail, detail);
    assert.equal(result.plan, "Plus");
  }
});

test("prefers the Codex desktop app binary on macOS when it exists", async () => {
  const spawned = [];
  await fetchCodexLimits(deps({
    platform: "darwin",
    readFile: fakeFiles({}),
    exists: (file) => file === "/Applications/Codex.app/Contents/Resources/codex",
    spawnFn: (command) => {
      spawned.push(command);
      throw Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
    },
  }));
  assert.deepEqual(spawned, ["/Applications/Codex.app/Contents/Resources/codex", "codex"]);
});
