"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { SOURCES, hash, normalizeEvent, latestTrackerBuckets, summarize, detectIncidents, demoEvents } = require("./engine");

const MAX_FILE_BYTES = 64 * 1024 * 1024;

async function readJsonLines(filePath, warnings) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) { warnings.push(`${path.basename(filePath)} is not a regular file.`); return []; }
    if (stat.size > MAX_FILE_BYTES) { warnings.push(`${path.basename(filePath)} exceeds the 64 MB read limit. Export a smaller usage window.`); return []; }
    const text = await fs.readFile(filePath, "utf8");
    const rows = [];
    let malformed = 0;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line)); } catch { malformed++; }
    }
    if (malformed) warnings.push(`${path.basename(filePath)} contains ${malformed} malformed JSON lines; valid records are still available.`);
    return rows;
  } catch (error) {
    if (error.code !== "ENOENT") warnings.push(`${path.basename(filePath)} could not be read (${error.code || "read error"}).`);
    return [];
  }
}

function lastById(rows) {
  const map = new Map();
  for (const row of rows) if (typeof row?.id === "string") map.set(row.id, row);
  return [...map.values()];
}
function rawKey(event) { return JSON.stringify([event.source, event.timestamp, event.model, event.automationId, event.cloudAgentId]); }

function normalizeLedger(rows, warnings) {
  const events = [];
  let invalid = 0;
  for (const row of lastById(rows)) {
    try {
      const normalized = normalizeEvent({ ...row, billingKind: ["billable", "non_billable"].includes(row.billingKind) ? "unknown" : row.billingKind, grain: "event" });
      const { _identity, ...safe } = normalized;
      events.push({ id: row.id, ...safe });
    } catch { invalid++; }
  }
  if (invalid) warnings.push(`${invalid} ledger events have invalid metadata and were skipped.`);
  return events;
}

function usageSignature(event) { return JSON.stringify([event.inputTokens, event.outputTokens, event.cachedTokens, event.cacheWriteTokens, event.totalTokens]); }
function preferMetadata(prior, next) {
  if (!prior) return next;
  const result = { ...prior, ...next, id: prior.id };
  for (const name of ["project", "sessionId", "automationId", "cloudAgentId", "requestId", "billingLabel"]) result[name] = next[name] || prior[name];
  if (next.costUsd === null && prior.costUsd !== null) { result.costUsd = prior.costUsd; result.costType = prior.costType; }
  if (next.billingKind === "unknown" && prior.billingKind !== "unknown") result.billingKind = prior.billingKind;
  if (next.attribution === "unknown" && prior.attribution !== "unknown") result.attribution = prior.attribution;
  return result;
}

function mergeRawDatasets(datasets, warnings = []) {
  // Match the same timestamp/model/automation rows across ledger and CSV import.
  // Preserve multiplicity: two identical provider rows are still two requests.
  const combined = new Map();
  for (const events of datasets) {
    const groups = new Map();
    for (const event of events) {
      const key = rawKey(event);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(event);
    }
    for (const [key, group] of groups) {
      const current = combined.get(key) || [];
      const earlierDatasetCount = current.length;
      const sorted = [...group].sort((a, b) => a.totalTokens - b.totalTokens || a.id.localeCompare(b.id));
      const matched = new Set();
      for (const next of sorted) {
        const index = current.findIndex((prior, i) => !matched.has(i) && (prior.id === next.id || (usageSignature(prior) === usageSignature(next) && (!prior.requestId || !next.requestId || prior.requestId === next.requestId))));
        if (index >= 0) { current[index] = preferMetadata(current[index], next); matched.add(index); }
        else {
          if (earlierDatasetCount) warnings.push("Some raw records share timestamp/model identifiers but have different usage. Without a common request ID their relationship is uncertain; inspect overlapping exports.");
          matched.add(current.length); current.push(next);
        }
      }
      combined.set(key, current);
    }
  }
  return [...combined.values()].flat();
}

function halfHour(timestamp) {
  const value = Date.parse(timestamp);
  return new Date(Math.floor(value / 1_800_000) * 1_800_000).toISOString();
}
function reconcileBuckets(buckets, raw, warnings) {
  const sums = new Map();
  const keys = ["inputTokens", "outputTokens", "cachedTokens", "cacheWriteTokens", "reasoningTokens", "totalTokens"];
  for (const event of raw) {
    const key = JSON.stringify([event.source, event.model, halfHour(event.timestamp)]);
    if (!sums.has(key)) sums.set(key, Object.fromEntries(keys.map((name) => [name, 0])));
    const sum = sums.get(key);
    for (const name of keys) sum[name] += event[name];
  }
  const residuals = [];
  let laggingBuckets = 0;
  for (const bucket of buckets) {
    const key = JSON.stringify([bucket.source, bucket.model, halfHour(bucket.timestamp)]);
    const used = sums.get(key);
    if (!used) { residuals.push(bucket); continue; }
    const remainingTotal = Math.max(0, bucket.totalTokens - used.totalTokens);
    if (used.totalTokens > bucket.totalTokens) laggingBuckets++;
    if (!remainingTotal) continue;
    // Residuals remain aggregates, with unknown attribution and unknown cost.
    // Do not infer token-column allocation when raw detail and totals disagree.
    residuals.push({ ...bucket, id: `${bucket.id}-residual`, ...Object.fromEntries(keys.map((name) => [name, name === "totalTokens" ? remainingTotal : Math.max(0, bucket[name] - used[name])])), costUsd: null, costType: "unknown", provenance: "tracker-bucket-residual" });
  }
  if (laggingBuckets) warnings.push(`${laggingBuckets} tracker buckets are smaller than imported raw events. Raw records are retained; refresh upstream sync to reconcile the latest totals.`);
  return [...residuals, ...raw].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
}

function safeSessions(rows) {
  const latest = new Map();
  for (const row of rows) {
    if (!SOURCES.includes(row?.source)) continue;
    const id = row.session_hash || row.session_id;
    if (!id) continue;
    // Session totals are not added to usage: they overlap the tracker queue.
    latest.set(id, {
      id: String(id), source: row.source, sessionId: row.session_id || null,
      project: typeof row.project_ref === "string" ? row.project_ref.slice(0, 500) : null,
      title: typeof row.title === "string" ? row.title.slice(0, 240) : null,
      startedAt: row.started_at || null, endedAt: row.ended_at || null,
      note: "Local session metadata; not linked to account buckets by timestamps alone.",
    });
  }
  return [...latest.values()].slice(-200);
}

function createStore({ trackerHome = process.env.TOKENTRACKER_GUARDIAN_DATA_DIR || path.join(os.homedir(), ".tokentracker"), now = () => Date.now() } = {}) {
  const guardianDir = path.join(trackerHome, "guardian");
  const importsPath = path.join(guardianDir, "events.jsonl");
  let mutation = Promise.resolve();

  async function importEvents(events) {
    const work = mutation.then(async () => {
      const warnings = [];
      const existingRows = await readJsonLines(importsPath, warnings);
      if (warnings.length) throw new Error("The import store could not be read safely. Resolve its file error before importing more events.");
      const existing = new Map(lastById(existingRows).map((row) => [row.id, row]));
      const append = [];
      let added = 0, updated = 0, duplicates = 0;
      for (const event of events) {
        const prior = existing.get(event.id);
        if (prior && JSON.stringify(prior) === JSON.stringify(event)) { duplicates++; continue; }
        prior ? updated++ : added++;
        existing.set(event.id, event); append.push(event);
      }
      if (append.length) {
        await fs.mkdir(guardianDir, { recursive: true, mode: 0o700 });
        await fs.appendFile(importsPath, append.map((event) => JSON.stringify(event)).join("\n") + "\n", { mode: 0o600 });
      }
      return { added, updated, duplicates, retained: existing.size };
    });
    mutation = work.catch(() => {});
    return work;
  }

  async function snapshot({ mode = "auto" } = {}) {
    await mutation;
    const warnings = [];
    const [queueRows, nestedQueueRows, cursorRows, nestedCursorRows, importedRows, sessionRows, directSessionRows] = await Promise.all([
      readJsonLines(path.join(trackerHome, "queue.jsonl"), warnings),
      readJsonLines(path.join(trackerHome, "tracker", "queue.jsonl"), warnings),
      readJsonLines(path.join(trackerHome, "cursor-guardian-events.jsonl"), warnings),
      readJsonLines(path.join(trackerHome, "tracker", "cursor-guardian-events.jsonl"), warnings),
      readJsonLines(importsPath, warnings),
      readJsonLines(path.join(trackerHome, "tracker", "session.queue.jsonl"), warnings),
      readJsonLines(path.join(trackerHome, "session.queue.jsonl"), warnings),
    ]);
    // resolveTrackerPaths uses ~/.tokentracker/tracker; root paths support older
    // installs and DATA_DIR explicitly pointing at the tracker directory.
    const { events: buckets, diagnostics } = latestTrackerBuckets(nestedQueueRows.length ? nestedQueueRows : queueRows);
    if (diagnostics.malformedRows) warnings.push(`${diagnostics.malformedRows} supported tracker rows have invalid token or timestamp fields and were skipped.`);
    const ledger = normalizeLedger(nestedCursorRows.length ? nestedCursorRows : cursorRows, warnings);
    const imports = normalizeLedger(importedRows, warnings);
    const raw = mergeRawDatasets([ledger, imports], warnings);
    let events = reconcileBuckets(buckets, raw, warnings);
    const localSessions = safeSessions(sessionRows.length ? sessionRows : directSessionRows);
    const selectedMode = mode === "demo" || (mode === "auto" && !events.length) ? "demo" : "local";
    if (selectedMode === "demo") events = demoEvents(now());
    const demoReason = selectedMode === "demo" ? mode === "demo" ? "Simulation explicitly selected." : "No supported local tracker records or imported events were found." : null;
    const incidents = detectIncidents(events);
    const notes = [
      "Usage data stays on this machine. Imports retain only an explicit metadata allowlist.",
      "Reported usage value, model-price estimates, subscription inclusion and extra charges are distinct.",
      "Thirty-minute buckets cannot reveal ten-minute request cadence or the originating conversation.",
      "Session metadata is shown separately; its totals are never added to account usage.",
      "Raw imports replace matching bucket usage, with aggregate residuals retained when detail is partial.",
      "Cadence and spike rules operate on raw request events only. Investigation does not stop processes.",
      ...(selectedMode === "demo" ? ["All events, costs, projects and incidents in this mode are simulated."] : []),
    ];
    return {
      mode: selectedMode, demoReason, events, summary: summarize(events), incidents,
      sessions: selectedMode === "local" ? localSessions : [],
      coverage: {
        providers: SOURCES.map((source) => {
          const rows = events.filter((event) => event.source === source);
          return { source, status: rows.length ? selectedMode === "demo" ? "simulated" : "connected" : "no-data", eventCount: rows.length, rawEvents: rows.filter((e) => e.grain === "event").length, bucketEvents: rows.filter((e) => e.grain === "bucket").length, attributedEvents: rows.filter((e) => e.attribution !== "unknown").length };
        }),
        notes, warnings: [...new Set(warnings)], sessionCount: selectedMode === "local" ? localSessions.length : 0,
        unsupportedRows: diagnostics.unsupportedRows,
        availableActions: ["investigate"], llmConfigured: Boolean(process.env.OPENAI_API_KEY),
      },
      generatedAt: new Date(now()).toISOString(),
    };
  }
  return { trackerHome, guardianDir, importsPath, importEvents, snapshot };
}

module.exports = { MAX_FILE_BYTES, readJsonLines, lastById, normalizeLedger, mergeRawDatasets, reconcileBuckets, safeSessions, createStore };
