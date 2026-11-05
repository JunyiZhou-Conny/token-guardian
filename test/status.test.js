"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { collectStatus } = require("../src/status");
const { demoStatus } = require("../src/demo");
const { fakeFiles, now } = require("./helpers");

test("returns one card per provider even when nothing is signed in", async () => {
  const status = await collectStatus({
    env: {},
    home: "/nonexistent",
    platform: "linux",
    readFile: fakeFiles({}),
    exists: () => false,
    spawnFn: () => { throw new Error("no codex"); },
    fetch: async () => { throw new Error("should not be called"); },
    now,
  });
  assert.deepEqual(status.providers.map((p) => [p.provider, p.status]), [
    ["claude", "notConfigured"],
    ["codex", "notConfigured"],
    ["cursor", "notBuilt"],
  ]);
  assert.equal(status.generatedAt, new Date(now()).toISOString());
});

test("one failing provider does not hide the others", async () => {
  const status = await collectStatus({
    env: {},
    home: "/nonexistent",
    platform: "darwin",
    readFile: async () => { throw new Error("disk exploded"); },
    run: async () => { throw Object.assign(new Error("item not found"), { code: 44 }); },
    exists: () => { throw new Error("boom"); },
    spawnFn: () => { throw new Error("no codex"); },
    now,
  });
  assert.deepEqual(status.providers.map((p) => [p.provider, p.status]), [
    ["claude", "notConfigured"],
    ["codex", "unavailable"],
    ["cursor", "notBuilt"],
  ]);
  assert.equal(status.providers[1].detail, "unexpected error");
});

test("demo data is labeled as demo", () => {
  const status = demoStatus(now);
  assert.equal(status.demo, true);
  assert.ok(status.providers.every((p) => p.source === "demo" || p.status === "notBuilt"));
});
