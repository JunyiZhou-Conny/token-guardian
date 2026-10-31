"use strict";

// Claude Code subscription limits (5-hour session and weekly windows).
//
// Reads the OAuth token Claude Code already stored on this Mac and asks Anthropic's usage
// endpoint for the current utilization. Read-only: this module never refreshes or rewrites
// credentials. If the token has expired, the user runs `claude` once and Claude Code refreshes it.
//
// The endpoint is the one Claude Code's own /usage view uses. It is not a documented public
// API and may change. Approach adapted from Javis603/token-monitor (MIT), commit b01f2f33.

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { STATUS, makeWindow, planLabel, providerResult } = require("../limits");

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const KEYCHAIN_SERVICE = "Claude Code-credentials";
const REQUEST_TIMEOUT_MS = 12_000;
const KEYCHAIN_TIMEOUT_MS = 5_000;

function runCommand(command, args, { timeout = KEYCHAIN_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout, encoding: "utf8" }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

// "default_claude_max_20x" -> "20x"
function tierSuffix(rateLimitTier) {
  const match = typeof rateLimitTier === "string" ? rateLimitTier.match(/(\d+x)$/i) : null;
  return match ? match[1].toLowerCase() : null;
}

function parseClaudeCredentials(text) {
  if (!text) return null;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const oauth = json?.claudeAiOauth;
  if (!oauth || typeof oauth.accessToken !== "string" || !oauth.accessToken) return null;
  const plan = planLabel(oauth.subscriptionType);
  const tier = tierSuffix(oauth.rateLimitTier);
  return { accessToken: oauth.accessToken, plan: plan && tier ? `${plan} ${tier}` : plan };
}

// Same lookup order as Claude Code: env token, then the credentials file, then the macOS Keychain.
async function readClaudeCredentials({ env, home, platform, readFile, run }) {
  if (env.CLAUDE_CODE_OAUTH_TOKEN) return { accessToken: env.CLAUDE_CODE_OAUTH_TOKEN, plan: null };

  const configDir = env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
  const fileText = await readFile(path.join(configDir, ".credentials.json"), "utf8").catch(() => null);
  const fromFile = parseClaudeCredentials(fileText);
  if (fromFile) return fromFile;

  if (platform === "darwin") {
    // The first read shows a macOS prompt; choose "Always Allow" so later refreshes stay quiet.
    const keychainText = await run("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"]).catch(() => null);
    return parseClaudeCredentials(keychainText);
  }
  return null;
}

function mapClaudeUsage(body) {
  return [
    makeWindow({ label: "5-hour", usedPercent: body?.five_hour?.utilization, resetsAt: body?.five_hour?.resets_at }),
    makeWindow({ label: "Weekly", usedPercent: body?.seven_day?.utilization, resetsAt: body?.seven_day?.resets_at }),
    makeWindow({ label: "Weekly (Opus)", usedPercent: body?.seven_day_opus?.utilization, resetsAt: body?.seven_day_opus?.resets_at }),
  ].filter(Boolean);
}

async function fetchClaudeLimits(deps = {}) {
  const {
    env = process.env,
    home = os.homedir(),
    platform = process.platform,
    readFile = fs.readFile,
    run = runCommand,
    fetch = globalThis.fetch,
    now = Date.now,
  } = deps;
  const result = (fields) => providerResult("claude", { source: "oauth", ...fields }, now);

  const creds = await readClaudeCredentials({ env, home, platform, readFile, run });
  if (!creds) return result({ status: STATUS.notConfigured });

  let response;
  try {
    response = await fetch(USAGE_URL, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${creds.accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "token-monitor (local, read-only)",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return result({ status: STATUS.unavailable, plan: creds.plan, detail: error?.name === "TimeoutError" ? "timeout" : "network" });
  }

  if (response.status === 401 || response.status === 403) return result({ status: STATUS.expired, plan: creds.plan });
  if (response.status === 429) return result({ status: STATUS.throttled, plan: creds.plan });
  if (!response.ok) return result({ status: STATUS.unavailable, plan: creds.plan, detail: `HTTP ${response.status}` });

  const body = await response.json().catch(() => null);
  const windows = mapClaudeUsage(body);
  if (!windows.length) return result({ status: STATUS.unavailable, plan: creds.plan, detail: "no usage windows" });
  return result({ status: STATUS.ok, plan: creds.plan, windows });
}

module.exports = { fetchClaudeLimits, readClaudeCredentials, parseClaudeCredentials, mapClaudeUsage, USAGE_URL, KEYCHAIN_SERVICE };
