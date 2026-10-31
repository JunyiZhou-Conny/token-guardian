"use strict";

// Menu-bar host: a tray icon that opens a small window with one card per provider.
// The renderer has no Node access; it can only ask this process for the latest status.

const path = require("node:path");
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, session } = require("electron");
const { collectStatus } = require("./status");
const { demoStatus } = require("./demo");
const { createRefresher } = require("./refresher");

const WINDOW_SIZE = { width: 360, height: 540 };
const DEMO = process.env.TOKEN_MONITOR_DEMO === "1";
const SHOW_ON_START = process.argv.includes("--show");
// A tray click first blurs (and hides) the open window; don't let that same click reopen it.
const BLUR_CLICK_GRACE_MS = 300;

let tray = null;
let win = null;
let quitting = false;
let lastBlurHideAt = 0;

const refresher = createRefresher({
  load: () => (DEMO ? demoStatus() : collectStatus()),
  onUpdate: (status) => updateTray(status),
});

// Menu-bar text: the most-used window across providers, e.g. "61%".
function updateTray(status) {
  if (!tray || !status) return;
  const lines = [];
  let highest = null;
  for (const provider of status.providers) {
    for (const window of provider.windows) {
      lines.push(`${provider.provider} ${window.label}: ${Math.round(window.usedPercent)}% used`);
      if (highest === null || window.usedPercent > highest) highest = window.usedPercent;
    }
  }
  tray.setToolTip(lines.length ? lines.join("\n") : "Token Monitor");
  if (process.platform === "darwin") tray.setTitle(highest === null ? "" : `${Math.round(highest)}%`);
}

function positionWindow() {
  const trayBounds = tray?.getBounds();
  const display = trayBounds?.width
    ? screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
    : screen.getPrimaryDisplay();
  const area = display.workArea;
  let x = area.x + area.width - WINDOW_SIZE.width - 12;
  let y = area.y + 8;
  if (trayBounds?.width) {
    x = Math.round(trayBounds.x + trayBounds.width / 2 - WINDOW_SIZE.width / 2);
    y = trayBounds.y < area.y + area.height / 2 ? area.y + 4 : trayBounds.y - WINDOW_SIZE.height - 4;
  }
  x = Math.min(Math.max(x, area.x + 4), area.x + area.width - WINDOW_SIZE.width - 4);
  win.setPosition(x, y, false);
}

function createWindow() {
  win = new BrowserWindow({
    ...WINDOW_SIZE,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    transparent: process.platform === "darwin",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, "ui", "index.html"));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.on("blur", () => {
    if (SHOW_ON_START || !win.isVisible()) return;
    win.hide();
    lastBlurHideAt = Date.now();
  });
  // Cmd+W hides instead of destroying, so the tray can always reopen the window.
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });
}

function toggleWindow() {
  if (win.isVisible()) {
    win.hide();
    return;
  }
  if (Date.now() - lastBlurHideAt < BLUR_CLICK_GRACE_MS) return;
  positionWindow();
  win.show();
  win.focus();
  win.webContents.send("status:shown");
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "trayTemplate.png"));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Token Monitor");
  const menu = Menu.buildFromTemplate([
    { label: "Show usage", click: () => toggleWindow() },
    { label: "Refresh now", click: () => refresher.refresh({ force: true }).then(() => win.webContents.send("status:shown")) },
    { type: "separator" },
    { label: "Quit Token Monitor", role: "quit" },
  ]);
  tray.on("click", toggleWindow);
  tray.on("right-click", () => tray.popUpContextMenu(menu));
  // Linux trays usually only open a context menu.
  if (process.platform === "linux") tray.setContextMenu(menu);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => win && toggleWindow());
  app.on("before-quit", () => {
    quitting = true;
    refresher.stop();
  });
  app.whenReady().then(() => {
    if (process.platform === "darwin") app.dock?.hide();
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    ipcMain.handle("status:get", (_event, options) => refresher.refresh({ force: Boolean(options?.force) }));
    ipcMain.handle("app:quit", () => app.quit());
    createWindow();
    createTray();
    refresher.refresh(); // also schedules every later automatic refresh
    if (SHOW_ON_START) win.once("ready-to-show", () => toggleWindow());
  });
  // Keep running in the menu bar when the window is closed.
  app.on("window-all-closed", (event) => event.preventDefault?.());
}
