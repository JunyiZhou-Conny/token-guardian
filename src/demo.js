"use strict";

// Clearly labeled sample data for screenshots and UI work without real sign-ins.
// Enabled only by TOKEN_GUARDIAN_DEMO=1; the UI shows a "Demo data" banner.
function demoStatus(now = Date.now) {
  const at = (hours) => new Date(now() + hours * 3600_000).toISOString();
  const fetchedAt = new Date(now()).toISOString();
  const win = (label, usedPercent, resetsAt) => ({ label, usedPercent, remainingPercent: 100 - usedPercent, resetsAt });
  return {
    demo: true,
    generatedAt: fetchedAt,
    providers: [
      { provider: "claude", status: "ok", plan: "Max 5x", source: "demo", detail: null, fetchedAt,
        windows: [win("5-hour", 42, at(2.3)), win("Weekly", 61, at(76))] },
      { provider: "codex", status: "ok", plan: "Plus", source: "demo", detail: null, fetchedAt,
        windows: [win("5-hour", 13, at(4.1)), win("Weekly", 27, at(130))] },
      { provider: "cursor", status: "notBuilt", plan: null, source: null, detail: null, fetchedAt, windows: [] },
    ],
  };
}

module.exports = { demoStatus };
