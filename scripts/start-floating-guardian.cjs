#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const desktop = path.resolve(__dirname, "..", "desktop");
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 12)) {
  console.error("Install Node.js 22.12 or newer for the floating widget runtime. The browser-only launcher supports Node.js 20.");
  process.exitCode = 1;
} else {
  let executable;
  try { executable = require(path.join(desktop, "node_modules", "electron")); }
  catch {
    console.error("Install the floating widget runtime once with Node.js 22.12 or newer, then launch again:\n\n  npm --prefix desktop ci\n  node scripts/start-floating-guardian.cjs\n\nThe dashboard-only launcher remains: node scripts/start-guardian.cjs");
    process.exitCode = 1;
  }
  if (executable) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, [desktop, ...process.argv.slice(2)], { stdio: "inherit", env });
    child.on("error", error => { console.error(`Could not launch the floating widget (${error.code || "launch error"}).`); process.exitCode = 1; });
    child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  }
}
