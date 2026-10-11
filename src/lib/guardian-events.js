const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const CURSOR_LEDGER_FILENAME = "cursor-guardian-events.jsonl";

function metadataId(value) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 256);
  return clean || null;
}

function count(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function cursorBillingKind(kind) {
  if (/included|enterprise|subscription/i.test(kind || "")) return "included";
  if (/on.?demand|usage.?based/i.test(kind || "")) return "on-demand";
  if (/free|no.?charge/i.test(kind || "")) return "free";
  return "unknown";
}

function cursorGuardianEvents(records) {
  const occurrences = new Map();
  const events = [];
  for (const record of records || []) {
    const time = Date.parse(record?.date);
    if (!Number.isFinite(time)) continue;
    const timestamp = new Date(time).toISOString();
    const automationId = metadataId(record.automationId);
    const cloudAgentId = metadataId(record.cloudAgentId);
    const model = metadataId(record.model) || "unknown";
    const inputTokens = count(record.inputTokens);
    const outputTokens = count(record.outputTokens);
    const cachedTokens = count(record.cacheReadTokens);
    const cacheWriteTokens = count(record.cacheWriteTokens);
    const totalTokens = inputTokens + outputTokens + cachedTokens + cacheWriteTokens;
    if (totalTokens === 0) continue;
    // Included quota has a usage value but is not an additional cash charge.
    const billingLabel = metadataId(record.kind);
    const billingKind = cursorBillingKind(billingLabel);
    // Ordinals preserve genuinely repeated rows while a second sync remains
    // idempotent. Cost is not identity: corrections update the same event.
    const identity = JSON.stringify([timestamp, model, inputTokens, outputTokens,
      cachedTokens, cacheWriteTokens, billingKind, automationId, cloudAgentId]);
    const ordinal = occurrences.get(identity) || 0;
    occurrences.set(identity, ordinal + 1);
    const id = `cursor:${crypto.createHash("sha256").update(`${identity}:${ordinal}`).digest("hex")}`;
    const reportedCost = Number(record.cost);
    events.push({
      id, timestamp, source: "cursor", model, inputTokens, outputTokens,
      cachedTokens, cacheWriteTokens, totalTokens,
      costUsd: Number.isFinite(reportedCost) && reportedCost >= 0 ? reportedCost : null,
      costType: "provider_reported", billingKind, billingLabel,
      automationId, cloudAgentId, project: null, sessionId: null,
      attribution: automationId || cloudAgentId ? "confirmed" : "unavailable",
      granularity: "event",
    });
  }
  return events;
}

async function writeCursorGuardianEvents({ trackerDir, records } = {}) {
  if (!trackerDir) throw new Error("trackerDir is required");
  const target = path.join(trackerDir, CURSOR_LEDGER_FILENAME);
  const nextEvents = cursorGuardianEvents(records);
  const existing = new Map();
  try {
    const raw = await fs.readFile(target, "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (typeof event?.id === "string" && event.source === "cursor" &&
            typeof event.timestamp === "string" && Number.isFinite(Date.parse(event.timestamp))) {
          existing.set(event.id, event);
        }
      } catch { /* An interrupted legacy line cannot discard good history. */ }
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  // An empty or unparseable response establishes no coverage interval. Keep
  // the current ledger untouched rather than interpreting it as zero usage.
  if (nextEvents.length === 0) return { added: 0, updated: 0, removed: 0, retained: existing.size };
  if ((records || []).some((record) => !Number.isFinite(Date.parse(record?.date)))) {
    throw new Error("Cursor metadata export has invalid timestamps; the previous ledger was retained.");
  }

  // This writer is called with the complete account CSV fetched by sync,
  // not a user-uploaded partial batch. Like parseCursorApiIncremental, replace
  // the authoritative recent export window so revised tokens/model/billing
  // cannot survive as both old and new identities. Preserve older history.
  // Use the exact oldest request time, not its rounded half-hour: a window
  // beginning at 03:12 does not prove that a retained 03:05 request vanished.
  // A deleted/zeroed oldest row cannot be proven removed without an explicit
  // provider coverage boundary; the ledger conservatively retains older rows.
  let windowStartMs = Infinity;
  for (const event of nextEvents) windowStartMs = Math.min(windowStartMs, Date.parse(event.timestamp));
  const prior = new Map(existing);
  const nextIds = new Set(nextEvents.map((event) => event.id));
  let removed = 0;
  for (const [id, event] of existing) {
    if (Date.parse(event.timestamp) < windowStartMs) continue;
    if (!nextIds.has(id)) removed++;
    existing.delete(id);
  }
  let added = 0;
  let updated = 0;
  for (const event of nextEvents) {
    if (!prior.has(event.id)) added++;
    else if (JSON.stringify(prior.get(event.id)) !== JSON.stringify(event)) updated++;
    existing.set(event.id, event);
  }
  const sorted = [...existing.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
  await fs.mkdir(trackerDir, { recursive: true, mode: 0o700 });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, sorted.map(event => JSON.stringify(event)).join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
    await fs.rename(temp, target);
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
  return { added, updated, removed, retained: sorted.length };
}

module.exports = { CURSOR_LEDGER_FILENAME, cursorGuardianEvents, writeCursorGuardianEvents };
