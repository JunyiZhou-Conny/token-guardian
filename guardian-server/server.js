#!/usr/bin/env node
"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { parseCursorCsv, parseEventJson } = require("./engine");
const { createStore } = require("./store");
const { createChat } = require("./chat");
const { createGrokBot } = require("./grokbot");
const { createVoice, readAudio } = require("./voice");

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2" };

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(value));
}
async function readBody(request) {
  if (!String(request.headers["content-type"] || "").startsWith("application/json")) throw Object.assign(new Error("Use Content-Type: application/json."), { status: 415 });
  if (Number(request.headers["content-length"]) > MAX_BODY_BYTES) throw Object.assign(new Error("Import requests are limited to 2 MB."), { status: 413 });
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error("Import requests are limited to 2 MB."), { status: 413 });
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("Request body must be a JSON object."), { status: 400 });
  return body;
}

function createGuardianServer({ store = createStore(), staticDir = path.join(__dirname, "..", "guardian"), env = process.env, fetchImpl, now, grokbot } = {}) {
  const companion = createChat({ store, env, fetchImpl, now });
  const voice = createVoice({ store, env, fetchImpl, now });
  const quota = grokbot || createGrokBot({ env, now, fetchImpl });
  const server = http.createServer(async (request, response) => {
    try {
      const host = request.headers.host || "";
      const port = server.address()?.port || request.socket.localPort;
      const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      if (!allowedHosts.has(host)) return sendJson(response, 403, { error: "This service accepts local loopback requests only." });
      const origin = request.headers.origin;
      if (origin && !new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]).has(origin)) return sendJson(response, 403, { error: "Cross-origin requests are not allowed." });
      if (request.headers["sec-fetch-site"] === "cross-site") return sendJson(response, 403, { error: "Cross-site requests are not allowed." });
      const url = new URL(request.url, `http://${host}`);
      const mode = url.searchParams.get("mode") || "auto";
      if (!["auto", "local", "demo"].includes(mode)) return sendJson(response, 400, { error: "Dataset mode must be local, demo or auto." });
      if (request.method === "GET" && url.pathname === "/api/guardian") {
        const snapshot = await store.snapshot({ mode });
        snapshot.coverage.llmConfigured = companion.configuration().configured;
        return sendJson(response, 200, snapshot);
      }
      if (request.method === "GET" && ["/api/health", "/api/guardian/health"].includes(url.pathname)) {
        const chat = companion.configuration();
        return sendJson(response, 200, { ok: true, service: "Token Guardian", llmConfigured: chat.configured, chat, voice: voice.configuration() });
      }
      if (request.method === "GET" && url.pathname === "/api/guardian/grokbot") {
        const enabled = url.searchParams.get("enabled");
        const refresh = url.searchParams.get("refresh");
        if (enabled !== null && !["0", "1"].includes(enabled)) return sendJson(response, 400, { error: "Grok Bot enabled must be 0 or 1." });
        if (refresh !== null && !["0", "1"].includes(refresh)) return sendJson(response, 400, { error: "Grok Bot refresh must be 0 or 1." });
        return sendJson(response, 200, await quota.status({ enabled: enabled === null ? undefined : enabled === "1", refresh: refresh === "1" }));
      }
      if (request.method === "POST" && url.pathname === "/api/guardian/transcribe") {
        try {
          const clip = await readAudio(request);
          return sendJson(response, 200, await voice.transcribe(clip));
        } catch (error) {
          return sendJson(response, error.status || 500, { error: error.publicCode ? error.message : "Voice transcription is unavailable. Type your question instead.", code: error.publicCode || "voice-unavailable" });
        }
      }
      if (request.method === "POST" && ["/api/import", "/api/guardian/import"].includes(url.pathname)) {
        const body = await readBody(request);
        let events;
        if (body.format === "csv") events = parseCursorCsv(body.data);
        else if (body.format === "json") events = parseEventJson(body.data);
        else return sendJson(response, 400, { error: "Import format must be csv or json." });
        const result = await store.importEvents(events);
        return sendJson(response, 200, { ...result, mode: "local", message: "Usage metadata imported. Repeated imports are deduplicated; conversation content is discarded." });
      }
      if (request.method === "POST" && ["/api/chat", "/api/guardian/chat"].includes(url.pathname)) {
        const body = await readBody(request);
        if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 3000) return sendJson(response, 400, { error: "Enter a question of 1–3,000 characters." });
        const chatMode = body.datasetMode || mode;
        if (!["auto", "local", "demo"].includes(chatMode)) return sendJson(response, 400, { error: "Dataset mode must be local, demo or auto." });
        if (body.provider !== undefined && !["local", "openai", "deepseek"].includes(body.provider)) return sendJson(response, 400, { error: "Chat provider must be local, openai or deepseek." });
        if (body.focusId !== undefined && (typeof body.focusId !== "string" || !body.focusId.trim() || body.focusId.length > 240)) return sendJson(response, 400, { error: "Session focus must be a non-empty identifier of at most 240 characters." });
        const snapshot = await store.snapshot({ mode: chatMode });
        return sendJson(response, 200, await companion.chat(body.message.trim(), snapshot, { useOpenAI: body.useOpenAI !== false, provider: body.provider, focusId: body.focusId }));
      }
      if (url.pathname.startsWith("/api/")) return sendJson(response, request.method === "GET" || request.method === "POST" ? 404 : 405, { error: "Unknown API route or unsupported method." });
      if (request.method !== "GET" && request.method !== "HEAD") return sendJson(response, 405, { error: "Method not allowed." });
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return sendJson(response, 400, { error: "Invalid URL path." }); }
      const segments = pathname.split("/");
      if (segments.some((segment) => segment.startsWith(".") || segment.includes("\\") || segment.includes("\0"))) return sendJson(response, 403, { error: "Invalid asset path." });
      const resolvedRoot = path.resolve(staticDir);
      let filePath = path.resolve(resolvedRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!filePath.startsWith(`${resolvedRoot}${path.sep}`)) return sendJson(response, 403, { error: "Invalid asset path." });
      try {
        let stat;
        try { stat = await fs.stat(filePath); }
        catch (error) { if (error.code !== "ENOENT" || path.extname(pathname)) throw error; filePath = path.join(resolvedRoot, "index.html"); stat = await fs.stat(filePath); }
        if (!stat.isFile() || stat.size > 16 * 1024 * 1024) return sendJson(response, 404, { error: "Asset not found." });
        const realPath = await fs.realpath(filePath);
        const realRoot = await fs.realpath(resolvedRoot);
        if (!realPath.startsWith(`${realRoot}${path.sep}`)) return sendJson(response, 403, { error: "Invalid asset path." });
        if (path.relative(realRoot, realPath).split(path.sep).some((segment) => segment.startsWith("."))) return sendJson(response, 403, { error: "Hidden assets are not served." });
        response.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
        response.end(request.method === "HEAD" ? undefined : await fs.readFile(filePath));
      } catch (error) { if (error.code === "ENOENT") return sendJson(response, 404, { error: "Guardian UI assets are unavailable." }); throw error; }
    } catch (error) {
      if (!response.headersSent) sendJson(response, error.status || (error.code ? 500 : 400), { error: error.code ? "The local data store could not be accessed. Check folder permissions and retry." : error.message || "Request failed." });
      else response.end();
    }
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  return server;
}

if (require.main === module) {
  const rawPort = Number(process.env.TOKENTRACKER_GUARDIAN_PORT || 7681);
  if (!Number.isInteger(rawPort) || rawPort < 1 || rawPort > 65535) { console.error("TOKENTRACKER_GUARDIAN_PORT must be an integer between 1 and 65535."); process.exitCode = 1; }
  else {
    const server = createGuardianServer();
    server.on("error", (error) => { console.error(error.code === "EADDRINUSE" ? `Port ${rawPort} is already in use. Set TOKENTRACKER_GUARDIAN_PORT to a free port.` : `Guardian server failed (${error.code || "server error"}).`); process.exitCode = 1; });
    server.listen(rawPort, "127.0.0.1", () => console.log(`Token Guild Guardian: http://127.0.0.1:${rawPort}`));
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
  }
}

module.exports = { MAX_BODY_BYTES, readBody, createGuardianServer };
