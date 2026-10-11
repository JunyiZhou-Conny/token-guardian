"use strict";

// Playwright loads application entries through its own loader, so require.main
// belongs to that loader. Start the unchanged application explicitly for QA.
globalThis.__guardianDesktopTest = require("../desktop/main.cjs");
globalThis.__guardianDesktopTest.runDesktop().catch(error => {
  console.error(error.stack);
  require("electron").app.quit();
});
