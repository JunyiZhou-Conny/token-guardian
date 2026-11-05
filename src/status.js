"use strict";

const { STATUS, providerResult } = require("./limits");
const { fetchClaudeLimits } = require("./providers/claude");
const { fetchCodexLimits } = require("./providers/codex");

const PROVIDERS = [
  ["claude", fetchClaudeLimits],
  ["codex", fetchCodexLimits],
  // Cursor arrives in the next milestone.
  ["cursor", async (deps) => providerResult("cursor", { status: STATUS.notBuilt }, deps.now)],
];

// One provider failing never hides the others.
async function collectStatus(deps = {}) {
  const now = deps.now || Date.now;
  const providers = await Promise.all(PROVIDERS.map(async ([name, fetchLimits]) => {
    try {
      return await fetchLimits({ ...deps, now });
    } catch {
      return providerResult(name, { status: STATUS.unavailable, detail: "unexpected error" }, now);
    }
  }));
  return { providers, generatedAt: new Date(now()).toISOString() };
}

module.exports = { collectStatus };
