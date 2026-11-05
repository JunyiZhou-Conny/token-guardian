"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRefresher } = require("../src/refresher");

// A manual clock and timer queue so cadence can be checked without waiting.
function clock(start = Date.parse("2026-10-31T10:00:00Z")) {
  let t = start;
  const timers = [];
  return {
    now: () => t,
    setTimer: (fn, ms) => { const timer = { fn, at: t + ms }; timers.push(timer); return timer; },
    clearTimer: (timer) => { const i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1); },
    advance: async (ms) => {
      t += ms;
      for (const timer of timers.filter((x) => x.at <= t)) {
        timers.splice(timers.indexOf(timer), 1);
        await timer.fn();
      }
    },
    pending: () => timers.map((x) => x.at - t),
  };
}

function setup({ resetsInMs = null, latencyMs = 0 } = {}) {
  const c = clock();
  let loads = 0;
  const load = async () => {
    loads++;
    const resetsAt = resetsInMs === null ? null : new Date(c.now() + resetsInMs).toISOString();
    return { generatedAt: new Date(c.now() + latencyMs).toISOString(), providers: [{ windows: [{ resetsAt }] }] };
  };
  const refresher = createRefresher({ load, now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer });
  return { c, refresher, loads: () => loads };
}

test("refreshes automatically every 5 minutes, even when a fetch took a moment", async () => {
  const { c, refresher, loads } = setup({ latencyMs: 800 });
  await refresher.refresh();
  assert.equal(loads(), 1);
  await c.advance(5 * 60_000);
  assert.equal(loads(), 2);
  await c.advance(5 * 60_000);
  assert.equal(loads(), 3);
});

test("opening the window reuses fresh data", async () => {
  const { c, refresher, loads } = setup();
  await refresher.refresh();
  await c.advance(2 * 60_000);
  await refresher.refresh();
  assert.equal(loads(), 1);
});

test("manual refresh is honored at most once a minute", async () => {
  const { c, refresher, loads } = setup();
  await refresher.refresh();
  await c.advance(20_000);
  await refresher.refresh({ force: true });
  assert.equal(loads(), 1);
  await c.advance(45_000);
  await refresher.refresh({ force: true });
  assert.equal(loads(), 2);
});

test("refreshes shortly after a window resets instead of waiting the full interval", async () => {
  const { c, refresher, loads } = setup({ resetsInMs: 90_000 });
  await refresher.refresh();
  assert.deepEqual(c.pending(), [120_000]);
  await c.advance(120_000);
  assert.equal(loads(), 2);
});

test("concurrent callers share one request and a failed load keeps the last status", async () => {
  const c = clock();
  let loads = 0;
  let fail = false;
  const load = async () => {
    loads++;
    if (fail) throw new Error("offline");
    return { generatedAt: new Date(c.now()).toISOString(), providers: [] };
  };
  const refresher = createRefresher({ load, now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer });
  const [a, b] = await Promise.all([refresher.refresh(), refresher.refresh()]);
  assert.equal(loads, 1);
  assert.equal(a, b);
  fail = true;
  await c.advance(5 * 60_000);
  assert.equal(loads, 2);
  assert.equal(refresher.latest, a);
  assert.equal(c.pending().length, 1);
});
