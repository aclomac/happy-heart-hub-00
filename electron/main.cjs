/* ERPOVO Electron main process.
 *
 * Strategy:
 *   - dev: load http://localhost:3000 (vite dev server, started separately).
 *   - prod: spawn the bundled TanStack Start server (.output/server/index.mjs)
 *           as a child process on 127.0.0.1:<port>, then load it.
 *
 * Why not file://? This project is SSR (nitro). There is no static
 * dist/index.html. We boot the production server in-process instead.
 */
const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const isDev = !app.isPackaged;
const DEV_URL = process.env.ERPOVO_DEV_URL || "http://localhost:3000";
const PROD_PORT = Number(process.env.ERPOVO_PORT || 38217);

let mainWindow = null;
let serverProc = null;

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) return reject(new Error("server timeout"));
        setTimeout(tick, 300);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    tick();
  });
}

function startProdServer() {
  const entry = path.join(process.resourcesPath, "app", ".output", "server", "index.mjs");
  const fallback = path.join(__dirname, "..", ".output", "server", "index.mjs");
  const serverEntry = require("fs").existsSync(entry) ? entry : fallback;

  serverProc = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      PORT: String(PROD_PORT),
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: "inherit",
  });
  serverProc.on("exit", (code) => {
    console.log(`[erpovo] embedded server exited code=${code}`);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    title: "ERPOVO Business ERP",
    backgroundColor: "#0F172A",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.maximize();
  mainWindow.show();

  // Open external links in default browser, never inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    const allowed = new URL(isDev ? DEV_URL : `http://127.0.0.1:${PROD_PORT}`);
    if (target.origin !== allowed.origin) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  const url = isDev ? DEV_URL : `http://127.0.0.1:${PROD_PORT}`;
  try {
    if (!isDev) {
      startProdServer();
      await waitForServer(url);
    }
    await mainWindow.loadURL(url);
  } catch (err) {
    dialog.showErrorBox(
      "ERPOVO failed to start",
      `Could not reach ${url}.\n\n${err && err.message ? err.message : err}`,
    );
  }
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { role: "quit", label: "Exit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload", label: "Reload" },
        { role: "forceReload", label: "Force Reload" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Toggle Fullscreen" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        ...(isDev ? [{ type: "separator" }, { role: "toggleDevTools" }] : []),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About ERPOVO",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "About ERPOVO",
              message: "ERPOVO Business ERP",
              detail: "Desktop edition. Local/personal mode.",
            });
          },
        },
        {
          label: "Open Project Site",
          click: () => shell.openExternal("https://erpovo.com"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (serverProc) {
    try { serverProc.kill(); } catch { /* ignore */ }
  }
  if (process.platform !== "darwin") app.quit();
});
