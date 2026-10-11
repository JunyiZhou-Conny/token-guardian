"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const MODE_SIZES = Object.freeze({
  compact: { width: 400, height: 270 },
  butler: { width: 400, height: 470 },
  chat: { width: 420, height: 640 },
});
const CHANNEL = "guardian-desktop";
let runtime = null;

function boundedNumber(value, fallback, minimum, maximum) {
  const candidate = Number.isFinite(value) ? value : fallback;
  return Math.round(Math.max(minimum, Math.min(maximum, candidate)));
}

function clampBounds(bounds, workArea, minimum = { width: 360, height: 250 }) {
  bounds = bounds && typeof bounds === "object" && !Array.isArray(bounds) ? bounds : {};
  const width = boundedNumber(bounds.width, 400, Math.min(minimum.width, workArea.width), workArea.width);
  const height = boundedNumber(bounds.height, 270, Math.min(minimum.height, workArea.height), workArea.height);
  return {
    x: boundedNumber(bounds.x, workArea.x + workArea.width - width - 20, workArea.x, workArea.x + workArea.width - width),
    y: boundedNumber(bounds.y, workArea.y + 40, workArea.y, workArea.y + workArea.height - height),
    width,
    height,
  };
}

function allowedDocumentURL(value, service, documentPath) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && !url.username && !url.password &&
      url.origin === service.origin && url.pathname === documentPath;
  } catch { return false; }
}

function isGuardianHealth(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && value.ok === true &&
    value.service === "Token Guardian" && typeof value.llmConfigured === "boolean" &&
    !!value.chat && typeof value.chat.configured === "boolean" &&
    !!value.voice && typeof value.voice.configured === "boolean";
}

function validateDesktopCommand(command, value) {
  if (typeof command !== "string") return false;
  if (command === "setWidgetMode") return typeof value === "string" && Object.hasOwn(MODE_SIZES, value);
  if (command === "setAlwaysOnTop") return typeof value === "boolean";
  return ["openDashboard", "openBrowserDashboard", "openWidget", "getWindowState", "hideWidget", "quit"].includes(command) && value === undefined;
}

function validateIpcSender(event, { widget, dashboard, service }) {
  const window = [widget, dashboard].find(candidate => candidate && !candidate.isDestroyed() && candidate.webContents === event.sender);
  if (!window || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
  const documentPath = window === widget ? `${service.basePath}widget.html` : service.basePath;
  return allowedDocumentURL(event.senderFrame.url, service, documentPath);
}

function sanitizeDesktopState(state) {
  const bounds = state?.bounds;
  const validBounds = bounds && ["x", "y", "width", "height"].every(key => Number.isFinite(bounds[key])) && bounds.width > 0 && bounds.height > 0;
  return {
    mode: typeof state?.mode === "string" && Object.hasOwn(MODE_SIZES, state.mode) ? state.mode : "compact",
    alwaysOnTop: state?.alwaysOnTop === true,
    bounds: validBounds ? Object.fromEntries(["x", "y", "width", "height"].map(key => [key, Math.round(bounds[key])])) : null,
    visible: state?.visible === true,
    dashboardVisible: state?.dashboardVisible === true,
    platform: ["darwin", "win32", "linux"].includes(state?.platform) ? state.platform : "unknown",
  };
}

function shouldStopBackend({ owned, server }) {
  return owned === true && !!server && typeof server.close === "function";
}

function getRuntimeState() {
  if (!runtime) return null;
  const { widget, dashboard, service, mode, ownedServer } = runtime;
  return {
    mode,
    alwaysOnTop: !!widget && !widget.isDestroyed() && widget.isAlwaysOnTop(),
    bounds: widget && !widget.isDestroyed() ? widget.getBounds() : null,
    visible: !!widget && !widget.isDestroyed() && widget.isVisible(),
    dashboardVisible: !!dashboard && !dashboard.isDestroyed() && dashboard.isVisible(),
    platform: process.platform,
    server: service ? { origin: service.origin, basePath: service.basePath, owned: !!ownedServer } : null,
  };
}

function readLocalURL(url, maximum = 128 * 1024) {
  return new Promise((resolve) => {
    let settled = false;
    let deadline;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(result);
    };
    const request = http.get(url, { timeout: 1200, headers: { Accept: "application/json, text/html" } }, response => {
      const chunks = [];
      let length = 0;
      response.on("data", chunk => {
        length += chunk.length;
        if (length > maximum) { request.destroy(); finish(null); }
        else chunks.push(chunk);
      });
      response.on("end", () => finish({ status: response.statusCode, type: response.headers["content-type"] || "", body: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", () => finish(null));
    });
    // A socket timeout alone can be kept alive by a trickling local occupant.
    // Bound the complete probe, not only pauses between response bytes.
    deadline = setTimeout(() => { request.destroy(); finish(null); }, 1500);
    deadline.unref?.();
    request.on("timeout", () => { request.destroy(); finish(null); });
    request.on("error", () => finish(null));
  });
}

async function compatibleService(port, basePath) {
  const origin = `http://127.0.0.1:${port}`;
  const health = await readLocalURL(`${origin}/api/guardian/health`, 64 * 1024);
  if (health?.status !== 200) return null;
  try {
    const value = JSON.parse(health.body);
    if (!isGuardianHealth(value)) return null;
  } catch { return null; }
  const widget = await readLocalURL(`${origin}${basePath}widget.html`);
  if (widget?.status !== 200 || !widget.type.startsWith("text/html") ||
      !/name=["']guardian-widget["']/.test(widget.body)) return null;
  return { origin, basePath };
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const failed = error => { server.removeListener("listening", started); reject(error); };
    const started = () => { server.removeListener("error", failed); resolve(server.address().port); };
    server.once("error", failed);
    server.once("listening", started);
    server.listen(port, "127.0.0.1");
  });
}

async function acquireService(env = process.env) {
  const rawPort = env.TOKENTRACKER_GUARDIAN_PORT || "7681";
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
    throw new Error("TOKENTRACKER_GUARDIAN_PORT must be an integer between 1 and 65535.");
  }
  const preferredPort = Number(rawPort);
  // An explicit data directory cannot be compared with an existing service.
  // Keep isolated fixtures and alternate accounts in their own local server.
  if (!env.TOKENTRACKER_GUARDIAN_DATA_DIR) {
    const candidates = [{ port: preferredPort, basePath: "/" }, { port: 7681, basePath: "/" }, { port: 7680, basePath: "/guardian/" }];
    const checked = new Set();
    for (const candidate of candidates) {
      const key = `${candidate.port}:${candidate.basePath}`;
      if (checked.has(key)) continue;
      checked.add(key);
      const service = await compatibleService(candidate.port, candidate.basePath);
      if (service) return { service, ownedServer: null };
    }
  }
  const { createGuardianServer } = require("../guardian-server/server.js");
  const { createStore } = require("../guardian-server/store.js");
  const trackerHome = env.TOKENTRACKER_GUARDIAN_DATA_DIR || path.join(os.homedir(), ".tokentracker");
  const server = createGuardianServer({ store: createStore({ trackerHome }), env });
  let port;
  try { port = await listen(server, preferredPort); }
  catch (error) {
    if (error.code !== "EADDRINUSE") throw error;
    port = await listen(server, 0);
  }
  return { service: { origin: `http://127.0.0.1:${port}`, basePath: "/" }, ownedServer: server };
}

async function runDesktop() {
  const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, session, dialog, shell } = require("electron");
  const testMode = process.argv.includes("--guardian-desktop-test");
  app.setName("Token Guardian");
  if (testMode && process.env.TOKENTRACKER_GUARDIAN_DESKTOP_TEST_USER_DATA) {
    const directory = path.resolve(process.env.TOKENTRACKER_GUARDIAN_DESKTOP_TEST_USER_DATA);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    app.setPath("userData", directory);
  }
  // No debugging listener is enabled by this application. An explicit external
  // test harness may start Electron with its own temporary inspector arguments.
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }

  let quitting = false;
  let tray = null;
  let saveTimer = null;
  let settingsPath;
  let saved = { mode: "compact", alwaysOnTop: true, bounds: {}, dashboardBounds: null };
  runtime = { widget: null, dashboard: null, service: null, ownedServer: null, mode: "compact" };

  function windowState() {
    const state = getRuntimeState();
    if (!state) return null;
    return sanitizeDesktopState(state);
  }

  function publishState() {
    const state = windowState();
    for (const window of [runtime.widget, runtime.dashboard]) {
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send("guardian:window-state", state);
      }
    }
  }

  function saveState() {
    if (!settingsPath) return;
    if (runtime.widget && !runtime.widget.isDestroyed()) {
      saved.mode = runtime.mode;
      saved.alwaysOnTop = runtime.widget.isAlwaysOnTop();
      saved.bounds[runtime.mode] = runtime.widget.getBounds();
    }
    if (runtime.dashboard && !runtime.dashboard.isDestroyed()) saved.dashboardBounds = runtime.dashboard.getBounds();
    try {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(`${settingsPath}.tmp`, JSON.stringify(saved), { mode: 0o600 });
      fs.renameSync(`${settingsPath}.tmp`, settingsPath);
    } catch (error) { console.warn(`Could not save Guardian window preferences (${error.code || "write error"}).`); }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 250);
    publishState();
  }

  function currentWorkArea(bounds) {
    return screen.getDisplayMatching(bounds).workArea;
  }

  function widgetConstraints(area, mode) {
    const widget = runtime.widget;
    const minimum = { width: Math.min(360, area.width), height: Math.min(MODE_SIZES[mode].height, area.height) };
    const maximum = { width: Math.min(900, area.width), height: Math.min(1000, area.height) };
    const [oldWidth, oldHeight] = widget.getMinimumSize();
    if (oldWidth > maximum.width || oldHeight > maximum.height) widget.setMinimumSize(1, 1);
    widget.setMaximumSize(maximum.width, maximum.height);
    widget.setMinimumSize(minimum.width, minimum.height);
    return minimum;
  }

  function showWidget() {
    const widget = runtime.widget;
    if (!widget || widget.isDestroyed()) return;
    const area = currentWorkArea(widget.getBounds());
    const minimum = widgetConstraints(area, runtime.mode);
    widget.setBounds(clampBounds(widget.getBounds(), area, minimum));
    if (runtime.mode === "chat") { widget.show(); widget.focus(); }
    else widget.showInactive();
    publishState();
  }

  function setWidgetMode(mode) {
    if (typeof mode !== "string" || !Object.hasOwn(MODE_SIZES, mode)) throw new Error("Unknown widget mode.");
    const widget = runtime.widget;
    if (!widget || widget.isDestroyed()) return windowState();
    const previous = widget.getBounds();
    saved.bounds[runtime.mode] = previous;
    runtime.mode = mode;
    const size = saved.bounds[mode] || MODE_SIZES[mode];
    const area = currentWorkArea(previous);
    const minimum = widgetConstraints(area, mode);
    widget.setBounds(clampBounds({ ...previous, width: size.width, height: size.height }, area, minimum));
    if (mode === "chat") { widget.show(); widget.focus(); }
    scheduleSave();
    return windowState();
  }

  function setAlwaysOnTop(value) {
    if (typeof value !== "boolean") throw new Error("Always-on-top must be a boolean.");
    runtime.widget.setAlwaysOnTop(value, "floating");
    scheduleSave();
    refreshTrayMenu();
    return windowState();
  }

  function secureWindow(window, documentPath) {
    const allowed = url => allowedDocumentURL(url, runtime.service, documentPath);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, url) => { if (!allowed(event.url || url)) event.preventDefault(); });
    window.webContents.on("will-redirect", (event, url) => { if (!allowed(event.url || url)) event.preventDefault(); });
    window.webContents.on("will-frame-navigate", event => {
      if (!event.isMainFrame || !allowed(event.url)) event.preventDefault();
    });
    window.webContents.on("will-attach-webview", event => event.preventDefault());
    window.webContents.on("did-finish-load", publishState);
    window.on("move", scheduleSave);
    window.on("resize", scheduleSave);
    window.on("show", publishState);
    window.on("hide", publishState);
    window.on("close", event => {
      saveState();
      if (!quitting) { event.preventDefault(); window.hide(); publishState(); }
    });
  }

  function openDashboard() {
    if (runtime.dashboard && !runtime.dashboard.isDestroyed()) {
      runtime.dashboard.show(); runtime.dashboard.focus(); publishState(); return windowState();
    }
    const area = screen.getPrimaryDisplay().workArea;
    const bounds = clampBounds(saved.dashboardBounds || { x: area.x + 40, y: area.y + 40, width: 1240, height: 860 }, area, { width: 800, height: 600 });
    const dashboard = new BrowserWindow({
      ...bounds, title: "Token Guardian", show: false, minWidth: Math.min(800, area.width), minHeight: Math.min(600, area.height),
      backgroundColor: "#f8f6fa", webPreferences: preferences(),
    });
    runtime.dashboard = dashboard;
    secureWindow(dashboard, runtime.service.basePath);
    dashboard.once("ready-to-show", () => { dashboard.show(); dashboard.focus(); publishState(); });
    dashboard.loadURL(`${runtime.service.origin}${runtime.service.basePath}?app=1`).catch(() => {
      if (!quitting) dialog.showErrorBox("Dashboard unavailable", "The local dashboard could not load. Restart Token Guardian and try again.");
    });
    return windowState();
  }

  function openBrowserDashboard() {
    // No renderer-supplied URL is accepted. Browser voice remains available in
    // the verified local full dashboard while native media permissions are denied.
    const url = `${runtime.service.origin}${runtime.service.basePath}`;
    if (!allowedDocumentURL(url, runtime.service, runtime.service.basePath)) throw new Error("The local dashboard address is invalid.");
    return shell.openExternal(url).then(() => windowState());
  }

  function preferences() {
    return {
      preload: path.join(__dirname, "preload.cjs"),
      partition: "persist:token-guardian",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: testMode,
    };
  }

  function refreshTrayMenu() {
    if (!tray || !runtime.widget) return;
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Show floating widget", click: showWidget },
      { label: "Open dashboard", click: openDashboard },
      { label: "Open dashboard in browser", click: openBrowserDashboard },
      { type: "separator" },
      ...Object.keys(MODE_SIZES).map(mode => ({ label: `${mode[0].toUpperCase()}${mode.slice(1)} view`, click: () => { setWidgetMode(mode); showWidget(); } })),
      { label: "Always on top", type: "checkbox", checked: runtime.widget.isAlwaysOnTop(), click: item => setAlwaysOnTop(item.checked) },
      { label: "Hide widget", click: () => runtime.widget.hide() },
      { type: "separator" },
      { label: "Quit Token Guardian", click: () => app.quit() },
    ]));
  }

  function trustedSender(event) {
    return validateIpcSender(event, runtime);
  }

  ipcMain.handle(CHANNEL, (event, command, value) => {
    if (!trustedSender(event) || !validateDesktopCommand(command, value)) throw new Error("Untrusted or invalid desktop request.");
    switch (command) {
      case "openDashboard": return openDashboard();
      case "openBrowserDashboard": return openBrowserDashboard();
      case "openWidget": showWidget(); return windowState();
      case "setWidgetMode": return setWidgetMode(value);
      case "setAlwaysOnTop": return setAlwaysOnTop(value);
      case "getWindowState": return windowState();
      case "hideWidget": runtime.widget.hide(); return windowState();
      case "quit": app.quit(); return null;
      default: throw new Error("Unknown desktop command.");
    }
  });

  app.on("second-instance", showWidget);
  app.on("activate", showWidget);
  app.on("window-all-closed", () => {});
  app.on("before-quit", () => {
    quitting = true;
    clearTimeout(saveTimer);
    saveState();
    if (shouldStopBackend({ owned: !!runtime.ownedServer, server: runtime.ownedServer })) {
      runtime.ownedServer.close();
      runtime.ownedServer.closeAllConnections?.();
      runtime.ownedServer = null;
    }
  });
  // The terminal launcher forwards its signals to Electron. Route them through
  // the same quit path as the tray so only this process's backend is closed.
  const quitFromSignal = () => { quitting = true; app.quit(); };
  process.on("SIGINT", quitFromSignal);
  process.on("SIGTERM", quitFromSignal);
  app.once("will-quit", () => {
    process.removeListener("SIGINT", quitFromSignal);
    process.removeListener("SIGTERM", quitFromSignal);
  });
  await app.whenReady();
  if (quitting) return runtime;
  settingsPath = path.join(app.getPath("userData"), "window-state.json");
  try {
    const value = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) {
      saved = { mode: Object.hasOwn(MODE_SIZES, value.mode) ? value.mode : "compact", alwaysOnTop: value.alwaysOnTop !== false,
        bounds: value.bounds && typeof value.bounds === "object" && !Array.isArray(value.bounds) ? value.bounds : {},
        dashboardBounds: value.dashboardBounds && typeof value.dashboardBounds === "object" ? value.dashboardBounds : null };
    }
  } catch { /* A missing or malformed preference file uses safe defaults. */ }
  runtime.mode = saved.mode;
  const acquired = await acquireService();
  if (quitting) {
    if (shouldStopBackend({ owned: !!acquired.ownedServer, server: acquired.ownedServer })) {
      acquired.ownedServer.close();
      acquired.ownedServer.closeAllConnections?.();
    }
    return runtime;
  }
  runtime.service = acquired.service;
  runtime.ownedServer = acquired.ownedServer;

  const localSession = session.fromPartition("persist:token-guardian");
  localSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  localSession.setPermissionCheckHandler(() => false);
  localSession.on("will-download", event => event.preventDefault());
  localSession.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
    let allowed = false;
    try {
      const url = new URL(details.url);
      allowed = url.protocol === "http:" && url.origin === runtime.service.origin && !url.username && !url.password;
      if (url.protocol === "data:" && details.resourceType === "image") allowed = true;
    } catch { /* Block unparseable requests. */ }
    callback({ cancel: !allowed });
  });

  const primary = screen.getPrimaryDisplay().workArea;
  const requested = saved.bounds[runtime.mode] || { ...MODE_SIZES[runtime.mode], x: primary.x + primary.width - MODE_SIZES[runtime.mode].width - 28, y: primary.y + 44 };
  const area = screen.getDisplayMatching({ x: Number(requested.x) || primary.x, y: Number(requested.y) || primary.y, width: 400, height: 270 }).workArea;
  const minimum = { width: Math.min(360, area.width), height: Math.min(MODE_SIZES[runtime.mode].height, area.height) };
  const widget = new BrowserWindow({
    ...clampBounds(requested, area, minimum),
    title: "Token Guardian floating widget", frame: false, transparent: true, backgroundColor: "#00000000",
    show: false, alwaysOnTop: saved.alwaysOnTop, hasShadow: true, skipTaskbar: true, resizable: true,
    minWidth: minimum.width, minHeight: minimum.height, maxWidth: Math.min(900, area.width), maxHeight: Math.min(1000, area.height),
    ...(process.platform === "darwin" ? { type: "panel" } : {}),
    webPreferences: preferences(),
  });
  runtime.widget = widget;
  widget.setAlwaysOnTop(saved.alwaysOnTop, "floating");
  if (process.platform === "darwin") {
    app.dock?.hide();
    widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  secureWindow(widget, `${runtime.service.basePath}widget.html`);
  widget.once("ready-to-show", showWidget);
  widget.loadURL(`${runtime.service.origin}${runtime.service.basePath}widget.html?desktop=1`).catch(() => {
    if (!quitting) dialog.showErrorBox("Floating widget unavailable", "The local widget could not load. Restart Token Guardian and try again.");
  });
  const iconPath = path.join(ROOT, "TokenTrackerBar", "AppIcon-iOS-Default-1024x1024@1x.png");
  try {
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 }));
    tray.setToolTip("Token Guardian");
    tray.on("click", showWidget);
    tray.on("double-click", showWidget);
    refreshTrayMenu();
  } catch (error) { console.warn(`Menu-bar icon unavailable (${error.code || "tray error"}).`); }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Token Guardian", submenu: [
      { label: "Show floating widget", click: showWidget },
      { label: "Open dashboard", click: openDashboard },
      { label: "Open dashboard in browser", click: openBrowserDashboard },
      { type: "separator" },
      { label: "Quit Token Guardian", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
    ] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
  ]));
  console.log(`Token Guardian floating widget: ${runtime.service.origin}${runtime.service.basePath}widget.html`);
  return runtime;
}

module.exports = { MODE_SIZES, clampBounds, allowedDocumentURL, compatibleService, acquireService, runDesktop,
  isGuardianHealth, validateDesktopCommand, validateIpcSender, sanitizeDesktopState, shouldStopBackend,
  getRuntimeState, getWindows: () => runtime ? { widget: runtime.widget, dashboard: runtime.dashboard } : {} };
