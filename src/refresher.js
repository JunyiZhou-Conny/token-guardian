"use strict";

// Decides when to ask the providers again. Kept out of main.js so the cadence is testable.
//
// - Automatic refresh every `refreshMs`, or shortly after the next window reset if that comes first,
//   so a card never keeps showing a window that has already reset.
// - Opening the window reuses data younger than `refreshMs`.
// - Manual refresh is honored at most once per `manualFloorMs` (the endpoints are unofficial).
// - Concurrent callers share one in-flight request.

const DEFAULTS = { refreshMs: 5 * 60_000, manualFloorMs: 60_000, resetGraceMs: 30_000 };

function createRefresher({
  load,
  onUpdate = () => {},
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  refreshMs = DEFAULTS.refreshMs,
  manualFloorMs = DEFAULTS.manualFloorMs,
  resetGraceMs = DEFAULTS.resetGraceMs,
} = {}) {
  let latest = null;
  let inFlight = null;
  let timer = null;

  function nextDelay() {
    let delay = refreshMs;
    for (const provider of latest?.providers || []) {
      for (const window of provider.windows) {
        const untilReset = Date.parse(window.resetsAt) - now();
        if (untilReset > 0 && untilReset + resetGraceMs < delay) delay = untilReset + resetGraceMs;
      }
    }
    return delay;
  }

  function schedule() {
    clearTimer(timer);
    timer = setTimer(() => refresh({ scheduled: true }), nextDelay());
  }

  function refresh({ force = false, scheduled = false } = {}) {
    if (latest && !scheduled) {
      const age = now() - Date.parse(latest.generatedAt);
      if (age < (force ? manualFloorMs : refreshMs)) return Promise.resolve(latest);
    }
    if (!inFlight) {
      inFlight = Promise.resolve()
        .then(load)
        .then((status) => {
          latest = status;
          onUpdate(status);
          return status;
        })
        .catch(() => latest)
        .finally(() => {
          inFlight = null;
          schedule();
        });
    }
    return inFlight;
  }

  return {
    refresh,
    stop: () => clearTimer(timer),
    get latest() { return latest; },
  };
}

module.exports = { createRefresher, DEFAULTS };
