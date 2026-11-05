#!/usr/bin/env node
"use strict";
// Stands in for `codex app-server` in tests: answers initialize and account/rateLimits/read.
const fs = require("node:fs");
const path = require("node:path");
const mode = process.env.FAKE_CODEX_MODE || "ok";
const result = JSON.parse(fs.readFileSync(path.join(__dirname, "codex-rpc-rate-limits.json"), "utf8"));
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) !== -1) {
    const message = JSON.parse(buffer.slice(0, index));
    buffer = buffer.slice(index + 1);
    if (message.id === undefined) continue;
    if (mode === "hang") continue;
    const reply = message.method === "account/rateLimits/read" ? result : {};
    process.stdout.write(`${JSON.stringify({ id: message.id, result: reply })}\n`);
  }
});
