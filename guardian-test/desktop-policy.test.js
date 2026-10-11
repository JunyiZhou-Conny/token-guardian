"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const desktop = require("../desktop/main.cjs");

const SERVICE = { origin: "http://127.0.0.1:7681", basePath: "/" };
const HEALTH = { ok: true, service: "Token Guardian", llmConfigured: false, chat: { configured: false }, voice: { configured: false } };
const WIDGET_HTML = '<!doctype html><meta name="guardian-widget" content="Token Guardian">';

async function localServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { server, port: server.address().port };
}
function within(bounds, area) {
  for (const value of Object.values(bounds)) assert.ok(Number.isInteger(value));
  assert.ok(bounds.width > 0 && bounds.height > 0);
  assert.ok(bounds.x >= area.x && bounds.y >= area.y, JSON.stringify({ bounds, area }));
  assert.ok(bounds.x + bounds.width <= area.x + area.width, JSON.stringify({ bounds, area }));
  assert.ok(bounds.y + bounds.height <= area.y + area.height, JSON.stringify({ bounds, area }));
}

test("desktop policy loads in Node without Electron or a running desktop", () => {
  assert.equal(desktop.getRuntimeState(), null);
  assert.deepEqual(desktop.getWindows(), {});
  assert.deepEqual(Object.keys(desktop.MODE_SIZES), ["compact", "butler", "chat"]);
});

test("persisted bounds are completely clamped across small and displaced displays", () => {
  const areas = [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: -1440, y: 32, width: 1440, height: 868 },
    { x: 2000, y: -900, width: 800, height: 600 },
    { x: 0, y: 0, width: 300, height: 200 },
    { x: 12, y: -3, width: 1, height: 1 },
  ];
  const records = [
    null,
    [],
    {},
    { x: -100000, y: 100000, width: 100000, height: 100000 },
    { x: NaN, y: Infinity, width: NaN, height: Infinity },
    { x: "900", y: "-99", width: "10000", height: "10000" },
    { x: 0.4, y: 0.9, width: -1, height: 0 },
  ];
  for (const area of areas) for (const record of records) within(desktop.clampBounds(record, area), area);
  for (const area of areas) for (const mode of Object.values(desktop.MODE_SIZES)) {
    const requested = { ...mode, x: area.x + area.width - 2, y: area.y + area.height - 2 };
    within(desktop.clampBounds(requested, area, { width: 360, height: mode.height }), area);
  }
});

test("valid saved coordinates survive clamping without changing monitors", () => {
  const area = { x: -1440, y: 32, width: 1440, height: 868 };
  const bounds = { x: -1200, y: 60, width: 420, height: 640 };
  assert.deepEqual(desktop.clampBounds(bounds, area), bounds);
});

test("document navigation trusts only the configured loopback origin and exact page", () => {
  assert.equal(desktop.allowedDocumentURL(`${SERVICE.origin}/widget.html?desktop=1#chat`, SERVICE, "/widget.html"), true);
  assert.equal(desktop.allowedDocumentURL(`${SERVICE.origin}/?app=1`, SERVICE, "/"), true);
  const foreign = [
    "https://127.0.0.1:7681/widget.html",
    "http://localhost:7681/widget.html",
    "http://127.0.0.1:7682/widget.html",
    "http://127.0.0.1.evil.example:7681/widget.html",
    "http://127.0.0.1:7681@evil.example/widget.html",
    "http://user:pass@127.0.0.1:7681/widget.html",
    "https://evil.example/widget.html",
    "data:text/html,<h1>remote</h1>",
    "file:///tmp/widget.html",
    "javascript:alert(1)",
    "about:blank",
    "not a URL",
    `${SERVICE.origin}/api/guardian/health`,
    `${SERVICE.origin}/widget.html/extra`,
    `${SERVICE.origin}/%77idget.html`,
  ];
  for (const url of foreign) assert.equal(desktop.allowedDocumentURL(url, SERVICE, "/widget.html"), false, url);
  const nested = { ...SERVICE, basePath: "/guardian/" };
  assert.equal(desktop.allowedDocumentURL(`${SERVICE.origin}/guardian/widget.html`, nested, "/guardian/widget.html"), true);
  assert.equal(desktop.allowedDocumentURL(`${SERVICE.origin}/widget.html`, nested, "/guardian/widget.html"), false);
});

test("Guardian health identity requires the supported key-free capability shape", () => {
  assert.equal(desktop.isGuardianHealth(HEALTH), true);
  assert.equal(desktop.isGuardianHealth({ ...HEALTH, llmConfigured: true, chat: { configured: true }, voice: { configured: true } }), true);
  for (const value of [null, [], {}, { ok: true }, { ...HEALTH, ok: "true" }, { ...HEALTH, service: "Other app" }, { ...HEALTH, llmConfigured: 1 }, { ...HEALTH, chat: {} }, { ...HEALTH, voice: null }]) {
    assert.equal(desktop.isGuardianHealth(value), false);
  }
});

test("IPC accepts only the managed window's main frame at its role-specific page", () => {
  const makeWindow = url => {
    const frame = { url };
    return { isDestroyed: () => false, webContents: { mainFrame: frame } };
  };
  const widget = makeWindow(`${SERVICE.origin}/widget.html?desktop=1`);
  const dashboard = makeWindow(`${SERVICE.origin}/?app=1`);
  const windows = { widget, dashboard, service: SERVICE };
  const event = window => ({ sender: window.webContents, senderFrame: window.webContents.mainFrame });
  assert.equal(desktop.validateIpcSender(event(widget), windows), true);
  assert.equal(desktop.validateIpcSender(event(dashboard), windows), true);
  const outsider = makeWindow(`${SERVICE.origin}/widget.html`);
  assert.equal(desktop.validateIpcSender(event(outsider), windows), false);
  assert.equal(desktop.validateIpcSender({ sender: widget.webContents }, windows), false);
  assert.equal(desktop.validateIpcSender({ sender: widget.webContents, senderFrame: { url: widget.webContents.mainFrame.url } }, windows), false);
  assert.equal(desktop.validateIpcSender({ sender: widget.webContents, senderFrame: dashboard.webContents.mainFrame }, windows), false);
  for (const invalidURL of [`${SERVICE.origin}/`, `${SERVICE.origin}/api/guardian`, "https://evil.example/widget.html", "file:///tmp/widget.html", "http://127.0.0.1:7682/widget.html"]) {
    widget.webContents.mainFrame.url = invalidURL;
    assert.equal(desktop.validateIpcSender(event(widget), windows), false, invalidURL);
  }
  widget.webContents.mainFrame.url = `${SERVICE.origin}/widget.html`;
  widget.isDestroyed = () => true;
  assert.equal(desktop.validateIpcSender(event(widget), windows), false);
  dashboard.webContents.mainFrame.url = `${SERVICE.origin}/widget.html`;
  assert.equal(desktop.validateIpcSender(event(dashboard), windows), false);
});

test("desktop IPC rejects arbitrary commands, routes, modes and arguments", () => {
  for (const command of ["openDashboard", "openBrowserDashboard", "openWidget", "getWindowState", "hideWidget", "quit"]) {
    assert.equal(desktop.validateDesktopCommand(command), true);
    for (const argument of [null, false, "https://evil.example", { path: "/private/file", OPENAI_API_KEY: "do-not-expose" }]) assert.equal(desktop.validateDesktopCommand(command, argument), false);
  }
  for (const mode of ["compact", "butler", "chat"]) assert.equal(desktop.validateDesktopCommand("setWidgetMode", mode), true);
  for (const mode of ["__proto__", "constructor", "full-screen", null, {}, true, 1]) assert.equal(desktop.validateDesktopCommand("setWidgetMode", mode), false);
  assert.equal(desktop.validateDesktopCommand("setAlwaysOnTop", true), true);
  assert.equal(desktop.validateDesktopCommand("setAlwaysOnTop", false), true);
  for (const argument of [undefined, null, 0, 1, "false", {}]) assert.equal(desktop.validateDesktopCommand("setAlwaysOnTop", argument), false);
  for (const command of ["exec", "readFile", "openExternal", "fetch", "setBounds", "setPosition", "closeBackend", "__proto__", {}, null]) assert.equal(desktop.validateDesktopCommand(command), false);
});

test("window state exposes only bounded display metadata and never environment or service credentials", () => {
  const safe = desktop.sanitizeDesktopState({
    mode: "chat", alwaysOnTop: true, bounds: { x: 50, y: -100, width: 420, height: 640, privatePath: "/private/data" },
    visible: true, dashboardVisible: false, platform: "darwin",
    server: { origin: SERVICE.origin, owned: true, env: { OPENAI_API_KEY: "DO-NOT-EXPOSE" } },
    env: { DEEPSEEK_API_KEY: "DO-NOT-EXPOSE" }, process: { home: "/private/data" }, secret: "DO-NOT-EXPOSE",
  });
  assert.deepEqual(safe, { mode: "chat", alwaysOnTop: true, bounds: { x: 50, y: -100, width: 420, height: 640 }, visible: true, dashboardVisible: false, platform: "darwin" });
  assert.equal(JSON.stringify(safe).includes("DO-NOT-EXPOSE"), false);
  assert.equal(JSON.stringify(safe).includes("private"), false);
  const invalid = desktop.sanitizeDesktopState({ mode: "constructor", alwaysOnTop: "true", bounds: { x: Infinity, y: 0, width: 400, height: 270 }, visible: "true", dashboardVisible: 1, platform: "/private/data" });
  assert.deepEqual(invalid, { mode: "compact", alwaysOnTop: false, bounds: null, visible: false, dashboardVisible: false, platform: "unknown" });
  assert.equal(desktop.sanitizeDesktopState(null).bounds, null);
});

test("backend shutdown requires actual ownership and a closable local instance", () => {
  const server = { close() {} };
  assert.equal(desktop.shouldStopBackend({ owned: true, server }), true);
  for (const owned of [false, undefined, null, 1, "true"]) assert.equal(desktop.shouldStopBackend({ owned, server }), false);
  assert.equal(desktop.shouldStopBackend({ owned: true, server: null }), false);
  assert.equal(desktop.shouldStopBackend({ owned: true, server: { close: "not a function" } }), false);
});

test("an occupied localhost port is reused only with Guardian identity and its widget document", async t => {
  let health = HEALTH;
  let widgetType = "text/html; charset=utf-8";
  let widgetBody = WIDGET_HTML;
  let widgetStatus = 200;
  const { port } = await localServer(t, (request, response) => {
    if (request.url === "/api/guardian/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(health));
    } else {
      response.writeHead(widgetStatus, { "Content-Type": widgetType });
      response.end(widgetBody);
    }
  });
  assert.deepEqual(await desktop.compatibleService(port, "/"), { origin: `http://127.0.0.1:${port}`, basePath: "/" });
  for (const rejected of [{ ok: true }, { ...HEALTH, service: "Other app" }, { ...HEALTH, ok: "true" }, null]) {
    health = rejected;
    assert.equal(await desktop.compatibleService(port, "/"), null);
  }
  health = HEALTH;
  widgetType = "application/json";
  assert.equal(await desktop.compatibleService(port, "/"), null);
  widgetType = "text/html";
  widgetBody = "<h1>An unrelated local application</h1>";
  assert.equal(await desktop.compatibleService(port, "/"), null);
  widgetBody = WIDGET_HTML;
  widgetStatus = 302;
  assert.equal(await desktop.compatibleService(port, "/"), null);
});

test("a trickling localhost occupant cannot prolong the complete service probe", { timeout: 6000 }, async t => {
  let bytesSent = 0;
  const { port } = await localServer(t, (_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write("{");
    const timer = setInterval(() => { bytesSent++; response.write(" "); }, 100);
    response.on("close", () => clearInterval(timer));
  });
  let deadline;
  try {
    const result = await Promise.race([
      desktop.compatibleService(port, "/"),
      new Promise((_resolve, reject) => { deadline = setTimeout(() => reject(new Error("Complete probe deadline was not enforced.")), 4500); }),
    ]);
    assert.equal(result, null);
    assert.ok(bytesSent >= 5, "The response remained active long enough to bypass an inactivity-only timeout.");
  } finally { clearTimeout(deadline); }
});

test("matching reused service has no shutdown ownership", async t => {
  const { port } = await localServer(t, (request, response) => {
    const health = request.url === "/api/guardian/health";
    response.writeHead(200, { "Content-Type": health ? "application/json" : "text/html" });
    response.end(health ? JSON.stringify(HEALTH) : WIDGET_HTML);
  });
  const acquired = await desktop.acquireService({ TOKENTRACKER_GUARDIAN_PORT: String(port) });
  if (acquired.ownedServer) t.after(() => new Promise(resolve => { acquired.ownedServer.close(resolve); acquired.ownedServer.closeAllConnections(); }));
  assert.equal(acquired.ownedServer, null);
  assert.equal(acquired.service.origin, `http://127.0.0.1:${port}`);
});

test("invalid configured ports fail before probing or opening a backend", async () => {
  for (const port of ["0", "65536", "-1", "Infinity", "7681evil", "1e3", " 7681 "]) {
    await assert.rejects(desktop.acquireService({ TOKENTRACKER_GUARDIAN_PORT: port }), /integer between 1 and 65535/);
  }
});

test("an explicit isolated store cannot reuse or stop an occupied service", async t => {
  let requests = 0;
  const { server: occupant, port } = await localServer(t, (_request, response) => { requests++; response.end("An unrelated occupant"); });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "guardian-desktop-policy-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const acquired = await desktop.acquireService({ TOKENTRACKER_GUARDIAN_PORT: String(port), TOKENTRACKER_GUARDIAN_DATA_DIR: directory, OPENAI_API_KEY: "synthetic-policy-key" });
  t.after(() => new Promise(resolve => { acquired.ownedServer.close(resolve); acquired.ownedServer.closeAllConnections(); }));
  assert.ok(acquired.ownedServer);
  assert.notEqual(acquired.service.origin, `http://127.0.0.1:${port}`);
  assert.equal(occupant.listening, true);
  assert.equal(requests, 0);
  assert.equal(JSON.stringify(acquired.service).includes("synthetic-policy-key"), false);
});

test("preload exposes only fixed window intents without filesystem, process or generic IPC", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "desktop", "preload.cjs"), "utf8");
  const exposed = new Map();
  const calls = [];
  const subscriptions = [];
  const context = {
    require(name) {
      assert.equal(name, "electron");
      return { contextBridge: { exposeInMainWorld(name, value) { exposed.set(name, value); } }, ipcRenderer: {
        invoke(...args) { calls.push(args); return Promise.resolve(null); },
        on(...args) { subscriptions.push(args); },
      } };
    },
    window: { dispatchEvent() {} },
    CustomEvent: class CustomEvent {},
  };
  vm.runInNewContext(source, context, { filename: "desktop/preload.cjs" });
  assert.deepEqual([...exposed.keys()], ["guardianDesktop"]);
  const bridge = exposed.get("guardianDesktop");
  assert.equal(Object.isFrozen(bridge), true);
  assert.deepEqual(Object.keys(bridge), ["isDesktop", "openDashboard", "openBrowserDashboard", "openWidget", "setWidgetMode", "setAlwaysOnTop", "getWindowState", "hideWidget", "quit"]);
  assert.equal(bridge.isDesktop, true);
  await bridge.openDashboard();
  await bridge.setWidgetMode("chat");
  await bridge.setAlwaysOnTop(false);
  await bridge.getWindowState();
  assert.deepEqual(calls, [
    ["guardian-desktop", "openDashboard", undefined],
    ["guardian-desktop", "setWidgetMode", "chat"],
    ["guardian-desktop", "setAlwaysOnTop", false],
    ["guardian-desktop", "getWindowState", undefined],
  ]);
  assert.deepEqual(subscriptions.map(([name]) => name), ["guardian:window-state"]);
});
