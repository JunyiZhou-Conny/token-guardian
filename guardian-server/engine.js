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

const TOKEN_FIELDS = ["inputTokens", "outputTokens", "cachedTokens", "cacheWriteTokens", "reasoningTokens", "totalTokens"];
const SESSION_TOKEN_FIELDS = [...TOKEN_FIELDS, "input_tokens", "output_tokens", "cached_input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "reasoning_output_tokens", "total_tokens"];
function hasSessionTokens(value) {
  return Boolean(value && typeof value === "object" && SESSION_TOKEN_FIELDS.some((field) => value[field] !== undefined && value[field] !== null && value[field] !== ""));
}
function tokenColumns(rows) {
  return Object.fromEntries(TOKEN_FIELDS.map((field) => [field, rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0)]));
}
function isoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
function sessionTokens(value = {}) {
  const inputTokens = Math.floor(number(value.inputTokens ?? value.input_tokens, "inputTokens"));
  const outputTokens = Math.floor(number(value.outputTokens ?? value.output_tokens, "outputTokens"));
  const cachedTokens = Math.floor(number(value.cachedTokens ?? value.cached_input_tokens ?? value.cache_read_input_tokens, "cachedTokens"));
  const cacheWriteTokens = Math.floor(number(value.cacheWriteTokens ?? value.cache_creation_input_tokens, "cacheWriteTokens"));
  const reasoningTokens = Math.floor(number(value.reasoningTokens ?? value.reasoning_output_tokens, "reasoningTokens"));
  // Upstream Claude/Codex session totals already include reasoning in output.
  const totalTokens = Math.floor(number(value.totalTokens ?? value.total_tokens, "totalTokens", inputTokens + outputTokens + cachedTokens + cacheWriteTokens));
  return { inputTokens, outputTokens, cachedTokens, cacheWriteTokens, reasoningTokens, totalTokens };
}
function sessionModelRows(rows) {
  const byModel = new Map();
  for (const row of rows) {
    const model = clean(row?.model) || "unknown";
    const tokens = sessionTokens(row);
    const costUsd = money(row?.costUsd ?? row?.cost_usd);
    const prior = byModel.get(model);
    if (!prior) byModel.set(model, { model, ...tokens, costUsd, costType: costUsd === null ? "unknown" : "estimated" });
    else {
      for (const field of TOKEN_FIELDS) prior[field] += tokens[field];
      prior.costUsd = prior.costUsd === null || costUsd === null ? null : prior.costUsd + costUsd;
      if (prior.costUsd === null) prior.costType = "unknown";
    }
  }
  return [...byModel.values()].sort((a, b) => b.totalTokens - a.totalTokens || a.model.localeCompare(b.model));
}

function normalizeSessionSnapshot(row) {
  if (!row || !SOURCES.includes(row.source)) throw new Error("Unsupported local session source.");
  const sessionId = clean(row.session_id ?? row.sessionId);
  const sessionHash = clean(row.session_hash ?? row.sessionHash);
  if (!sessionId && !sessionHash) throw new Error("Local session metadata needs an observed ID or hash.");
  const identity = JSON.stringify([row.source, sessionId ? "id" : "hash", sessionId || sessionHash]);
  const models = sessionModelRows(Array.isArray(row.model_usage) ? row.model_usage : []);
  const hasAggregateTokens = hasSessionTokens(row.tokens);
  const usageAvailable = hasSessionTokens(row) || hasAggregateTokens || (Array.isArray(row.model_usage) && row.model_usage.some(hasSessionTokens));
  const aggregate = hasAggregateTokens ? row.tokens : models.length ? tokenColumns(models) : row;
  const tokens = sessionTokens({ ...aggregate, totalTokens: row.total_tokens ?? row.totalTokens ?? aggregate.totalTokens ?? aggregate.total_tokens });
  let startedAt = isoTimestamp(row.started_at ?? row.startedAt);
  let endedAt = isoTimestamp(row.ended_at ?? row.endedAt);
  const notes = ["Latest local session snapshot; its totals overlap account usage and are not added to it."];
  if (startedAt && endedAt && startedAt > endedAt) { startedAt = null; endedAt = null; notes.push("The snapshot's time range is invalid; time coverage is unknown."); }
  if (!startedAt || !endedAt) notes.push("The session's complete time range is unavailable.");
  if (!sessionId) notes.push("A local session hash is present; the vendor's resumable session ID is unavailable.");
  const providerReported = row.cost_source === "provider_reported";
  const costUsd = money(providerReported ? row.provider_cost_usd ?? row.cost_usd : row.cost_usd);
  const costIsPartial = Boolean(row.cost_is_partial);
  if (costIsPartial) notes.push("The session cost is a known lower bound because some model usage is unpriced.");
  if (models.length && models.reduce((sum, model) => sum + model.totalTokens, 0) !== tokens.totalTokens) notes.push("Model breakdown and session total differ; the stored session total is retained without summing the two.");
  const evidenceId = `sidecar-${hash(JSON.stringify([identity, tokens, models, costUsd, costIsPartial, startedAt, endedAt]))}`;
  const model = models.length > 1 ? "mixed" : models[0]?.model || clean(row.model) || "unknown";
  const usableModels = models.length ? models : [{ model, ...tokens, costUsd, costType: costUsd === null ? "unknown" : providerReported ? "reported" : "estimated" }];
  if (providerReported && usableModels.length === 1 && costUsd !== null) { usableModels[0].costUsd = costUsd; usableModels[0].costType = "reported"; }
  return {
    id: `session-${hash(identity)}`, source: row.source, sessionId, sessionHash,
    title: clean(row.title), project: clean(row.project_ref ?? row.project, 500),
    model, models: usableModels, ...tokens, totalTokens: usageAvailable ? tokens.totalTokens : null, usageAvailable,
    reportedCostUsd: providerReported ? costUsd || 0 : 0, estimatedCostUsd: providerReported ? 0 : costUsd || 0,
    includedCostUsd: 0, knownChargedCostUsd: 0, unknownCostEvents: costUsd === null || costIsPartial ? 1 : 0,
    costUsd, costType: costUsd === null ? "unknown" : providerReported ? "reported" : "estimated", costIsPartial,
    billingKind: "unknown", eventCount: null, requestCount: null, turns: row.turns === undefined ? null : Math.floor(number(row.turns, "turns")),
    activeMs: row.active_ms === undefined ? null : number(row.active_ms, "active_ms"),
    eventIds: [], evidenceIds: [evidenceId], startedAt, endedAt, period: { start: startedAt, end: endedAt },
    basis: "session-sidecar", identification: sessionId ? "session-id" : "session-hash", attribution: row.provenance?.confidence === "inferred" ? "inferred" : "observed",
    coverage: { scope: "session-snapshot", notes }, recommendations: [],
    note: "Local session metadata; not linked to account buckets by timestamps alone.",
  };
}

function aggregateRawGroup(rows, identity, fields = {}) {
  const summary = totals(rows);
  const costTypes = new Set(rows.filter((event) => event.costUsd !== null).map((event) => event.costType));
  const costType = summary.unknownCostEvents ? "unknown" : costTypes.size > 1 ? "mixed" : [...costTypes][0] || "unknown";
  const byModel = new Map();
  for (const event of rows) {
    if (!byModel.has(event.model)) byModel.set(event.model, []);
    byModel.get(event.model).push(event);
  }
  const models = [...byModel.entries()].map(([model, values]) => {
    const cost = totals(values);
    const types = new Set(values.filter((event) => event.costUsd !== null).map((event) => event.costType));
    const costType = cost.unknownCostEvents ? "unknown" : types.size > 1 ? "mixed" : [...types][0] || "unknown";
    return { model, ...tokenColumns(values), ...cost, costUsd: ["reported", "estimated"].includes(costType) ? cost.reportedCostUsd + cost.estimatedCostUsd : null, costType };
  }).sort((a, b) => b.totalTokens - a.totalTokens || a.model.localeCompare(b.model));
  const dates = rows.map((event) => event.timestamp).sort();
  const projects = [...new Set(rows.map((event) => event.project).filter(Boolean))];
  const eventIds = rows.map((event) => event.id);
  return {
    id: `session-${hash(identity)}`, source: rows[0].source, sessionId: null, sessionHash: null, title: null,
    project: projects.length === 1 ? projects[0] : null, projects, model: models.length > 1 ? "mixed" : models[0]?.model || "unknown", models,
    ...tokenColumns(rows), ...summary, costUsd: ["reported", "estimated"].includes(costType) ? summary.reportedCostUsd + summary.estimatedCostUsd : null, costType, costIsPartial: summary.unknownCostEvents > 0, usageAvailable: true,
    eventIds, evidenceIds: eventIds, startedAt: dates[0] || null, endedAt: dates.at(-1) || null, period: { start: dates[0] || null, end: dates.at(-1) || null },
    basis: "raw-events", attribution: rows.every((event) => event.attribution === "observed") ? "observed" : "inferred",
    coverage: { scope: "observed-events", notes: ["Only directly attributed request records in the available dataset are included; missing requests are not inferred."] },
    recommendations: [], ...fields,
  };
}

function sessionRecommendations(entry, incidents = []) {
  const evidenceIds = entry.evidenceIds.slice(0, 12);
  const recommendations = [];
  const add = (type, title, detail, confidence = "inferred", ids = evidenceIds) => recommendations.push({ id: `recommendation-${hash(`${entry.id}:${type}`)}`, type, title, detail, evidenceIds: ids, confidence, action: "investigate", automated: false, savingsUsd: null });
  add("inspect-session", "Inspect the recorded session", "Open this session in its originating app and inspect recent requests and task settings. A high token count alone does not show whether the work was unnecessary.", entry.attribution === "observed" ? "observed" : "inferred");
  const recurring = incidents.find((incident) => incident.type === "recurring-automation" && incident.evidenceIds.some((id) => entry.eventIds.includes(id)));
  if (recurring || entry.automationId || entry.cloudAgentId) add("inspect-scheduler", "Review the task schedule", "Verify the originating app's polling schedule and whether repeated runs are intended before changing it. The tracker cannot stop the process.", recurring?.confidence || "inferred", recurring?.evidenceIds.slice(0, 12) || evidenceIds);
  if (entry.inputTokens >= 5000 && (entry.eventCount >= 2 || entry.eventIds.length >= 2 || entry.turns >= 2)) add("review-context", "Review repeated context and caching", "Check whether requests resend the same context. Trim irrelevant material or use provider-supported caching where the task allows. Token counts do not prove that prompt content repeated.");
  if (entry.models.some((model) => model.model !== "unknown" && model.totalTokens > 0)) add("compare-model", "Compare a model for routine steps", "Try a lower-cost model for routine steps and compare correctness on the same task. Verify model availability and the app's billing; these records do not establish exact savings.");
  if (entry.unknownCostEvents || entry.costIsPartial) add("verify-billing", "Check the provider's billing view", "Some costs are unknown or partially priced. Confirm included allowance and any extra charges in the provider's billing dashboard before treating usage value as cash spend.", "observed");
  return recommendations;
}

function buildSessionInsights(events, sidecarSessions = [], incidents = []) {
  const raw = events.filter((event) => event.grain === "event");
  const groups = new Map();
  for (const event of raw) {
    if (!event.sessionId) continue;
    const key = JSON.stringify([event.source, "id", event.sessionId]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const rawSessions = [...groups.entries()].map(([key, rows]) => aggregateRawGroup(rows, key, { sessionId: rows[0].sessionId, identification: "session-id" }));
  const sidecars = sidecarSessions.map((entry) => ({ ...entry, id: entry.insightId || entry.id, coverage: { ...entry.coverage, notes: [...entry.coverage.notes] } }));
  const ranked = new Map(rawSessions.map((entry) => [entry.id, entry]));
  for (const sidecar of sidecars) {
    const observed = ranked.get(sidecar.id);
    if (!observed) { ranked.set(sidecar.id, sidecar); continue; }
    const coversTime = sidecar.startedAt && sidecar.endedAt && sidecar.startedAt <= observed.startedAt && sidecar.endedAt >= observed.endedAt;
    if (sidecar.usageAvailable && sidecar.totalTokens >= observed.totalTokens && coversTime) {
      ranked.set(sidecar.id, { ...sidecar, eventIds: observed.eventIds, evidenceIds: [...sidecar.evidenceIds, ...observed.evidenceIds], rawObservedTokens: observed.totalTokens,
        coverage: { ...sidecar.coverage, notes: [...sidecar.coverage.notes, "Matching raw session requests overlap this snapshot and are not added again."] } });
    } else {
      ranked.set(observed.id, { ...observed, title: sidecar.title, project: observed.project || (observed.projects.length > 1 ? null : sidecar.project), sessionHash: sidecar.sessionHash,
        coverage: { ...observed.coverage, notes: [...observed.coverage.notes, "The sidecar is stale, has narrower or unknown time coverage, or conflicts with observed request usage. The raw count is ranked; the separate snapshot is not added."] } });
    }
  }
  const rank = (rows) => rows.sort((a, b) => (b.totalTokens ?? -1) - (a.totalTokens ?? -1) || a.id.localeCompare(b.id));
  const rankedSessions = rank([...ranked.values()]).map((entry, index) => ({ ...entry, rank: index + 1, recommendations: sessionRecommendations(entry, incidents) }));
  const groupRaw = (field, type) => {
    const byId = new Map();
    for (const event of raw) {
      const value = event[field];
      if (!value) continue;
      const key = JSON.stringify([event.source, field, value]);
      if (!byId.has(key)) byId.set(key, []);
      byId.get(key).push(event);
    }
    return rank([...byId.entries()].map(([key, rows]) => {
      const entry = aggregateRawGroup(rows, key, { [field]: rows[0][field], identification: type });
      entry.id = `${type}-${hash(key)}`;
      entry.recommendations = sessionRecommendations(entry, incidents);
      return entry;
    }));
  };
  const projects = groupRaw("project", "project");
  const automationEventIds = new Set(raw.filter((event) => event.automationId).map((event) => event.id));
  const automations = [...groupRaw("automationId", "automation"), ...groupRaw("cloudAgentId", "cloud-agent").filter((entry) => !entry.eventIds.every((id) => automationEventIds.has(id)))];
  rank(automations);
  const accountTotalTokens = events.reduce((sum, event) => sum + event.totalTokens, 0);
  const rawSessionTokens = raw.filter((event) => event.sessionId).reduce((sum, event) => sum + event.totalTokens, 0);
  const aggregateTokens = events.filter((event) => event.grain === "bucket").reduce((sum, event) => sum + event.totalTokens, 0);
  const dates = events.map((event) => event.timestamp).sort();
  const notes = [
    "Ranking is limited to observed local sessions; it cannot identify the largest session hidden inside unattributed account buckets.",
    "Each ranked session uses one basis. Sidecar lifetime snapshots and overlapping raw requests are never summed or added to account usage.",
    "Session, project and automation rankings are independent views of overlapping metadata; do not add their totals together.",
    "Sidecar reasoning tokens are an informational output subset and are not added twice. Sparse model costs remain unknown.",
  ];
  return {
    rankedSessions, rawSessions: rank(rawSessions), sidecarSessions: rank(sidecars), projects, automations,
    period: { start: dates[0] || null, end: dates.at(-1) || null },
    coverage: { accountTotalTokens, sessionAttributedTokens: rawSessionTokens, sessionUnassignedTokens: Math.max(0, accountTotalTokens - rawSessionTokens),
      rawEventTokens: raw.reduce((sum, event) => sum + event.totalTokens, 0), rawSessionTokens, aggregateTokens,
      sessionAttributionPercent: accountTotalTokens ? Math.round(rawSessionTokens / accountTotalTokens * 10000) / 100 : null,
      sidecarSessionCount: sidecars.length, rawSessionCount: rawSessions.length, rankedSessionCount: rankedSessions.length,
      attributedEvents: raw.filter((event) => event.sessionId).length, unattributedEvents: events.filter((event) => event.grain !== "event" || !event.sessionId).length,
      scope: "available-local-data", notes },
    recommendations: rankedSessions[0]?.recommendations || [],
  };
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

function mentionsIdentifier(message, value) {
  if (!value) return false;
  const text = message.toLowerCase();
  const target = value.toLowerCase();
  let from = 0;
  while (from < text.length) {
    const position = text.indexOf(target, from);
    if (position < 0) return false;
    const before = text[position - 1] || "";
    const after = text[position + target.length] || "";
    if (!/[a-z0-9_.-]/.test(before) && !/[a-z0-9_.-]/.test(after)) return true;
    from = position + 1;
  }
  return false;
}
function explainSession(message, insights, incidents, { focusId } = {}) {
  const focused = focusId ? [...insights.rankedSessions, ...insights.projects, ...insights.automations].find((entry) => entry.id === focusId) : null;
  if (focusId && !focused) return { answer: "That investigation is unavailable in the current dataset. Refresh the records and select an observed session or automation again; no usage is inferred for an unknown identifier.", evidenceIds: [], recommendations: [], sessionIds: [], focusId: null };
  const named = insights.rankedSessions.filter((entry) => [entry.sessionId, entry.sessionHash, entry.id].some((id) => mentionsIdentifier(message, id)));
  const namedSources = SOURCES.filter((source) => new RegExp(`\\b${source}\\b`, "i").test(message));
  const matches = namedSources.length === 1 ? named.filter((entry) => entry.source === namedSources[0]) : named;
  if (!focused && named.length && !matches.length) return { answer: "That session identifier is available for a different app. Specify the originating app; a session is not attributed across providers by matching timestamps.", evidenceIds: [], recommendations: [], sessionIds: [], focusId: null };
  if (!focused && matches.length > 1) return { answer: `That identifier appears in multiple apps (${[...new Set(matches.map((entry) => entry.source))].join(", ")}). Specify the app to choose the correct session.`, evidenceIds: matches.flatMap((entry) => entry.evidenceIds).slice(0, 20), recommendations: [], sessionIds: [...new Set(matches.map((entry) => entry.sessionId).filter(Boolean))], focusId: null };
  const requested = message.match(/\b(?:session|conversation|thread)(?:\s+id)?\s*[:#]?\s+([a-z0-9][a-z0-9_.:-]*)/i)?.[1];
  const rankingWords = /^(?:uses?|usage|used|using|has|had|is|are|was|with|the|that|this|most|largest|biggest|highest|tokens?|costs?|consumes?|consumed|do|does|did|which|can|should|would|takes?|took|needs?|spends?|spent|from|in|for|on|of|models?|caching|cache|activity|details?|breakdown|totals?)$/i;
  if (!focused && !matches.length && requested && !rankingWords.test(requested)) return { answer: `No observed local session matches '${clean(requested)}'. Missing attribution is not zero usage. Check the app and identifier, then refresh local session metadata or import requests that retain their actual session IDs.`, evidenceIds: [], recommendations: [], sessionIds: [], focusId: null };
  const candidates = namedSources.length === 1 ? insights.rankedSessions.filter((entry) => entry.source === namedSources[0]) : insights.rankedSessions;
  const entry = focused || matches[0] || candidates.find((candidate) => candidate.totalTokens !== null);
  if (!entry) return {
    answer: `No session token total can be established from the available data. ${insights.coverage.sessionUnassignedTokens.toLocaleString("en-US")} account tokens lack direct session attribution. Project paths, automation IDs and account buckets do not reveal a conversation ID. Refresh local session analytics or import usage metadata with actual session IDs.`,
    evidenceIds: [], sessionIds: [], focusId: null,
    recommendations: [{ id: "recommendation-collect-session-metadata", type: "collect-session-metadata", title: "Collect actual session identifiers", detail: "Refresh the existing tracker session browser or import request metadata with actual session IDs. Do not join sessions to account totals using timestamps alone.", evidenceIds: [], confidence: "observed", action: "investigate", automated: false, savingsUsd: null }],
  };
  const label = entry.sessionId ? `session ${entry.sessionId}` : entry.sessionHash ? `local session hash ${entry.sessionHash}` : entry.automationId ? `automation ${entry.automationId}` : entry.cloudAgentId ? `cloud agent ${entry.cloudAgentId}` : `project ${entry.project}`;
  const count = entry.totalTokens === null ? "has no available token total" : `used ${entry.totalTokens.toLocaleString("en-US")} tokens`;
  const basis = entry.basis === "session-sidecar" ? "the latest local whole-session snapshot" : "directly attributed requests in the available dataset";
  let answer = `${focused || matches.length ? "The identified" : "Among observed locally identified sessions, the largest is"} ${entry.source} ${label}; it ${count}, based on ${basis}. `;
  if (entry.startedAt || entry.endedAt) answer += `Recorded period: ${entry.startedAt || "unknown start"} to ${entry.endedAt || "unknown end"}. `;
  answer += `Models: ${entry.models.map((model) => model.model).join(", ")}. `;
  if (entry.reportedCostUsd) answer += `Provider-reported usage value: $${entry.reportedCostUsd.toFixed(2)}; this is not necessarily an extra charge. `;
  if (entry.estimatedCostUsd || entry.costType === "estimated") answer += `Estimated model usage value: $${entry.estimatedCostUsd.toFixed(2)}${entry.costIsPartial ? " (known lower bound)" : ""}; this is not a provider bill. `;
  if (entry.unknownCostEvents) answer += "Some usage cost is unknown or partially priced. ";
  const related = incidents.find((incident) => incident.type === "recurring-automation" && incident.evidenceIds.some((id) => entry.eventIds.includes(id)));
  if (related) answer += `Observed request timing suggests a ${related.cadenceMinutes}-minute recurring pattern; verify whether it is intended. `;
  if (insights.coverage.sessionUnassignedTokens) answer += `${insights.coverage.sessionUnassignedTokens.toLocaleString("en-US")} account tokens remain unassigned to sessions, so this is not proof of the largest session across all usage. `;
  if (entry.basis === "session-sidecar") answer += "Session totals are a separate view and are not added to account usage. ";
  answer += entry.recommendations.slice(0, 3).map((recommendation) => recommendation.detail).join(" ");
  return { answer, evidenceIds: entry.evidenceIds.slice(0, 30), recommendations: entry.recommendations, sessionIds: entry.sessionId ? [entry.sessionId] : [], focusId: entry.id };
}

function explain(message, snapshot, { focusId: selectedFocusId } = {}) {
  const { summary, events, incidents, mode } = snapshot;
  const sessionInsights = snapshot.sessionInsights || buildSessionInsights(events, [], incidents);
  const prefix = mode === "demo" ? "This is a simulated example, not your usage. " : "Based on locally available usage metadata: ";
  const evidenceIds = [];
  let recommendations = [], sessionIds = [], focusId = null;
  let answer;
  if (/stop|pause|kill|turn off|shut.?down/i.test(message)) {
    answer = "This version can investigate and explain usage, but it cannot stop an app or automation. Open the originating app's automation settings and verify its schedule before disabling it.";
  } else if (selectedFocusId || /conversation|session|thread/i.test(message) || sessionInsights.rankedSessions.some((entry) => [entry.sessionId, entry.sessionHash, entry.id].some((id) => mentionsIdentifier(message, id)))) {
    const response = explainSession(message, sessionInsights, incidents, { focusId: selectedFocusId });
    answer = response.answer; evidenceIds.push(...response.evidenceIds);
    recommendations = response.recommendations; sessionIds = response.sessionIds; focusId = response.focusId;
  } else if (/why|drain|burn|automation|recurr|incident|spike|wast|happen/i.test(message) && incidents.length) {
    const incident = incidents[0];
    evidenceIds.push(...incident.evidenceIds);
    answer = `${incident.description} Those events used ${incident.totalTokens.toLocaleString("en-US")} tokens${incident.reportedCostUsd ? ` with $${incident.reportedCostUsd.toFixed(2)} in provider-reported usage value (this is not necessarily an extra charge)` : ""}. ${incident.automationId ? `Automation ID: ${incident.automationId}. ` : ""}Attribution confidence: ${incident.confidence}. ${incident.limits.join(" ")}`;
    const group = sessionInsights.automations.find((entry) => entry.eventIds.some((id) => incident.evidenceIds.includes(id)));
    if (group) { recommendations = group.recommendations; focusId = group.id; }
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
  return { answer: prefix + answer, mode: "local", evidenceIds: [...new Set(evidenceIds)].slice(0, 30), recommendations, sessionIds, focusId };
}

module.exports = { SOURCES, MAX_EVENTS, hash, clean, normalizeEvent, identifyEvents, parseCsv, parseCursorCsv, parseEventJson, latestTrackerBuckets, summarize, normalizeSessionSnapshot, buildSessionInsights, sessionRecommendations, detectIncidents, demoEvents, explain };
