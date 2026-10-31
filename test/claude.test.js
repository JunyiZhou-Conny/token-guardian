"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchClaudeLimits, USAGE_URL, KEYCHAIN_SERVICE } = require("../src/providers/claude");
const { fixture, fakeFetch, fakeFiles, now } = require("./helpers");

const HOME = "/Users/test";
const CREDS_PATH = `${HOME}/.claude/.credentials.json`;
const TOKEN = "sk-ant-oat01-SYNTHETIC-TOKEN";
const credsFile = JSON.stringify({
  claudeAiOauth: { accessToken: TOKEN, refreshToken: "SYNTHETIC-REFRESH", subscriptionType: "max", rateLimitTier: "default_claude_max_20x" },
});
const keychainNotFound = Object.assign(new Error("security: item not found"), { code: 44 });

// Records every `security` call so tests can assert whether the Keychain was read.
function keychain(answer) {
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  run.calls = calls;
  return run;
}

function deps(overrides = {}) {
  return {
    env: {},
    home: HOME,
    platform: "linux",
    readFile: fakeFiles({ [CREDS_PATH]: credsFile }),
    run: keychain(new Error("unexpected Keychain read")),
    fetch: fakeFetch({ body: fixture("claude-usage.json") }),
    now,
    ...overrides,
  };
}

test("reads 5-hour and weekly utilization with reset times and plan", async () => {
  const fetch = fakeFetch({ body: fixture("claude-usage.json") });
  const result = await fetchClaudeLimits(deps({ fetch }));
  assert.equal(result.status, "ok");
  assert.equal(result.plan, "Max 20x");
  assert.deepEqual(result.windows, [
    { label: "5-hour", usedPercent: 42, remainingPercent: 58, resetsAt: "2026-10-31T14:00:00.000Z" },
    { label: "Weekly", usedPercent: 61.5, remainingPercent: 38.5, resetsAt: "2026-11-03T09:00:00.000Z" },
  ]);
  assert.equal(fetch.calls[0].url, USAGE_URL);
  assert.equal(fetch.calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(fetch.calls[0].headers["anthropic-beta"], "oauth-2025-04-20");
});

test("never puts the access or refresh token in the result", async () => {
  for (const response of [{ body: fixture("claude-usage.json") }, { status: 401 }, { status: 500 }]) {
    const text = JSON.stringify(await fetchClaudeLimits(deps({ fetch: fakeFetch(response) })));
    assert.ok(!text.includes(TOKEN));
    assert.ok(!text.includes("SYNTHETIC-REFRESH"));
  }
});

test("prefers CLAUDE_CODE_OAUTH_TOKEN over every stored sign-in", async () => {
  const fetch = fakeFetch({ body: fixture("claude-usage.json") });
  const run = keychain(credsFile);
  await fetchClaudeLimits(deps({ env: { CLAUDE_CODE_OAUTH_TOKEN: "env-token" }, platform: "darwin", run, fetch }));
  assert.equal(fetch.calls[0].headers.Authorization, "Bearer env-token");
  assert.equal(run.calls.length, 0);
});

test("on macOS reads the Keychain before a possibly stale credentials file", async () => {
  const keychainCreds = JSON.stringify({ claudeAiOauth: { accessToken: "keychain-token", subscriptionType: "pro" } });
  const run = keychain(keychainCreds);
  const fetch = fakeFetch({ body: fixture("claude-usage.json") });
  const result = await fetchClaudeLimits(deps({ platform: "darwin", run, fetch }));
  assert.deepEqual(run.calls, [["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"]]);
  assert.equal(fetch.calls[0].headers.Authorization, "Bearer keychain-token");
  assert.equal(result.plan, "Pro");
});

test("on macOS falls back to the credentials file when the Keychain item does not exist", async () => {
  const run = keychain(keychainNotFound);
  const fetch = fakeFetch({ body: fixture("claude-usage.json") });
  const result = await fetchClaudeLimits(deps({ platform: "darwin", run, fetch }));
  assert.equal(run.calls.length, 1);
  assert.equal(fetch.calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(result.status, "ok");
});

test("says Keychain access was not allowed instead of 'not signed in'", async () => {
  const denied = Object.assign(new Error("User interaction is not allowed."), { code: 51 });
  const fetch = fakeFetch();
  const result = await fetchClaudeLimits(deps({ platform: "darwin", run: keychain(denied), readFile: fakeFiles({}), fetch }));
  assert.equal(result.status, "unavailable");
  assert.equal(result.detail, "Keychain access not allowed");
  assert.equal(fetch.calls.length, 0);
});

test("never reads the Keychain outside macOS", async () => {
  const run = keychain(credsFile);
  const result = await fetchClaudeLimits(deps({ readFile: fakeFiles({}), run }));
  assert.equal(result.status, "notConfigured");
  assert.equal(run.calls.length, 0);
});

test("honors CLAUDE_CONFIG_DIR", async () => {
  const fetch = fakeFetch({ body: fixture("claude-usage.json") });
  const result = await fetchClaudeLimits(deps({
    env: { CLAUDE_CONFIG_DIR: "/custom/claude" },
    readFile: fakeFiles({ "/custom/claude/.credentials.json": credsFile }),
    fetch,
  }));
  assert.equal(result.status, "ok");
});

test("reports notConfigured without a network call when there is no sign-in", async () => {
  const fetch = fakeFetch();
  const result = await fetchClaudeLimits(deps({ readFile: fakeFiles({}), fetch }));
  assert.equal(result.status, "notConfigured");
  assert.equal(fetch.calls.length, 0);
});

test("maps 401, 429, server errors, network errors and empty bodies to labeled statuses", async () => {
  const cases = [
    [{ status: 401 }, "expired", null],
    [{ status: 403 }, "unavailable", "no permission to read usage"],
    [{ status: 429 }, "throttled", null],
    [{ status: 503 }, "unavailable", "HTTP 503"],
    [{ error: new TypeError("fetch failed") }, "unavailable", "network"],
    [{ body: {} }, "unavailable", "no usage windows"],
  ];
  for (const [response, status, detail] of cases) {
    const result = await fetchClaudeLimits(deps({ fetch: fakeFetch(response) }));
    assert.equal(result.status, status, JSON.stringify(response));
    assert.equal(result.detail, detail);
    assert.equal(result.plan, "Max 20x");
    assert.deepEqual(result.windows, []);
  }
});

test("ignores malformed credential files", async () => {
  const result = await fetchClaudeLimits(deps({ readFile: fakeFiles({ [CREDS_PATH]: "{not json" }) }));
  assert.equal(result.status, "notConfigured");
});
