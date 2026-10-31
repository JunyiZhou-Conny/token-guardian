"use strict";

// Codex (ChatGPT plan) limits: the 5-hour and weekly windows shown in Codex itself.
//
// First choice: read the ChatGPT sign-in Codex stored in ~/.codex/auth.json and call the same
// usage endpoint the Codex app uses. Only when there is no usable auth.json (for example, Codex
// keeps its sign-in in the system keyring) do we ask the local Codex CLI through its app-server
// JSON-RPC (`account/rateLimits/read`); the CLI manages its own sign-in. We never start the CLI to
// work around a rejected sign-in, and auth.json is never rewritten. Neither interface is a
// documented public API.
// Approach adapted from Javis603/token-monitor (MIT), commits b01f2f33 and cc79febc.

const fs = require("node:fs/promises");
const { existsSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { STATUS, makeWindow, planLabel, decodeJwtPayload, providerResult } = require("../limits");

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const REQUEST_TIMEOUT_MS = 12_000;
const RPC_TIMEOUT_MS = 12_000;
const FIVE_HOURS_S = 5 * 60 * 60;
const ONE_WEEK_S = 7 * 24 * 60 * 60;

async function readCodexAuth({ env, home, readFile }) {
  const codexHome = env.CODEX_HOME || path.join(home, ".codex");
  const text = await readFile(path.join(codexHome, "auth.json"), "utf8").catch(() => null);
  if (!text) return null;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const tokens = json?.tokens;
  if (!tokens || typeof tokens.access_token !== "string" || !tokens.access_token) return null;
  const claims = decodeJwtPayload(tokens.id_token)?.["https://api.openai.com/auth"] || {};
  return {
    accessToken: tokens.access_token,
    accountId: tokens.account_id || claims.chatgpt_account_id || null,
    plan: planLabel(claims.chatgpt_plan_type),
  };
}

// Number(null) and Number("") are 0, which would turn "unknown" into "resets now".
function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Label a window by its length, not its slot: free plans can put the weekly window in "primary".
function windowLabel(seconds, slot) {
  if (Number.isFinite(seconds) && seconds > 0) {
    if (seconds >= ONE_WEEK_S) return "Weekly";
    if (seconds === FIVE_HOURS_S) return "5-hour";
    if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}-min`;
    const hours = Math.round(seconds / 3600);
    return hours >= 24 ? `${Math.round(hours / 24)}-day` : `${hours}-hour`;
  }
  return slot === "primary" ? "5-hour" : "Weekly";
}

function mapWhamUsage(body, now = Date.now) {
  const rateLimit = body?.rate_limit || {};
  return ["primary", "secondary"].map((slot) => {
    const window = rateLimit[`${slot}_window`];
    if (!window) return null;
    const seconds = Number(window.limit_window_seconds);
    const after = toNumberOrNull(window.reset_after_seconds);
    const resetsAt = window.reset_at ?? (after === null ? null : now() + after * 1000);
    return makeWindow({ label: windowLabel(seconds, slot), usedPercent: window.used_percent, resetsAt });
  }).filter(Boolean);
}

function mapRpcRateLimits(result) {
  const limits = result?.rateLimits || result?.rate_limits || result?.rateLimitsByLimitId?.codex || {};
  const windows = ["primary", "secondary"].map((slot) => {
    const window = limits[slot];
    if (!window) return null;
    const minutes = Number(window.windowDurationMins ?? window.window_duration_mins);
    return makeWindow({
      label: windowLabel(minutes * 60, slot),
      usedPercent: window.usedPercent ?? window.used_percent,
      resetsAt: window.resetsAt ?? window.resets_at,
    });
  }).filter(Boolean);
  return { windows, plan: planLabel(limits.planType, limits.plan_type) };
}

async function fetchViaHttp(auth, { fetch, now }) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${auth.accessToken}`,
    "User-Agent": "token-monitor (local, read-only)",
  };
  if (auth.accountId) headers["ChatGPT-Account-Id"] = auth.accountId;

  let response;
  try {
    response = await fetch(USAGE_URL, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    return { status: STATUS.unavailable, detail: error?.name === "TimeoutError" ? "timeout" : "network" };
  }
  if (response.status === 401) return { status: STATUS.expired };
  if (response.status === 403) return { status: STATUS.unavailable, detail: "no permission to read usage" };
  if (response.status === 429) return { status: STATUS.throttled };
  if (!response.ok) return { status: STATUS.unavailable, detail: `HTTP ${response.status}` };

  const body = await response.json().catch(() => null);
  const windows = mapWhamUsage(body, now);
  if (!windows.length) return { status: STATUS.unavailable, detail: "no usage windows" };
  return { status: STATUS.ok, windows, plan: planLabel(body?.plan_type) };
}

function codexCommands({ env, platform, exists }) {
  if (env.TOKEN_MONITOR_CODEX_COMMAND) return [env.TOKEN_MONITOR_CODEX_COMMAND];
  const app = "/Applications/Codex.app/Contents/Resources/codex";
  return [platform === "darwin" && exists(app) ? app : null, "codex"].filter(Boolean);
}

// Apps opened from Finder get a minimal PATH; add the usual CLI install locations.
function withPathHints(env, home) {
  const hints = ["/opt/homebrew/bin", "/usr/local/bin", path.join(home, ".local", "bin"), path.join(home, ".npm-global", "bin")];
  return { ...env, PATH: [...hints, ...(env.PATH || "").split(path.delimiter)].filter(Boolean).join(path.delimiter) };
}

// Minimal newline-delimited JSON-RPC client for `codex app-server`.
function readRateLimitsOverRpc(command, { env, home, spawnFn, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawnFn(command, ["-s", "read-only", "-a", "untrusted", "app-server"], {
      env: withPathHints(env, home),
      stdio: ["pipe", "pipe", "ignore"],
    });
    const pending = new Map();
    let nextId = 1;
    let buffer = "";
    const timer = setTimeout(() => finish(new Error("timeout")), timeoutMs);

    function finish(error, value) {
      clearTimeout(timer);
      pending.clear();
      try { child.kill("SIGTERM"); } catch { /* already exited */ }
      if (error) reject(error);
      else resolve(value);
    }
    function send(method, params) {
      const id = nextId++;
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      return new Promise((res, rej) => pending.set(id, { res, rej }));
    }

    child.on("error", (error) => finish(error));
    child.on("close", () => finish(new Error("codex app-server exited")));
    child.stdin.on("error", () => { /* reported through close */ });
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index;
      while ((index = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        const waiter = pending.get(message?.id);
        if (!waiter) continue;
        pending.delete(message.id);
        if (message.error) waiter.rej(new Error(message.error.message || "rpc error"));
        else waiter.res(message.result);
      }
    });

    (async () => {
      await send("initialize", { clientInfo: { name: "token-monitor", title: "Token Monitor", version: "0.1.0" } });
      child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
      return send("account/rateLimits/read");
    })().then((value) => finish(null, value), (error) => finish(error));
  });
}

async function fetchViaAppServer({ env, home, platform, exists, spawnFn, timeoutMs }) {
  for (const command of codexCommands({ env, platform, exists })) {
    try {
      const { windows, plan } = mapRpcRateLimits(await readRateLimitsOverRpc(command, { env, home, spawnFn, timeoutMs }));
      if (windows.length) return { status: STATUS.ok, windows, plan };
    } catch {
      // Try the next install location.
    }
  }
  return null;
}

async function fetchCodexLimits(deps = {}) {
  const {
    env = process.env,
    home = os.homedir(),
    platform = process.platform,
    readFile = fs.readFile,
    exists = existsSync,
    spawnFn = spawn,
    fetch = globalThis.fetch,
    now = Date.now,
    rpcTimeoutMs = RPC_TIMEOUT_MS,
  } = deps;

  const auth = await readCodexAuth({ env, home, readFile });
  if (auth) {
    const http = await fetchViaHttp(auth, { fetch, now });
    return providerResult("codex", { source: "chatgpt", ...http, plan: http.plan || auth.plan }, now);
  }

  const rpc = await fetchViaAppServer({ env, home, platform, exists, spawnFn, timeoutMs: rpcTimeoutMs });
  if (rpc) return providerResult("codex", { source: "codex-cli", ...rpc }, now);
  return providerResult("codex", { status: STATUS.notConfigured }, now);
}

module.exports = { fetchCodexLimits, readCodexAuth, mapWhamUsage, mapRpcRateLimits, windowLabel, USAGE_URL };
