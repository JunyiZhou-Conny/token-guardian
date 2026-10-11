#!/usr/bin/env node
"use strict";

const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { createGuardianServer } = require("../guardian-server/server");
const { createStore } = require("../guardian-server/store");

const port = Number(process.env.TOKENTRACKER_GUARDIAN_PORT || 7681);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("TOKENTRACKER_GUARDIAN_PORT must be between 1 and 65535.");
  process.exitCode = 1;
} else {
  const trackerHome = process.env.TOKENTRACKER_GUARDIAN_DATA_DIR || path.join(os.homedir(), ".tokentracker");
  const server = createGuardianServer({ store: createStore({ trackerHome }) });
  server.on("error", error => {
    console.error(error.code === "EADDRINUSE"
      ? `Port ${port} is busy. Choose another TOKENTRACKER_GUARDIAN_PORT.`
      : `Could not start the guardian (${error.code || "server error"}).`);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`Token Guardian: ${url}\nPress Control-C to stop.`);
    if (process.platform === "darwin" && !process.argv.includes("--no-open")) {
      const browser = spawn("open", [url], { stdio: "ignore" });
      browser.on("error", () => console.log(`Open ${url} in your browser.`));
    }
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
}
