"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// The only bridge the page gets: read the latest status, ask for a refresh, or quit.
contextBridge.exposeInMainWorld("tokenMonitor", {
  getStatus: (options = {}) => ipcRenderer.invoke("status:get", { force: Boolean(options.force) }),
  onShown: (callback) => ipcRenderer.on("status:shown", () => callback()),
  quit: () => ipcRenderer.invoke("app:quit"),
});
