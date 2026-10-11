"use strict";

// Real Electron windows on an isolated desktop. No user store or cloud keys.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const MAIN = path.join(ROOT, "desktop", "main.cjs");
const ARTIFACTS = path.join(ROOT, "artifacts");

function playwright() {
  if (process.env.GUARDIAN_PLAYWRIGHT_PACKAGE) return require(process.env.GUARDIAN_PLAYWRIGHT_PACKAGE);
  return require("../desktop/node_modules/playwright-core");
}

async function freePort() {
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function nativeState(app) {
  return app.evaluate((_electron, filename) => globalThis.__guardianDesktopTest.getRuntimeState(), MAIN);
}

async function launchFixture({ directory, seed = true } = {}) {
  const temporary = !directory;
  directory ||= await fs.mkdtemp(path.join(os.tmpdir(), "guardian-desktop-"));
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/API_KEY|^TOKENTRACKER_GUARDIAN_|^ELECTRON_RUN_AS_NODE$/.test(key)) delete env[key];
  }
  env.TOKENTRACKER_GUARDIAN_DATA_DIR = path.join(directory, "usage");
  env.TOKENTRACKER_GUARDIAN_DESKTOP_TEST_USER_DATA = path.join(directory, "desktop");
  const portFile = path.join(directory, "fixture-port.txt");
  let port;
  try { port = Number(await fs.readFile(portFile, "utf8")); }
  catch { port = await freePort(); await fs.writeFile(portFile, String(port)); }
  env.TOKENTRACKER_GUARDIAN_PORT = String(port);
  const app = await playwright()._electron.launch({
    executablePath: require("../desktop/node_modules/electron"),
    args: [path.join(ROOT, "guardian-test", "desktop-entry.cjs"), "--guardian-desktop-test", ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
    cwd: ROOT, env, timeout: 30000,
  });
  try {
    const widget = await app.firstWindow();
    widget.setDefaultTimeout(10000);
    await widget.waitForFunction(() => window.guardianDesktop?.isDesktop && document.querySelector(".mode-badge"));
    const state = await nativeState(app);
    assert.equal(state.server.owned, true);
    if (seed) {
      const now = Date.now();
      const data = Array.from({ length: 7 }, (_, index) => ({
        source: "cursor", timestamp: new Date(now - (60 - index * 10) * 60000).toISOString(),
        model: "claude-sonnet-4", inputTokens: 150, outputTokens: 50, cachedTokens: 200,
        totalTokens: 400, costUsd: 0.25, costType: "provider_reported",
        project: "Synthetic desktop fixture", sessionId: "desktop-sheet-review",
        automationId: "desktop-scheduled-review", requestId: `desktop-request-${index}`,
      }));
      const response = await fetch(`${state.server.origin}/api/guardian/import`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format: "json", data }),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).added, data.length);
      await widget.locator('[data-widget-action="refresh"]').click();
      await widget.waitForFunction(() => document.querySelector(".mode-badge")?.textContent === "Local records");
    }
    return {
      app, widget, directory, environment: env, origin: state.server.origin,
      async close() { await app.close(); if (temporary) await fs.rm(directory, { recursive: true, force: true }); },
    };
  } catch (error) {
    await app.close();
    if (temporary) await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function smoke() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "guardian-desktop-smoke-"));
  let fixture;
  let outsider;
  let customerLauncher;
  const checks = [];
  const check = (condition, description) => { assert.ok(condition, description); checks.push(description); };
  try {
    await fs.mkdir(ARTIFACTS, { recursive: true });
    fixture = await launchFixture({ directory });
    const { app, widget, origin } = fixture;
    const errors = [];
    const chatRequests = [];
    widget.on("pageerror", error => errors.push(error.message));
    widget.on("request", request => { if (request.url().endsWith("/api/guardian/chat")) chatRequests.push(request.postDataJSON()); });
    let state = await nativeState(app);
    check(state.mode === "compact" && state.bounds.width === 400 && state.bounds.height === 270, "Compact window has native 400 by 270 bounds");
    check(state.alwaysOnTop && state.visible, "Native floating window is visible and always on top");
    check((await widget.locator(".usage-summary").textContent()).includes("2.8K"), "Widget reads the real isolated service records");
    check((await widget.locator('[data-source="codex"] strong').textContent()) === "—", "Unobserved source is unavailable rather than zero");
    check(await widget.evaluate(() => getComputedStyle(document.querySelector(".widget-grip")).getPropertyValue("-webkit-app-region") === "drag"), "Header is a native drag region");
    check(await widget.evaluate(() => getComputedStyle(document.querySelector('[data-widget-action="pin"]')).getPropertyValue("-webkit-app-region") === "no-drag"), "Window buttons remain clickable outside the drag region");
    await widget.screenshot({ path: path.join(ARTIFACTS, "guardian-floating-compact.png") });

    await widget.locator('[data-widget-action="summon"]').click();
    await widget.waitForFunction(() => document.querySelector("#widget").classList.contains("mode-butler"));
    state = await nativeState(app);
    check(state.mode === "butler" && state.bounds.height === 470, "Summon expands a real native companion window");
    check(chatRequests.length === 0, "Summoning never starts a model request");
    await widget.locator('button[data-companion="jinx"]').click();
    await widget.locator('button[data-skin="cozy"]').click();
    await widget.waitForFunction(() => document.querySelector(".atlas-art img")?.complete);
    check((await widget.locator(".atlas-art img").getAttribute("src")).includes("champion-variants"), "Cozy companion artwork loads in the widget");
    await widget.screenshot({ path: path.join(ARTIFACTS, "guardian-floating-companion.png") });

    await widget.locator('[data-widget-action="chat"]').click();
    await widget.waitForSelector("#widget-chat-input");
    state = await nativeState(app);
    check(state.mode === "chat" && state.bounds.height === 640 && state.bounds.width === 420, "Chat expands native bounds to 420 by 640");
    check(await widget.locator("#widget-chat-input").evaluate(element => element === document.activeElement), "Chat focuses the question draft");
    check(await widget.locator("#widget-provider").inputValue() === "local", "Explanation defaults to local and unconfigured cloud providers are disabled");
    await widget.locator("#widget-chat-input").fill("Why did the scheduled review use tokens?");
    await widget.locator('[data-widget-action="send"]').click();
    await widget.waitForFunction(() => document.querySelectorAll(".answer-mode").length >= 2);
    check(chatRequests.length === 1 && chatRequests[0].provider === "local", "Sending asks the actual local handler once");
    const answerText = await widget.locator(".widget-chat-log").textContent();
    check(answerText.includes("desktop-scheduled-review") && answerText.includes("2,800 tokens"), "Butler answer identifies the recorded automation and its observed usage");
    await widget.locator('[data-widget-action="session-evidence"]').click();
    check(await widget.locator("dialog[open]").isVisible(), "Recorded evidence opens inside the widget");
    await widget.locator('[data-widget-action="evidence-close"]').click();
    await widget.screenshot({ path: path.join(ARTIFACTS, "guardian-floating-chat.png") });

    const newWindow = app.waitForEvent("window");
    await widget.locator('[data-widget-action="dashboard"]').first().click();
    const dashboard = await newWindow;
    dashboard.on("pageerror", error => errors.push(error.message));
    await dashboard.waitForSelector(".companion-name");
    check((await dashboard.locator(".companion-name").textContent()).includes("Jinx"), "Full native dashboard shares the widget companion preference");
    check(await dashboard.locator('.companion-card img').getAttribute("src") === "./assets/champion-variants.png", "Full dashboard shares the cozy outfit");
    await dashboard.locator('[data-tab="collection"]').first().click();
    await dashboard.locator('button[data-companion="jhin"]').click();
    await widget.waitForFunction(() => document.querySelector(".widget-chat-header h1")?.textContent.includes("Jhin"));
    check(true, "Dashboard preference changes update the floating window without reload");
    await dashboard.locator('[data-action="floating"]').click();
    check((await nativeState(app)).visible, "Full dashboard restores the floating view");
    check(app.windows().length === 2, "Full dashboard and widget are separate desktop windows");

    await widget.locator('[data-widget-action="pin"]').click();
    check(!(await nativeState(app)).alwaysOnTop, "Unpin changes the native window level");
    await widget.locator('[data-widget-action="pin"]').click();
    check((await nativeState(app)).alwaysOnTop, "Pin restores the native always-on-top level");
    await widget.locator('[data-widget-action="hide"]').click();
    check(!(await nativeState(app)).visible, "Hide hides the native window without closing the service");
    await dashboard.evaluate(() => window.guardianDesktop.openWidget());
    check((await nativeState(app)).visible, "A hidden widget can be restored from the dashboard");

    const security = await app.evaluate((_electron, filename) => {
      const { widget, dashboard } = globalThis.__guardianDesktopTest.getWindows();
      return [widget, dashboard].map(window => {
        const prefs = window.webContents.getLastWebPreferences();
        return { nodeIntegration: prefs.nodeIntegration, contextIsolation: prefs.contextIsolation, sandbox: prefs.sandbox, webviewTag: prefs.webviewTag };
      });
    }, MAIN);
    check(security.every(prefs => !prefs.nodeIntegration && prefs.contextIsolation && prefs.sandbox && !prefs.webviewTag), "Both native renderers retain isolation and no Node or webviews");
    check(await widget.evaluate(() => typeof require === "undefined" && typeof process === "undefined"), "Renderer cannot access Node globals");
    const publicState = await widget.evaluate(() => window.guardianDesktop.getWindowState());
    check(!("server" in publicState) && !("env" in publicState), "Renderer state excludes server details and environment");
    const rejected = await widget.evaluate(async () => {
      const results = await Promise.allSettled([window.guardianDesktop.setWidgetMode("__proto__"), window.guardianDesktop.setAlwaysOnTop("yes")]);
      return results.every(result => result.status === "rejected");
    });
    check(rejected, "Native IPC rejects invalid modes and pin values");
    const windowCount = app.windows().length;
    await widget.evaluate(() => window.open("https://example.invalid/", "foreign"));
    check(app.windows().length === windowCount, "Popup requests cannot create remote desktop windows");

    let remoteRequests = 0;
    outsider = http.createServer((_request, response) => { remoteRequests++; response.writeHead(200); response.end("external"); });
    await new Promise(resolve => outsider.listen(0, "127.0.0.1", resolve));
    const foreign = `http://127.0.0.1:${outsider.address().port}`;
    check(await widget.evaluate(async url => { try { await fetch(url); return false; } catch { return true; } }, foreign), "Renderer requests to other origins are blocked before transmission");
    check(remoteRequests === 0, "Blocked request never reaches an external service");
    const localURL = widget.url();
    await widget.evaluate(url => { location.href = url; }, foreign);
    await widget.waitForTimeout(150);
    check(widget.url() === localURL && remoteRequests === 0, "Remote top-level navigation is blocked");
    check(await widget.evaluate(async () => {
      try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach(track => track.stop()); return false; }
      catch (error) { return ["NotAllowedError", "NotFoundError"].includes(error.name); }
    }), "Desktop media permissions do not silently grant microphone access");

    await widget.evaluate(() => window.guardianDesktop.setWidgetMode("compact"));
    await app.evaluate((_electron, filename) => globalThis.__guardianDesktopTest.getWindows().widget.setPosition(112, 132), MAIN);
    await widget.waitForTimeout(350);
    await app.evaluate((_electron, filename) => globalThis.__guardianDesktopTest.getWindows().widget.close(), MAIN);
    check(!(await nativeState(app)).visible && (await fetch(`${origin}/api/guardian/health`)).ok, "Closing the widget hides it and keeps the owned service alive");
    check(errors.length === 0, `Native views have no uncaught JavaScript errors: ${errors.join(", ")}`);
    await fixture.close(); fixture = null;
    check(await fetch(`${origin}/api/guardian/health`).then(() => false, () => true), "Quitting closes the backend owned by this app");

    fixture = await launchFixture({ directory, seed: false });
    state = await nativeState(fixture.app);
    check(state.mode === "compact" && state.bounds.x === 112 && state.bounds.y === 132, "Window mode and position survive relaunch");
    const saved = await fixture.widget.evaluate(() => JSON.parse(localStorage.getItem("token-guardian-preferences")));
    check(saved.companion === "jhin" && saved.skins.jinx === "cozy", "Companion preferences survive relaunch");
    await fixture.close(); fixture = null;
    const preferenceFile = path.join(directory, "desktop", "window-state.json");
    const persisted = JSON.parse(await fs.readFile(preferenceFile, "utf8"));
    persisted.bounds.compact = { x: -50000, y: 50000, width: 50000, height: 50000 };
    await fs.writeFile(preferenceFile, JSON.stringify(persisted));
    fixture = await launchFixture({ directory, seed: false });
    const clamped = await fixture.app.evaluate(({ screen }, filename) => {
      const state = globalThis.__guardianDesktopTest.getRuntimeState();
      return { bounds: state.bounds, area: screen.getDisplayMatching(state.bounds).workArea };
    }, MAIN);
    check(clamped.bounds.x >= clamped.area.x && clamped.bounds.y >= clamped.area.y && clamped.bounds.x + clamped.bounds.width <= clamped.area.x + clamped.area.width && clamped.bounds.y + clamped.bounds.height <= clamped.area.y + clamped.area.height, "Stale offscreen preferences are clamped to the current display");
    const customerEnv = fixture.environment;
    const customerOrigin = fixture.origin;
    await fixture.close(); fixture = null;
    // Launch the actual customer command without Playwright's entry wrapper.
    // This catches Electron bootstrap differences that window automation misses.
    customerLauncher = spawn(process.execPath, [path.join(ROOT, "scripts", "start-floating-guardian.cjs"), "--guardian-desktop-test", ...(process.platform === "linux" ? ["--no-sandbox"] : [])], {
      cwd: ROOT, env: customerEnv, stdio: ["ignore", "pipe", "pipe"],
    });
    let launchOutput = "";
    customerLauncher.stdout.on("data", chunk => { launchOutput = (launchOutput + chunk).slice(-4000); });
    customerLauncher.stderr.on("data", chunk => { launchOutput = (launchOutput + chunk).slice(-4000); });
    const exit = new Promise(resolve => customerLauncher.once("exit", resolve));
    const deadline = Date.now() + 10000;
    let started = false;
    while (Date.now() < deadline && customerLauncher.exitCode === null) {
      started = launchOutput.includes("Token Guardian floating widget:") && await fetch(`${customerOrigin}/api/guardian/health`, { signal: AbortSignal.timeout(500) }).then(response => response.ok, () => false);
      if (started) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    check(started, `The real customer launcher starts the service without a QA entry wrapper${started ? "" : ": " + launchOutput}`);
    check((await fetch(`${customerOrigin}/widget.html`).then(response => response.text())).includes('name="guardian-widget"'), "The customer launcher serves the floating application");
    customerLauncher.kill("SIGTERM");
    await Promise.race([exit, new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Customer launcher did not stop")), 5000).unref())]);
    customerLauncher = null;
    check(await fetch(`${customerOrigin}/api/guardian/health`).then(() => false, () => true), "Stopping the customer launcher releases its owned backend");
    await fs.writeFile(path.join(ARTIFACTS, "guardian-desktop-smoke.json"), JSON.stringify({ checks, platform: process.platform, isolatedSyntheticData: true }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, platform: process.platform }));
  } finally {
    if (fixture) await fixture.close();
    if (customerLauncher && customerLauncher.exitCode === null) customerLauncher.kill("SIGTERM");
    if (outsider) await new Promise(resolve => outsider.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

module.exports = { launchFixture, nativeState, MAIN, ROOT };
if (require.main === module) smoke().catch(error => { console.error(error.stack); process.exitCode = 1; });
