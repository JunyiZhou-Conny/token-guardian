const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { parseCursorCsv } = require("../src/lib/cursor-config");
const { cursorGuardianEvents, writeCursorGuardianEvents } = require("../src/lib/guardian-events");

const header = "Date,Cloud Agent ID,Automation ID,Kind,Model,Max Mode,Input (w/ Cache Write),Input (w/o Cache Write),Cache Read,Output Tokens,Total Tokens,Cost";
const raw = '"2026-10-01T03:00:00Z","agent-1","automation-jobs","Included","composer-2-fast","No","0","3189","194368","1815","199372","0.11"';

test("Cursor automation IDs survive parsing and metadata-only event export", () => {
  const records = parseCursorCsv(`${header}\n${raw}`);
  assert.equal(records[0].automationId, "automation-jobs");
  assert.equal(records[0].cloudAgentId, "agent-1");
  records[0].prompt = "must never be retained";
  records[0].response = "private model output";
  const [event] = cursorGuardianEvents(records);
  assert.equal(event.automationId, "automation-jobs");
  assert.equal(event.cloudAgentId, "agent-1");
  assert.equal(event.totalTokens, 199372);
  assert.equal(event.cacheWriteTokens, 0);
  assert.equal(event.billingKind, "included");
  assert.equal(event.costUsd, 0.11);
  assert.equal(event.granularity, "event");
  assert.equal(event.attribution, "confirmed");
  assert.equal(Object.hasOwn(event, "prompt"), false);
  assert.equal(Object.hasOwn(event, "response"), false);
});

test("Legacy Cursor exports have unavailable IDs without inventing project attribution", () => {
  const records = parseCursorCsv("Date,Kind,Model,Max Mode,Input (w/ Cache Write),Input (w/o Cache Write),Cache Read,Output Tokens,Total Tokens,Cost\n2026-10-01T03:00:00Z,On-Demand,composer-2-fast,No,10,10,0,20,30,0.01");
  const [event] = cursorGuardianEvents(records);
  assert.equal(event.automationId, null);
  assert.equal(event.cloudAgentId, null);
  assert.equal(event.project, null);
  assert.equal(event.sessionId, null);
  assert.equal(event.attribution, "unavailable");
  assert.equal(event.billingKind, "on-demand");
});

test("Repeated syncs retain identical usage rows once per occurrence and update costs", async () => {
  const trackerDir = await fs.mkdtemp(path.join(os.tmpdir(), "guardian-ledger-"));
  try {
    const records = parseCursorCsv(`${header}\n${raw}\n${raw}`);
    assert.equal((await writeCursorGuardianEvents({ trackerDir, records })).added, 2);
    assert.equal((await writeCursorGuardianEvents({ trackerDir, records })).added, 0);
    records[0].cost = 0.12;
    assert.equal((await writeCursorGuardianEvents({ trackerDir, records })).added, 0);
    const saved = (await fs.readFile(path.join(trackerDir, "cursor-guardian-events.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(saved.length, 2);
    assert.equal(saved.reduce((sum, event) => sum + event.totalTokens, 0), 398744);
    assert.deepEqual(saved.map(event => event.costUsd).sort(), [0.11, 0.12]);
    assert.equal((await fs.stat(path.join(trackerDir, "cursor-guardian-events.jsonl"))).mode & 0o777, 0o600);
  } finally {
    await fs.rm(trackerDir, { recursive: true, force: true });
  }
});

test("Authoritative exports replace revised tokens and billing while preserving older window history", async () => {
  const trackerDir = await fs.mkdtemp(path.join(os.tmpdir(), "guardian-ledger-correction-"));
  try {
    const [original] = parseCursorCsv(`${header}\n${raw}`);
    const older = { ...original, date: "2026-09-30T21:05:00Z", inputTokens: 100, cacheReadTokens: 0, outputTokens: 10 };
    const latest = { ...original, date: "2026-10-01T03:20:00Z", inputTokens: 200, cacheReadTokens: 0, outputTokens: 20 };
    await writeCursorGuardianEvents({ trackerDir, records: [latest, original, older] });

    const revised = { ...original, inputTokens: original.inputTokens + 1000, kind: "On-Demand", cost: 0.5, prompt: "must never be retained" };
    const result = await writeCursorGuardianEvents({ trackerDir, records: [latest, revised] });
    assert.equal(result.removed, 1);
    assert.equal(result.retained, 3);
    const target = path.join(trackerDir, "cursor-guardian-events.jsonl");
    const snapshot = await fs.readFile(target, "utf8");
    const saved = snapshot.trim().split("\n").map(JSON.parse);
    const atCorrectedTime = saved.filter(event => event.timestamp === "2026-10-01T03:00:00.000Z");
    assert.equal(atCorrectedTime.length, 1);
    assert.equal(atCorrectedTime[0].inputTokens, original.inputTokens + 1000);
    assert.equal(atCorrectedTime[0].billingKind, "on-demand");
    assert.equal(atCorrectedTime[0].costUsd, 0.5);
    assert.equal(saved.some(event => event.timestamp === "2026-09-30T21:05:00.000Z"), true);
    assert.equal(snapshot.includes("must never be retained"), false);

    const repeat = await writeCursorGuardianEvents({ trackerDir, records: [revised, latest] });
    assert.deepEqual(repeat, { added: 0, updated: 0, removed: 0, retained: 3 });
    assert.equal(await fs.readFile(target, "utf8"), snapshot);
  } finally {
    await fs.rm(trackerDir, { recursive: true, force: true });
  }
});

test("Exact export boundary preserves earlier requests in the same half-hour and duplicate multiplicity", async () => {
  const trackerDir = await fs.mkdtemp(path.join(os.tmpdir(), "guardian-ledger-boundary-"));
  try {
    const [original] = parseCursorCsv(`${header}\n${raw}`);
    const beforeBoundary = { ...original, date: "2026-10-01T03:05:00Z" };
    const atBoundary = { ...original, date: "2026-10-01T03:12:00Z" };
    await writeCursorGuardianEvents({ trackerDir, records: [beforeBoundary, atBoundary, atBoundary] });
    const revised = { ...atBoundary, outputTokens: atBoundary.outputTokens + 500 };
    await writeCursorGuardianEvents({ trackerDir, records: [revised, revised] });
    const target = path.join(trackerDir, "cursor-guardian-events.jsonl");
    const snapshot = await fs.readFile(target, "utf8");
    const saved = snapshot.trim().split("\n").map(JSON.parse);
    assert.equal(saved.length, 3);
    assert.equal(saved.filter(event => event.timestamp === "2026-10-01T03:05:00.000Z").length, 1);
    const duplicates = saved.filter(event => event.timestamp === "2026-10-01T03:12:00.000Z");
    assert.equal(duplicates.length, 2);
    assert.notEqual(duplicates[0].id, duplicates[1].id);
    assert.equal(duplicates.every(event => event.outputTokens === original.outputTokens + 500), true);
    assert.deepEqual(await writeCursorGuardianEvents({ trackerDir, records: [revised, revised] }), { added: 0, updated: 0, removed: 0, retained: 3 });
    assert.equal(await fs.readFile(target, "utf8"), snapshot);
    const reduced = await writeCursorGuardianEvents({ trackerDir, records: [revised] });
    assert.deepEqual(reduced, { added: 0, updated: 0, removed: 1, retained: 2 });
    const afterReduction = (await fs.readFile(target, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(afterReduction.filter(event => event.timestamp === "2026-10-01T03:12:00.000Z").length, 1);
    assert.equal(afterReduction.some(event => event.timestamp === "2026-10-01T03:05:00.000Z"), true);
  } finally {
    await fs.rm(trackerDir, { recursive: true, force: true });
  }
});

test("Empty and unparseable exports leave the existing ledger unchanged", async () => {
  const trackerDir = await fs.mkdtemp(path.join(os.tmpdir(), "guardian-ledger-empty-"));
  try {
    const records = parseCursorCsv(`${header}\n${raw}`);
    await writeCursorGuardianEvents({ trackerDir, records });
    const target = path.join(trackerDir, "cursor-guardian-events.jsonl");
    const snapshot = await fs.readFile(target, "utf8");
    for (const exportRows of [[], [{ date: "invalid", inputTokens: 10 }], [null]]) {
      assert.deepEqual(await writeCursorGuardianEvents({ trackerDir, records: exportRows }), { added: 0, updated: 0, removed: 0, retained: 1 });
      assert.equal(await fs.readFile(target, "utf8"), snapshot);
    }
    await assert.rejects(writeCursorGuardianEvents({ trackerDir, records: [...records, { date: "invalid", inputTokens: 10 }] }), /previous ledger was retained/);
    assert.equal(await fs.readFile(target, "utf8"), snapshot);
  } finally {
    await fs.rm(trackerDir, { recursive: true, force: true });
  }
});
