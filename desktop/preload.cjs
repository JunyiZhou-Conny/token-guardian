"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const invoke = (command, value) => ipcRenderer.invoke("guardian-desktop", command, value);

contextBridge.exposeInMainWorld("guardianDesktop", Object.freeze({
  isDesktop: true,
  openDashboard: () => invoke("openDashboard"),
  openBrowserDashboard: () => invoke("openBrowserDashboard"),
  openWidget: () => invoke("openWidget"),
  setWidgetMode: mode => invoke("setWidgetMode", mode),
  setAlwaysOnTop: enabled => invoke("setAlwaysOnTop", enabled),
  getWindowState: () => invoke("getWindowState"),
  hideWidget: () => invoke("hideWidget"),
  quit: () => invoke("quit"),
}));

ipcRenderer.on("guardian:window-state", (_event, state) => {
  window.dispatchEvent(new CustomEvent("guardian:window-state", { detail: state }));
});
