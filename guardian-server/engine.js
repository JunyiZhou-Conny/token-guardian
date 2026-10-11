"use strict";

const crypto = require("node:crypto");

const SOURCES = ["codex", "claude", "cursor", "gemini"];
const MAX_EVENTS = 100_000;

function hash(value) { return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24); }
function clean(value, length = 240) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, length) || null : null;
}
function number(value, field, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) throw new Error(`${field} must be a finite, non-negative number.`);
  return n;
}
function money(value) {
  if (value === undefined || value === null || value === "" || value === "-") return null;
  return number(typeof value === "string" ? value.replace(/[$,]/g, "").trim() : value, "costUsd", null);
}
function billingKind(label) {
  const text = String(label || "").toLowerCase();
  if (/included|enterprise|subscription/.test(text)) return "included";
  if (/no charge|free/.test(text)) return "free";
  if (/on.?demand|usage.?based|pay.?as.?you.?go/.test(text)) return "on-demand";
  return "unknown";
}

function normalizeEvent(row, { defaultSource, grain = "event" } = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Each imported event must be a JSON object.");
  const source = String(row.source || defaultSource || "").trim().toLowerCase().replace(/^claude-code$/, "claude");
  if (!SOURCES.includes(source)) throw new Error(`Unsupported source '${clean(source) || "missing"}'. Use codex, claude, cursor or gemini.`);
  const date = new Date(row.timestamp || row.date || row.hour_start || "");
  if (!Number.isFinite(date.getTime())) throw new Error("Each event needs a valid timestamp.");
  const inputTokens = Math.floor(number(row.inputTokens ?? row.input_tokens, "inputTokens"));
  const outputTokens = Math.floor(number(row.outputTokens ?? row.output_tokens, "outputTokens"));
  const cachedTokens = Math.floor(number(row.cachedTokens ?? row.cached_input_tokens, "cachedTokens"));
  const cacheWriteTokens = Math.floor(number(row.cacheWriteTokens ?? row.cache_creation_input_tokens, "cacheWriteTokens"));
  const reasoningTokens = Math.floor(number(row.reasoningTokens ?? row.reasoning_output_tokens, "reasoningTokens"));
  const derivedTotal = inputTokens + outputTokens + cachedTokens + cacheWriteTokens;
  const suppliedTotal = row.totalTokens ?? row.total_tokens;
  // Prefer the source's total when supplied: reasoning can be an output subset.
  const totalTokens = Math.floor(number(suppliedTotal, "totalTokens", derivedTotal));
  if (totalTokens < derivedTotal) throw new Error("totalTokens cannot be smaller than input, output and cache token columns combined.");
  const costUsd = money(row.costUsd ?? row.reported_cost_usd);
  const sessionId = clean(row.sessionId ?? row.session_id);
  const automationId = clean(row.automationId ?? row.automation_id);
  const cloudAgentId = clean(row.cloudAgentId ?? row.cloud_agent_id);
  const project = clean(row.project ?? row.project_ref, 500);
  const eventGrain = row.grain === "bucket" ? "bucket" : grain;
  const knownAttribution = Boolean(sessionId || automationId || cloudAgentId || project);
  const event = {
    timestamp: date.toISOString(), source, model: clean(row.model) || "unknown",
    inputTokens, outputTokens, cachedTokens, cacheWriteTokens, reasoningTokens, totalTokens,
    costUsd, costType: costUsd === null ? "unknown" : row.costType === "estimated" ? "estimated" : "reported",
    billingLabel: clean(row.billingLabel ?? row.kind),
    billingKind: ["included", "on-demand", "free", "unknown"].includes(row.billingKind) ? row.billingKind : billingKind(row.billingLabel ?? row.kind),
    project, sessionId, automationId, cloudAgentId, requestId: clean(row.requestId ?? row.request_id),
    attribution: knownAttribution ? row.attribution === "inferred" ? "inferred" : "observed" : "unknown",
    grain: eventGrain,
    provenance: clean(row.provenance) || (eventGrain === "bucket" ? "tracker-aggregate" : "local-import"),
  };
  // Only this allowlist is retained; prompt/message/tool content never enters storage.
  const explicitId = clean(row.id ?? row.eventId) || event.requestId;
  // Without vendor request IDs, usage columns participate in identity so a
  // partial re-import cannot overwrite a different same-timestamp request.
  // Cost is excluded so billing corrections update the existing event.
  event._identity = explicitId ? `explicit:${source}:${explicitId}` : JSON.stringify([source, event.timestamp, event.model, sessionId, automationId, cloudAgentId, project, inputTokens, outputTokens, cachedTokens, cacheWriteTokens, totalTokens]);
  return event;
}

function identifyEvents(events) {
  const occurrences = new Map();
  return events.map((event) => {
    const identity = event._identity;
    const count = occurrences.get(identity) || 0;
    occurrences.set(identity, count + 1);
    const { _identity, ...safe } = event;
    return { id: `event-${hash(identity)}${identity.startsWith("explicit:") ? "" : `-${count}`}`, ...safe };
  });
}

function parseCsv(text) {
  if (typeof text !== "string") throw new Error("CSV data must be a string.");
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (!quoted && field.length > 0) throw new Error("Malformed CSV: a quote appears inside an unquoted field.");
      else quoted = !quoted;
    } else if (!quoted && char === ",") { row.push(field); field = ""; }
    else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field); if (row.some((v) => v.trim())) rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (quoted) throw new Error("Malformed CSV: an unclosed quoted field.");
  row.push(field); if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 2) throw new Error("CSV must contain a header and at least one usage row.");
  return rows;
}

function parseCursorCsv(text) {
  const rows = parseCsv(text);
  const columns = rows.shift().map((v) => v.replace(/^\uFEFF/, "").trim());
  if (new Set(columns).size !== columns.length) throw new Error("CSV has duplicate column names.");
  const required = ["Date", "Model", "Input (w/ Cache Write)", "Input (w/o Cache Write)", "Cache Read", "Output Tokens"];
  const missing = required.filter((key) => !columns.includes(key));
  if (missing.length) throw new Error(`Not a supported Cursor usage export. Missing columns: ${missing.join(", ")}.`);
  if (rows.length > MAX_EVENTS) throw new Error(`Import is limited to ${MAX_EVENTS} events.`);
  return identifyEvents(rows.map((fields, index) => {
    if (fields.length !== columns.length) throw new Error(`CSV row ${index + 2} has ${fields.length} fields; expected ${columns.length}.`);
    const raw = Object.fromEntries(columns.map((key, i) => [key, fields[i].trim()]));
    try {
      const inputWithout = number(raw["Input (w/o Cache Write)"], "Input (w/o Cache Write)");
      const inputWith = number(raw["Input (w/ Cache Write)"], "Input (w/ Cache Write)");
      return normalizeEvent({
        timestamp: raw.Date, source: "cursor", model: raw.Model,
        // Cursor sometimes exports zero as the cache-write-inclusive sentinel.
        // Match upstream: a negative difference represents no observed writes.
        inputTokens: inputWithout, cacheWriteTokens: Math.max(0, inputWith - inputWithout),
        cachedTokens: raw["Cache Read"], outputTokens: raw["Output Tokens"],
        totalTokens: raw["Total Tokens"], costUsd: raw.Cost,
        automationId: raw["Automation ID"], cloudAgentId: raw["Cloud Agent ID"],
        sessionId: raw["Session ID"] || raw["Conversation ID"], requestId: raw["Request ID"],
        project: raw.Project, billingLabel: raw.Kind, provenance: "cursor-account-csv",
      });
    } catch (error) { throw new Error(`CSV row ${index + 2}: ${error.message}`); }
  }));
}

function parseEventJson(data) {
  let rows = data;
  if (typeof data === "string") {
    try { rows = JSON.parse(data); }
    catch { throw new Error("JSON import must contain a valid JSON array or an object with an events array."); }
  }
  if (rows && !Array.isArray(rows)) rows = rows.events;
  if (!Array.isArray(rows) || !rows.length) throw new Error("JSON import needs a non-empty events array.");
  if (rows.length > MAX_EVENTS) throw new Error(`Import is limited to ${MAX_EVENTS} events.`);
  return identifyEvents(rows.map((row, i) => {
    try { return normalizeEvent(row); }
    catch (error) { throw new Error(`JSON event ${i + 1}: ${error.message}`); }
  }));
}

function latestTrackerBuckets(rows) {
  const latest = new Map();
  const diagnostics = { unsupportedRows: 0, malformedRows: 0 };
  for (const row of rows) {
    if (!row || typeof row !== "object" || !SOURCES.includes(String(row.source).toLowerCase())) { diagnostics.unsupportedRows++; continue; }
    try {
      const event = normalizeEvent(row, { grain: "bucket" });
      const key = JSON.stringify([event.source, event.model, event.timestamp]);
      const { _identity, ...safe } = event;
      latest.set(key, { id: `bucket-${hash(key)}`, ...safe, attribution: "unknown", project: null, sessionId: null, automationId: null, cloudAgentId: null, requestId: null });
    } catch { diagnostics.malformedRows++; }
  }
  return { events: [...latest.values()], diagnostics };
}

function totals(events) {
  const summary = { totalTokens: 0, reportedCostUsd: 0, estimatedCostUsd: 0, includedCostUsd: 0, knownChargedCostUsd: 0, unknownCostEvents: 0, eventCount: events.length, requestCount: events.some((e) => e.grain === "bucket") ? null : events.length };
  for (const event of events) {
    summary.totalTokens += event.totalTokens;
    if (event.costUsd === null) summary.unknownCostEvents++;
    else if (event.costType === "estimated") summary.estimatedCostUsd += event.costUsd;
    else {
      summary.reportedCostUsd += event.costUsd;
      if (event.billingKind === "included") summary.includedCostUsd += event.costUsd;
      if (event.billingKind === "on-demand") summary.knownChargedCostUsd += event.costUsd;
    }
  }
  for (const key of ["reportedCostUsd", "estimatedCostUsd", "includedCostUsd", "knownChargedCostUsd"]) summary[key] = Math.round(summary[key] * 1e6) / 1e6;
  return summary;
}
function summarize(events) {
  const dates = events.map((e) => e.timestamp).sort();
  return { ...totals(events), sourceTotals: SOURCES.map((source) => ({ source, ...totals(events.filter((e) => e.source === source)) })), period: { start: dates[0] || null, end: dates.at(-1) || null } };
}
function median(values) { const sorted = [...values].sort((a, b) => a - b); const i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; }

function detectIncidents(events) {
  // Account buckets contain no request cadence; never apply raw-event rules to them.
  const raw = events.filter((e) => e.grain === "event" && e.totalTokens > 0).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const groups = new Map();
  for (const event of raw) {
    const identity = event.automationId ? `automation:${event.automationId}` : event.cloudAgentId ? `agent:${event.cloudAgentId}` : event.sessionId ? `session:${event.sessionId}` : null;
    if (!identity) continue;
    const key = `${event.source}:${identity}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const incidents = [];
  for (const [key, group] of groups) {
    const gaps = group.slice(1).map((e, i) => (Date.parse(e.timestamp) - Date.parse(group[i].timestamp)) / 60_000).filter((gap) => gap > 0);
    if (gaps.length < 4) continue;
    const cadence = median(gaps);
    const regular = gaps.filter((gap) => Math.abs(gap - cadence) <= Math.max(2 / 60, cadence * 0.1)).length;
    if (cadence < 1 || cadence > 360 || regular / gaps.length < 0.8) continue;
    const knownAutomation = Boolean(group[0].automationId);
    const sum = totals(group);
    const confidence = knownAutomation && group.every((e) => e.attribution === "observed") ? "observed" : "inferred";
    incidents.push({
      id: `incident-${hash(`cadence:${key}`)}`, type: "recurring-automation", severity: sum.totalTokens >= 500_000 ? "critical" : "warning",
      title: knownAutomation ? "Recurring automation consumption" : "A session has a regular usage pattern",
      description: `${group.length} observed usage events recur about every ${Math.round(cadence * 10) / 10} minutes. ${knownAutomation ? "The export identifies the automation; verify whether this schedule is intended." : "The timing suggests a recurring process; it does not prove an unwanted automation."}`,
      source: group[0].source, automationId: group[0].automationId, confidence,
      evidenceIds: group.map((e) => e.id), startedAt: group[0].timestamp, lastSeenAt: group.at(-1).timestamp,
      totalTokens: sum.totalTokens, reportedCostUsd: sum.reportedCostUsd, estimatedCostUsd: sum.estimatedCostUsd,
      cadenceMinutes: Math.round(cadence * 10) / 10, action: "investigate",
      limits: ["Recurring usage can be intentional.", "The tracker cannot pause or stop this process.", ...(knownAutomation ? [] : ["No automation ID identifies a scheduler."])],
    });
  }
  const byModel = new Map();
  const spikeGroups = new Map();
  for (const event of raw) {
    const key = `${event.source}:${event.model}`;
    const previous = byModel.get(key) || [];
    const baseline = previous.length >= 5 ? median(previous.slice(-20).map((e) => e.totalTokens)) : null;
    if (baseline && event.totalTokens >= Math.max(100_000, baseline * 4)) {
      const evidence = [...previous.slice(-5), event];
      const spikeKey = `${key}:${event.automationId || event.cloudAgentId || event.sessionId || "unattributed"}`;
      const existing = spikeGroups.get(spikeKey);
      if (existing && Date.parse(event.timestamp) - Date.parse(existing.startedAt) <= 60 * 60_000) {
        existing.spikeRequestCount++;
        existing.evidenceIds = [...new Set([...existing.evidenceIds, event.id])];
        existing.lastSeenAt = event.timestamp;
        existing.totalTokens += event.totalTokens;
        existing.title = "A burst used unusually many tokens";
        if (existing.totalTokens >= 1_000_000) existing.severity = "critical";
        if (event.costType === "reported") existing.reportedCostUsd += event.costUsd || 0;
        if (event.costType === "estimated") existing.estimatedCostUsd += event.costUsd || 0;
        existing.description = `${existing.spikeRequestCount} requests exceeded four times their preceding recent ${event.model} median and the 100,000-token floor. They used ${existing.totalTokens.toLocaleString("en-US")} tokens in total. Larger contexts can be legitimate; inspect this session or automation.`;
      } else {
        const incident = {
          id: `incident-${hash(`spike:${event.id}`)}`, type: "usage-spike", severity: event.totalTokens >= 1_000_000 ? "critical" : "warning",
          title: "A request used unusually many tokens",
          description: `${event.totalTokens.toLocaleString("en-US")} tokens is ${(event.totalTokens / baseline).toFixed(1)}× the median of recent ${event.model} events. A larger context can be legitimate; inspect the identified session or automation.`,
          source: event.source, automationId: event.automationId, confidence: "inferred",
          evidenceIds: evidence.map((e) => e.id), startedAt: event.timestamp, lastSeenAt: event.timestamp,
          totalTokens: event.totalTokens, reportedCostUsd: event.costType === "reported" ? event.costUsd || 0 : 0, estimatedCostUsd: event.costType === "estimated" ? event.costUsd || 0 : 0,
          cadenceMinutes: null, spikeRequestCount: 1, action: "investigate", limits: ["A spike does not prove a runaway task.", "The tracker cannot pause or stop this process."],
        };
        incidents.push(incident); spikeGroups.set(spikeKey, incident);
      }
    }
    previous.push(event); byModel.set(key, previous);
  }
  return incidents.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

function demoEvents(now = Date.now()) {
  const rows = [];
  const workOffsets = [0, 5, 16, 22, 37, 50];
  for (const [i, source] of SOURCES.entries()) {
    for (let j = 0; j < 6; j++) rows.push({
      id: `${source}-work-${j}`, timestamp: new Date(now - (170 - workOffsets[j] + i * 3) * 60_000).toISOString(), source,
      model: { codex: "gpt-5", claude: "claude-sonnet-4", cursor: "claude-sonnet-4", gemini: "gemini-2.5-pro" }[source],
      inputTokens: 2400 + i * 900 + j * 220, outputTokens: 650 + j * 90, cachedTokens: 800,
      costUsd: 0.028 + i * 0.012 + j * 0.007, costType: "estimated", billingKind: "unknown",
      project: ["Guild website", "Design experiments", "Job applications", "Study notes"][i], sessionId: `${source}-demo-session`, provenance: "simulation",
    });
  }
  for (let j = 0; j < 7; j++) rows.push({
    id: `cursor-automation-${j}`, timestamp: new Date(now - (60 - j * 10) * 60_000).toISOString(), source: "cursor", model: "claude-sonnet-4",
    inputTokens: 125_000, outputTokens: 7800, cachedTokens: 32_000, costUsd: 0.56, costType: "reported", billingKind: "included", billingLabel: "Included in Pro",
    project: null, sessionId: null, automationId: "demo-job-board-review", cloudAgentId: "demo-cloud-agent", provenance: "simulation",
  });
  return identifyEvents(rows.map((row) => normalizeEvent(row)));
}

function explain(message, snapshot) {
  const { summary, events, incidents, mode } = snapshot;
  const prefix = mode === "demo" ? "This is a simulated example, not your usage. " : "Based on locally available usage metadata: ";
  const evidenceIds = [];
  let answer;
  if (/stop|pause|kill|turn off|shut.?down/i.test(message)) {
    answer = "This version can investigate and explain usage, but it cannot stop an app or automation. Open the originating app's automation settings and verify its schedule before disabling it.";
  } else if (/why|drain|burn|automation|recurr|incident|spike|wast|happen/i.test(message) && incidents.length) {
    const incident = incidents[0];
    evidenceIds.push(...incident.evidenceIds);
    answer = `${incident.description} Those events used ${incident.totalTokens.toLocaleString("en-US")} tokens${incident.reportedCostUsd ? ` with $${incident.reportedCostUsd.toFixed(2)} in provider-reported usage value (this is not necessarily an extra charge)` : ""}. ${incident.automationId ? `Automation ID: ${incident.automationId}. ` : ""}Attribution confidence: ${incident.confidence}. ${incident.limits.join(" ")}`;
  } else if (/conversation|session|project|trace|where/i.test(message)) {
    const attributed = events.filter((e) => e.sessionId || e.automationId || e.cloudAgentId || e.project);
    const biggest = [...attributed].sort((a, b) => b.totalTokens - a.totalTokens)[0];
    if (biggest) {
      evidenceIds.push(biggest.id);
      answer = `The largest attributed event used ${biggest.totalTokens.toLocaleString("en-US")} tokens in ${biggest.source}. ${biggest.automationId ? `Automation ID: ${biggest.automationId}. ` : ""}${biggest.sessionId ? `Session ID: ${biggest.sessionId}. ` : ""}${biggest.project ? `Project: ${biggest.project}. ` : ""}These identifiers come from imported or local metadata. Timestamp similarity alone cannot identify a conversation.`;
    } else answer = "The available data has no session, project or automation identifiers. Account usage buckets can show when and which model used tokens, but cannot recover a conversation. Import a current Cursor usage CSV and check whether Automation ID or Cloud Agent ID is populated, or supply normalized event metadata.";
  } else {
    const source = [...summary.sourceTotals].sort((a, b) => b.totalTokens - a.totalTokens)[0];
    answer = events.length ? `${summary.totalTokens.toLocaleString("en-US")} tokens are recorded across ${summary.sourceTotals.filter((s) => s.eventCount).length} apps in this dataset. ${source.source} has the most usage: ${source.totalTokens.toLocaleString("en-US")} tokens. ${incidents.length ? `${incidents.length} patterns merit investigation. ` : "No raw-event pattern crossed the current investigation thresholds. "}Reported usage value is $${summary.reportedCostUsd.toFixed(2)}; estimated usage value is $${summary.estimatedCostUsd.toFixed(2)}. ${summary.unknownCostEvents} records have unknown cost. Subscription allowance, estimated value and extra charges are separate measures.` : "No supported local usage records were found. Start the upstream tracker or import a Cursor CSV or normalized metadata events to inspect your usage.";
    evidenceIds.push(...events.slice(-8).map((e) => e.id));
  }
  if (events.some((e) => e.grain === "bucket")) answer += " Thirty-minute account buckets are excluded from recurrence and request-spike detection.";
  return { answer: prefix + answer, mode: "local", evidenceIds: [...new Set(evidenceIds)].slice(0, 30) };
}

module.exports = { SOURCES, MAX_EVENTS, hash, clean, normalizeEvent, identifyEvents, parseCsv, parseCursorCsv, parseEventJson, latestTrackerBuckets, summarize, detectIncidents, demoEvents, explain };
