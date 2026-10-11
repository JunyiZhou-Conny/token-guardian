"use strict";

// Electron's bootstrap does not guarantee require.main === module for its main
// entry. Keep startup explicit and the implementation importable for Node tests.
require("./main.cjs").runDesktop().catch(error => {
  console.error(`Token Guardian could not start: ${error.message}`);
  const { app, dialog } = require("electron");
  if (app.isReady()) dialog.showErrorBox("Token Guardian could not start", error.message);
  app.quit();
});
