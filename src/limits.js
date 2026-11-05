"use strict";

// Every provider returns the same small shape so the UI can render one card type:
// { provider, status, plan, windows: [{ label, usedPercent, remainingPercent, resetsAt }], detail, fetchedAt }
// Unknown values stay null; nothing here guesses a number the provider did not report.

const STATUS = Object.freeze({
  ok: "ok",
  notConfigured: "notConfigured", // not signed in on this Mac
  expired: "expired", // sign-in exists but the provider rejected it
  throttled: "throttled", // the usage endpoint asked us to slow down
  unavailable: "unavailable", // network error or unexpected response
  notBuilt: "notBuilt", // provider not implemented yet
});

function clampPercent(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

// Providers send resets as ISO strings, epoch seconds, or epoch milliseconds.
function toIso(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value))) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return new Date(n < 2e10 ? n * 1000 : n).toISOString();
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function makeWindow({ label, usedPercent, resetsAt = null }) {
  const used = clampPercent(usedPercent);
  if (used === null) return null;
  return {
    label,
    usedPercent: Math.round(used * 10) / 10,
    remainingPercent: Math.round((100 - used) * 10) / 10,
    resetsAt: toIso(resetsAt),
  };
}

const PLAN_ALIASES = {
  free: "Free",
  go: "Go",
  plus: "Plus",
  pro: "Pro",
  max: "Max",
  team: "Team",
  teams: "Team",
  business: "Business",
  enterprise: "Enterprise",
  edu: "Edu",
};

// Turn raw plan identifiers ("claude_max", "chatgpt-plus", "pro") into a short label.
// Approach adapted from Javis603/token-monitor (MIT); see THIRD_PARTY_NOTICES.md.
function planLabel(...parts) {
  const text = parts.map((part) => (typeof part === "string" ? part : "")).find(Boolean) || "";
  const raw = text.toLowerCase().replace(/^(claude|chatgpt|openai)[\s_-]+/, "").replace(/[_-]+/g, " ").trim();
  if (!raw || raw.includes("@") || raw.includes("/")) return null;
  if (PLAN_ALIASES[raw]) return PLAN_ALIASES[raw];
  return raw.split(/\s+/).slice(0, 3).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function decodeJwtPayload(token) {
  if (typeof token !== "string") return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function providerResult(provider, { status, plan = null, windows = [], detail = null, source = null }, now = Date.now) {
  return {
    provider,
    status,
    plan: plan || null,
    windows: windows.filter(Boolean),
    detail: detail || null,
    source,
    fetchedAt: new Date(now()).toISOString(),
  };
}

module.exports = { STATUS, clampPercent, toIso, makeWindow, planLabel, decodeJwtPayload, providerResult };
