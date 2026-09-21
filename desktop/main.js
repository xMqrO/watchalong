// WatchAlong desktop app - Electron main process.
// Runs the bundled WatchAlong server (server/index.js) on localhost and opens
// the existing website in a native window. The website code itself is reused
// untouched; only progress keys are stored via localStorage exactly like the web.
//
// Auto-update works like Discord: on startup (and then hourly) the updater
// queries the GitHub releases page; an update is downloaded silently and the
// user is asked to install + restart.

import { app, BrowserWindow, shell, Menu, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEV = !app.isPackaged;
const PORT = process.env.WATCHALONG_PORT || 8787;
const APP_URL = `http://localhost:${PORT}/`;

let started = false;
let mainWindow = null;

// --- Single instance: only one WatchAlong should run at a time -------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

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

// --- Auto-update (Discord style) --------------------------------------------
function setupAutoUpdater() {
  if (DEV) return; // updates only run in packaged builds

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", () => {
    console.log("[watchalong] update available, downloading...");
  });

  autoUpdater.on("error", (err) => {
    // The app keeps working even if the updater fails (offline, etc).
    console.error("[watchalong] updater error:", err.message);
  });

  autoUpdater.on("update-downloaded", () => {
    const win = mainWindow;
    const parent = win && !win.isDestroyed() ? win : null;
    const buttons = ["Restart now", "Later"];
    const choice = dialog.showMessageBoxSync(parent, {
      type: "info",
      title: "WatchAlong updated",
      message: "A new version of WatchAlong has been downloaded.",
      detail: "Restart now to apply the update.",
      buttons,
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (choice === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  // Check right away, then once per hour while the app is open.
  autoUpdater.checkForUpdatesAndNotify();
  setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 60 * 60 * 1000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
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

  // No app menu, no menu bar - nothing that looks like a browser.
  Menu.setApplicationMenu(null);

  // Open links (trailers / external pages) in the OS browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Lock the window to the bundled app; block any in-app navigation away.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_URL) && url !== `http://localhost:${PORT}/`) {
      event.preventDefault();
      if (url.startsWith("http://") || url.startsWith("https://")) {
        shell.openExternal(url);
      }
    }
  });

  // Whole window is draggable areas only inside the site; keep the native
  // frame on Windows so the OS provides minimize/maximize/close.
  mainWindow.loadURL(APP_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.watchalong.desktop");
  await startServer();
  createWindow();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("session-quit", () => app.quit());