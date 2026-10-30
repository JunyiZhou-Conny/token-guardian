"use strict";

// A read-only, opt-in view of Codex's account-level data. This is deliberately
// independent of the tracker ledger: these aggregates may overlap local logs.
const { spawn } = require("node:child_process");
const CACHE_MS = 60_000;
const TIMEOUT_MS = 12_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const duration = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

function summarizeUsage(result) {
  if (!result || typeof result !== "object") return null;
  const source = result.summary && typeof result.summary === "object" ? result.summary : {};
  const summary = {};
  for (const key of ["lifetimeTokens", "peakDailyTokens", "currentStreakDays", "longestStreakDays"]) summary[key] = count(source[key]);
  summary.longestRunningTurnSec = duration(source.longestRunningTurnSec);
  const dailyUsageBuckets = Array.isArray(result.dailyUsageBuckets)
    ? result.dailyUsageBuckets.slice(0, 2000).flatMap((item) => {
      if (!item || typeof item.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.startDate)) return [];
      const tokens = count(item.tokens);
      return tokens === null ? [] : [{ startDate: item.startDate, tokens }];
    }).sort((a, b) => a.startDate.localeCompare(b.startDate)) : null;
  return { summary, dailyUsageBuckets };
}

function summarizeLimits(result) {
  if (!result || typeof result !== "object") return null;
  const byId = result.rateLimitsByLimitId;
  const groups = byId && typeof byId === "object" && !Array.isArray(byId) && Object.keys(byId).length
    ? Object.entries(byId).slice(0, 30) : [["codex", result.rateLimits]];
  const limits = [];
  for (const [id, group] of groups) {
    if (!group || typeof group !== "object") continue;
    for (const window of ["primary", "secondary"]) {
      const item = group[window];
      if (!item || typeof item !== "object") continue;
      const usedPercent = duration(item.usedPercent);
      const windowDurationMins = duration(item.windowDurationMins);
      const seconds = duration(item.resetsAt);
      const resetDate = seconds !== null ? new Date(seconds * 1000) : null;
      const resetsAt = resetDate && Number.isFinite(resetDate.getTime()) ? resetDate.toISOString() : null;
      if (usedPercent === null && windowDurationMins === null && resetsAt === null) continue;
      limits.push({ limitId: /^[a-zA-Z0-9_.-]{1,80}$/.test(id) ? id : "other", window, usedPercent, windowDurationMins, resetsAt });
    }
  }
  return limits.length ? limits : null;
}

// Codex owns its auth; Guardian never reads credentials or sends tokens itself.
// stdout is parsed as JSONL, with no server output or errors returned verbatim.
function queryAppServer({ spawnImpl = spawn, timeoutMs = TIMEOUT_MS, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    let child, timer, done = false, buffer = "", bytes = 0;
    const replies = new Map();
    function finish(error, value) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (child) {
        child.stdin?.destroy();
        child.stdout?.destroy();
        child.kill();
      }
      if (error) reject(error); else resolve(value);
    }
    function send(value) {
      if (!done) child.stdin.write(`${JSON.stringify(value)}\n`);
    }
    try {
      child = spawnImpl("codex", ["app-server"], { env, stdio: ["pipe", "pipe", "ignore"], windowsHide: true, shell: false });
      timer = setTimeout(() => {
        if (replies.has(2) || replies.has(3)) finish(null, { usage: replies.get(2) || null, limits: replies.get(3) || null });
        else finish(new Error("timeout"));
      }, timeoutMs);
      child.on("error", () => finish(new Error("unavailable")));
      child.on("exit", () => finish(new Error("exited")));
      child.stdin.on("error", () => finish(new Error("unavailable")));
      child.stdout.on("error", () => finish(new Error("unavailable")));
      child.stdout.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_OUTPUT_BYTES) return finish(new Error("output limit"));
        buffer += chunk.toString("utf8");
        let end;
        while ((end = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let message;
          try { message = JSON.parse(line); } catch { continue; }
          if (!message || typeof message !== "object") continue;
          if (message.id === 1) {
            if (!message.result) return finish(new Error("initialize"));
            send({ method: "initialized", params: {} });
            send({ id: 2, method: "account/usage/read" });
            send({ id: 3, method: "account/rateLimits/read" });
          } else if (message.id === 2 || message.id === 3) {
            replies.set(message.id, message.error ? null : message.result || null);
            if (replies.has(2) && replies.has(3)) return finish(null, { usage: replies.get(2), limits: replies.get(3) });
          }
        }
      });
      send({ id: 1, method: "initialize", params: { clientInfo: { name: "token_guardian", title: "Token Guardian", version: "0.1.0" } } });
    } catch { finish(new Error("unavailable")); }
  });
}

function createCodexAccount({ env = process.env, now = Date.now, query = queryAppServer } = {}) {
  let cache = null, inFlight = null, generation = 0;
  const base = (enabled) => ({ provider: "codex", enabled, availability: "disabled", source: "codex-app-server", checkedAt: null, cached: false, summary: null, dailyUsageBuckets: null, rateLimits: null,
    message: "Codex account access is off. Enable it to read OpenAI account usage and quota using your existing Codex sign-in." });
  async function read() {
    const result = { ...base(true), checkedAt: new Date(now()).toISOString() };
    try {
      const data = await query({ env });
      const usage = summarizeUsage(data?.usage);
      const limits = summarizeLimits(data?.limits);
      const usableUsage = usage && (Object.values(usage.summary).some(v => v !== null) || (usage.dailyUsageBuckets?.length || 0) > 0);
      const availability = usableUsage && limits ? "available" : usableUsage || limits ? "partial" : "unavailable";
      return { ...result, availability, summary: usage?.summary || null, dailyUsageBuckets: usage?.dailyUsageBuckets ?? null, rateLimits: limits,
        message: availability === "unavailable" ? "Codex did not provide account usage or quota. Check your Codex sign-in and try again."
          : "OpenAI account activity and quota are separate measures. Coverage is not established and may overlap local Codex records; no subscription bill is inferred." };
    } catch {
      return { ...result, availability: "unavailable", message: "Codex account status could not be read. Check that Codex is installed and signed in, then retry." };
    }
  }
  async function status({ enabled = false, refresh = false } = {}) {
    if (enabled !== true) {
      generation++;
      cache = null;
      inFlight = null;
      return base(false);
    }
    if (!refresh && cache && now() - cache.at < CACHE_MS) return { ...cache.result, cached: true };
    if (inFlight) return inFlight;
    const currentGeneration = generation;
    const pending = read().then(result => {
      if (currentGeneration !== generation) return base(false);
      cache = { at: now(), result };
      return { ...result };
    }).finally(() => {
      if (inFlight === pending) inFlight = null;
    });
    inFlight = pending;
    return pending;
  }
  return { status };
}
module.exports = { createCodexAccount, queryAppServer, summarizeUsage, summarizeLimits };
