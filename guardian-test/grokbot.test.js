"use strict";

const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const { createGrokBot } = require("../guardian-server/grokbot");

const FIXTURE_TOKEN = "synthetic-test-token";
const START = "2026-10-11T00:00:00.000Z";
const RESET = "2026-10-12T00:00:00.000Z";

function varint(value) {
  let remaining = BigInt(value);
  const bytes = [];
  do {
    const byte = Number(remaining & 127n);
    remaining >>= 7n;
    bytes.push(byte | (remaining ? 128 : 0));
  } while (remaining);
  return Buffer.from(bytes);
}
const integer = (field, value) => Buffer.concat([varint(field << 3), varint(value)]);
const bytes = (field, value) => Buffer.concat([varint((field << 3) | 2), varint(value.length), value]);
const timestamp = (date) => integer(1, Date.parse(date) / 1000);
function usage({ percent = 37.125, includedLimitZero = false, enterprise = true } = {}) {
  const parts = [bytes(1, timestamp(START)), bytes(2, timestamp(RESET))];
  if (percent !== null) {
    const value = Buffer.alloc(8); value.writeDoubleLE(percent);
    parts.push(varint((3 << 3) | 1), value);
  }
  parts.push(integer(4, Number(includedLimitZero)), integer(6, Number(enterprise)), integer(7, 1), integer(8, 1));
  return Buffer.concat(parts);
}
const protoResponse = (body, status = 200) => new Response(body, { status, headers: { "content-type": "application/proto" } });
function fixtureFetch({ quota = usage(), granted = true, onCall } = {}) {
  return async (url, options) => {
    onCall?.(url, options);
    assert.match(url, /^https:\/\/api2\.cursor\.sh\/aiserver\.v1\.DashboardService\/GetSand(?:Access|Usage)Status$/);
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, `Bearer ${FIXTURE_TOKEN}`);
    assert.equal(options.headers["Content-Type"], "application/proto");
    assert.equal(options.body.length, 0);
    assert.ok(options.signal instanceof AbortSignal);
    return protoResponse(url.endsWith("GetSandAccessStatus") ? integer(1, granted ? 1 : 2) : quota);
  };
}
const authReader = () => ({ accessToken: FIXTURE_TOKEN, cookie: "synthetic-cookie", userId: "synthetic-user" });

test("disabled quota access does not read authentication or call the network", async () => {
  const adapter = createGrokBot({ env: {}, authReader: () => assert.fail("credential read"), fetchImpl: () => assert.fail("network") });
  const result = await adapter.status();
  assert.equal(result.enabled, false);
  assert.equal(result.availability, "disabled");
  assert.equal(result.checkedAt, null);
  assert.equal(result.usedPercent, null);
});

test("explicit opt-in returns provider percentage/reset without exposing credentials or inventing tokens", async () => {
  const adapter = createGrokBot({ env: {}, authReader, fetchImpl: fixtureFetch(), now: () => Date.parse(START) });
  const result = await adapter.status({ enabled: true });
  assert.equal(result.availability, "available");
  assert.equal(result.usedPercent, 37.125);
  assert.equal(result.resetAt, RESET);
  assert.equal(result.planLabel, "Enterprise pooled allowance");
  assert.equal(result.confidence, "provider-reported");
  assert.equal(result.source, "cursor-official-rpc");
  assert.equal(result.hostedBy, "cursor");
  assert.equal(result.checkedAt, START);
  assert.equal(result.cached, false);
  assert.doesNotMatch(JSON.stringify(result), /synthetic|Bearer|accessToken|cookie|userId|totalTokens/);
});

test("quota percent is preserved exactly, including explicit zero and over-limit values", async () => {
  for (const percent of [0, 123.456]) {
    const result = await createGrokBot({ env: { TOKENTRACKER_GUARDIAN_GROKBOT: "1" }, authReader, fetchImpl: fixtureFetch({ quota: usage({ percent, enterprise: false }) }) }).status();
    assert.equal(result.usedPercent, percent);
    assert.equal(result.planLabel, null);
  }
});

test("missing protobuf percentage is unavailable rather than guessed as zero", async () => {
  const result = await createGrokBot({ env: {}, authReader, fetchImpl: fixtureFetch({ quota: usage({ percent: null }) }) }).status({ enabled: true });
  assert.equal(result.availability, "unavailable");
  assert.equal(result.usedPercent, null);
  assert.equal(result.resetAt, RESET);
});

test("an ineligible account is reported without requesting usage", async () => {
  const calls = [];
  const result = await createGrokBot({ env: {}, authReader, fetchImpl: fixtureFetch({ granted: false, onCall: url => calls.push(url) }) }).status({ enabled: true });
  assert.equal(result.availability, "not-eligible");
  assert.equal(result.usedPercent, null);
  assert.equal(result.confidence, "provider-reported");
  assert.equal(calls.length, 1);
});

test("zero included allowance does not masquerade as an available quota", async () => {
  const result = await createGrokBot({ env: {}, authReader, fetchImpl: fixtureFetch({ quota: usage({ includedLimitZero: true }) }) }).status({ enabled: true });
  assert.equal(result.availability, "no-included-quota");
  assert.equal(result.usedPercent, null);
});

test("missing authentication is neutral, cached, and does not call a provider", async () => {
  let reads = 0;
  const adapter = createGrokBot({ env: { TOKENTRACKER_GUARDIAN_GROKBOT: "1" }, authReader: () => { reads++; return null; }, fetchImpl: () => assert.fail("network") });
  assert.equal((await adapter.status()).availability, "not-authenticated");
  assert.equal((await adapter.status()).cached, true);
  assert.equal(reads, 1);
  assert.equal((await adapter.status({ enabled: false })).availability, "disabled");
});

test("the sixty-second cache avoids repeated reads, with explicit refresh and expiry", async () => {
  let clock = Date.parse(START), calls = 0, reads = 0;
  const adapter = createGrokBot({ env: {}, authReader: () => { reads++; return authReader(); }, fetchImpl: fixtureFetch({ onCall: () => { calls++; } }), now: () => clock });
  await adapter.status({ enabled: true });
  clock += 59_999;
  assert.equal((await adapter.status({ enabled: true })).cached, true);
  assert.equal(calls, 2);
  await adapter.status({ enabled: true, refresh: true });
  assert.equal(calls, 4);
  clock += 60_000;
  assert.equal((await adapter.status({ enabled: true })).cached, false);
  assert.equal(calls, 6);
  assert.equal(reads, 3);
});

test("concurrent refreshes share a single pair of provider requests", async () => {
  let calls = 0;
  const adapter = createGrokBot({ env: {}, authReader, fetchImpl: fixtureFetch({ onCall: () => { calls++; } }) });
  const results = await Promise.all([adapter.status({ enabled: true }), adapter.status({ enabled: true, refresh: true })]);
  assert.equal(calls, 2);
  assert.ok(results.every(result => result.availability === "available"));
});

test("expired Cursor authentication reports a safe sign-in message", async () => {
  const result = await createGrokBot({ env: {}, authReader, fetchImpl: async () => protoResponse(Buffer.alloc(0), 401) }).status({ enabled: true });
  assert.equal(result.availability, "not-authenticated");
  assert.match(result.message, /Sign in to Cursor/);
  assert.doesNotMatch(JSON.stringify(result), /synthetic|401/);
});

test("provider and auth-reader error details are discarded and cached", async () => {
  for (const failAuth of [false, true]) {
    let failures = 0;
    const fail = () => { failures++; throw new Error(`private credential ${FIXTURE_TOKEN} /private/login/path`); };
    const adapter = createGrokBot({ env: {}, authReader: failAuth ? fail : authReader, fetchImpl: fail });
    const result = await adapter.status({ enabled: true });
    assert.equal(result.availability, "unavailable");
    assert.equal(result.usedPercent, null);
    assert.doesNotMatch(JSON.stringify(result), /synthetic|private|credential/);
    assert.equal((await adapter.status({ enabled: true })).cached, true);
    assert.equal(failures, 1);
  }
});

test("malformed protobuf does not produce a success or expose response bytes", async () => {
  const result = await createGrokBot({ env: {}, authReader, fetchImpl: async () => protoResponse(Buffer.from([0xff])) }).status({ enabled: true });
  assert.equal(result.availability, "unavailable");
  assert.equal(result.usedPercent, null);
  assert.equal(result.confidence, "unavailable");
});

test("the overall deadline bounds a stalled adapter and returns a sanitized cached error", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const adapter = createGrokBot({ env: {}, authReader: () => new Promise(() => {}), fetchImpl: () => assert.fail("network") });
    const pending = adapter.status({ enabled: true });
    mock.timers.tick(8_000);
    const result = await pending;
    assert.equal(result.availability, "unavailable");
    assert.match(result.message, /timed out/);
    assert.equal((await adapter.status({ enabled: true })).cached, true);
  } finally {
    mock.timers.reset();
  }
});

test("a late access response cannot start a quota request after the deadline", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  let resolveAccess, calls = 0;
  try {
    const adapter = createGrokBot({ env: {}, authReader, fetchImpl: () => {
      calls++;
      return new Promise(resolve => { resolveAccess = resolve; });
    } });
    const pending = adapter.status({ enabled: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    mock.timers.tick(8_000);
    assert.equal((await pending).availability, "unavailable");
    resolveAccess(protoResponse(integer(1, 1)));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
  } finally {
    mock.timers.reset();
  }
});
