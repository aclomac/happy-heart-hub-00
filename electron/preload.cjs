/* Preload runs in an isolated context. Keep it tiny.
 * Expose a small versioned API so the renderer can detect Electron
 * and so later phases can wire SQLite / native file dialogs without
 * rewriting the renderer. */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("erpovo", {
  isDesktop: true,
  platform: process.platform,
  versions: process.versions,
});
