"use strict";

// Exercise the production HTTP handler over stdin/stdout when the execution
// sandbox disallows listening sockets. This does not create a network service.
const readline = require("node:readline");
const { Readable } = require("node:stream");
const { createGuardianServer } = require("../guardian-server/server");
const { createStore } = require("../guardian-server/store");

const store = createStore({ trackerHome: process.argv[2] });
const handler = createGuardianServer({ store, env: {} }).listeners("request")[0];
const lines = readline.createInterface({ input: process.stdin });
let serial = Promise.resolve();
lines.on("line", line => {
  serial = serial.then(async () => {
    const input = JSON.parse(line);
    const request = Readable.from(input.body ? [Buffer.from(input.body, "base64")] : []);
    request.method = input.method;
    request.url = input.url;
    request.headers = { ...input.headers, host: "127.0.0.1:7681" };
    request.socket = { localPort: 7681 };
    const result = await new Promise(async (resolve, reject) => {
      const response = {
        headersSent: false,
        status: 200,
        headers: {},
        writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; },
        end(body) { resolve({ status: this.status, headers: this.headers, body: Buffer.from(body || "").toString("base64") }); },
      };
      try { await handler(request, response); } catch (error) { reject(error); }
    });
    process.stdout.write(JSON.stringify(result) + "\n");
  }).catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
});
