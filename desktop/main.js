// WatchAlong desktop app - Electron main process.
// Runs the bundled WatchAlong server (server/index.js) on localhost and opens
// the existing website in a native window. The website code itself is reused
// untouched; only progress keys are stored via localStorage exactly like the web.

import { app, BrowserWindow, shell, Menu } from "electron";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEV = !app.isPackaged;
const PORT = process.env.WATCHALONG_PORT || 8787;
const APP_URL = `http://localhost:${PORT}/`;

let started = false;

function serverEntry() {
  if (DEV) {
    return join(app.getAppPath(), "..", "server", "index.js");
  }
  return join(process.resourcesPath, "server", "index.js");
}

async function startServer() {
  if (started) return;
  started = true;
  const entry = serverEntry();
  if (!existsSync(entry)) {
    // Fall back to importing from the packaged resources path directly.
    console.error("[watchalong] missing server entry:", entry);
    return;
  }
  try {
    await import(pathToFileURL(entry).href);
  } catch (err) {
    // If something already listens on the port, that's fine - we load it.
    console.error("[watchalong] server import failed:", err);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#13161c",
    autoHideMenuBar: true,
    title: "WatchAlong",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.loadURL(APP_URL);
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("session-quit", () => app.quit());