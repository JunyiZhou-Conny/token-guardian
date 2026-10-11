"use strict";

// Grok Bot runs inside Cursor. Its Sand RPC reports quota percentages, not a
// separate stream of token events. Nothing in this module changes usage totals,
// refreshes credentials, resets an allowance, or controls an agent.
const CACHE_MS = 60_000;
const TIMEOUT_MS = 8_000;

function createGrokBot({ env = process.env, fetchImpl = globalThis.fetch, authReader, now = Date.now } = {}) {
  let cache = null;
  let inFlight = null;

  const base = (enabled) => ({
    provider: "grokbot", displayName: "Grok Bot", hostedBy: "cursor", enabled,
    availability: "disabled", usedPercent: null, resetAt: null, planLabel: null,
    source: "cursor-official-rpc", confidence: "unavailable", checkedAt: null,
    cached: false,
    message: "Grok Bot quota access is off. Enable it explicitly to read Cursor's official quota status.",
  });

  function resetIso(value) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
    return new Date(value).toISOString();
  }

  async function read() {
    const result = { ...base(true), checkedAt: new Date(now()).toISOString() };
    let timer;
    let expired = false;
    const deadlineAt = Date.now() + TIMEOUT_MS;
    const checkDeadline = () => {
      if (!expired && Date.now() < deadlineAt) return;
      const error = new Error("Grok Bot quota deadline exceeded.");
      error.code = "GUARDIAN_GROKBOT_TIMEOUT";
      throw error;
    };
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        const error = new Error("Grok Bot quota deadline exceeded.");
        error.code = "GUARDIAN_GROKBOT_TIMEOUT";
        reject(error);
      }, TIMEOUT_MS);
    });
    try {
      return await Promise.race([deadline, (async () => {
        // Lazy loading keeps the disabled path free of credential reads. The
        // inherited helper uses Cursor's own SQLite login state and first-party
        // protobuf decoder; no extra package is needed by this adapter.
        const cursor = require("../src/lib/cursor-config");
        const auth = await (authReader ? authReader({ env }) : cursor.extractCursorAuth({
          env,
          deps: { env: { ...env, TOKENTRACKER_DEBUG: "0" }, stderr: { write() {} } },
        }));
        checkDeadline();
        if (typeof auth?.accessToken !== "string" || !auth.accessToken.trim()) {
          return { ...result, availability: "not-authenticated", message: "Sign in to Cursor to make Grok Bot quota status available." };
        }
        const options = { accessToken: auth.accessToken.trim(), timeoutMs: Math.max(1, deadlineAt - Date.now()), fetchImpl };
        const access = await cursor.fetchCursorSandAccessStatus(options);
        checkDeadline();
        if (!access.granted) {
          return { ...result, availability: "not-eligible", confidence: "provider-reported", message: "Cursor reports that Grok Bot access is not available for this account." };
        }
        const usage = await cursor.fetchCursorSandUsageStatus({ ...options, timeoutMs: Math.max(1, deadlineAt - Date.now()) });
        checkDeadline();
        const reported = {
          ...result, confidence: "provider-reported", resetAt: resetIso(usage.nextResetAt),
          planLabel: usage.usesPooledEnterpriseAllowance ? "Enterprise pooled allowance" : null,
        };
        if (usage.includedLimitZero) {
          return { ...reported, availability: "no-included-quota", message: "Cursor reports no included Grok Bot allowance for this account." };
        }
        if (!Number.isFinite(usage.usagePercent) || usage.usagePercent < 0) {
          return { ...reported, availability: "unavailable", message: "Cursor did not expose a Grok Bot usage percentage for this account." };
        }
        return {
          ...reported, availability: "available", usedPercent: usage.usagePercent,
          message: "Cursor reports this Grok Bot quota percentage. It is not a token count and is not added to tracked usage.",
        };
      })()]);
    } catch (error) {
      // Never propagate messages from fetch or auth extraction: they may contain
      // a local path, response body, or credential supplied by a failed adapter.
      const expired = /Cursor session expired/.test(String(error?.message || ""));
      const timedOut = error?.code === "GUARDIAN_GROKBOT_TIMEOUT" || ["TimeoutError", "AbortError"].includes(error?.name);
      return {
        ...result, availability: expired ? "not-authenticated" : "unavailable",
        message: expired ? "The Cursor session needs attention. Sign in to Cursor, then refresh Grok Bot quota status."
          : timedOut ? "Grok Bot quota status timed out. Try refreshing it later."
            : "Grok Bot quota status is temporarily unavailable. Try refreshing it later.",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function status({ refresh = false, enabled } = {}) {
    const optedIn = enabled === undefined ? env.TOKENTRACKER_GUARDIAN_GROKBOT === "1" : enabled === true;
    if (!optedIn) return base(false);
    if (!refresh && cache && now() - cache.at < CACHE_MS) return { ...cache.result, cached: true };
    if (inFlight) return inFlight;
    inFlight = read().then(result => {
      cache = { at: now(), result };
      return { ...result };
    }).finally(() => { inFlight = null; });
    return inFlight;
  }

  return { status };
}

module.exports = { createGrokBot };
