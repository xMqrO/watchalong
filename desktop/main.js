// WatchAlong desktop app - Electron main process.
// Runs the bundled WatchAlong server (server/index.js) on localhost and opens
// the existing website in a native window. The website code itself is reused
// untouched; only progress keys are stored via localStorage exactly like the web.
//
// Auto-update works like Discord: on startup (and then hourly) the updater
// queries the GitHub releases page; an update is downloaded silently and the
// user is asked to install + restart.

import { app, BrowserWindow, shell, Menu, dialog, ipcMain, session } from "electron";
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;
import { join, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";

const DEV = !app.isPackaged;
const PORT = process.env.WATCHALONG_PORT || 8787;
const APP_URL = "https://watchalong-iota.vercel.app/";

// Domains allowed to open in the OS browser (trailers, external pages).
// Anything not on this list that tries to open a popup is silently dropped.
const TRUSTED_DOMAINS = [
  "youtube.com", "youtu.be",
  "google.com", "googleapis.com",
  "themoviedb.org", "imdb.com",
  "github.com",
  "vercel.app",
];

// Ad/tracker domains blocked at the network level inside the player iframes.
const AD_URL_PATTERNS = [
  "*://*.doubleclick.net/*", "*://*.googlesyndication.com/*",
  "*://*.adnxs.com/*", "*://*.outbrain.com/*", "*://*.taboola.com/*",
  "*://*.spbgc.com/*", "*://*.interlinecustomroofingllc.com/*",
  "*://*.trafficjunky.net/*", "*://*.exoclick.com/*", "*://*.juicyads.com/*",
  "*://*.hilltopads.net/*", "*://*.popcash.net/*", "*://*.propellerads.com/*",
  "*://*.adsterra.com/*", "*://*.yllix.com/*", "*://*.plugrush.com/*",
];
const APP_DIR = dirname(fileURLToPath(import.meta.url));
const ICON_PATH = join(APP_DIR, "build", "icon.ico");

// --- Desktop settings (userData/desktop-settings.json) ----------------------
const SETTINGS_FILE = join(app.getPath("userData"), "desktop-settings.json");
const DEFAULT_SETTINGS = { hardwareAcceleration: true };

function readSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(SETTINGS_FILE, "utf8")) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  try {
    writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  } catch (err) {
    console.error("[watchalong] could not save settings:", err.message);
  }
  return next;
}

// --- Hardware acceleration (Discord style) ----------------------------------
// On by default: the GPU decodes and draws the video, which keeps playback
// smooth and the CPU cool. Users with driver trouble (flicker, black video)
// can turn it off in Settings; like Discord, the change applies on restart
// because Chromium decides this before the app starts.
const settingsAtLaunch = readSettings();
if (settingsAtLaunch.hardwareAcceleration === false) {
  app.disableHardwareAcceleration();
} else {
  // Use the GPU even on drivers Chromium is cautious about, and rasterize /
  // upload frames on the GPU for smoother scrolling and video.
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
}

// Allow embedded players to autoplay without requiring a click directly on
// the iframe — without this Chromium blocks VixSrc on first load.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

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
    icon: existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(APP_DIR, "preload.cjs"),
    },
  });

  // No app menu, no menu bar - nothing that looks like a browser.
  Menu.setApplicationMenu(null);

  // Only open popup windows from trusted domains in the OS browser.
  // Everything else (ad redirects, tracking links) is silently blocked.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (TRUSTED_DOMAINS.some((d) => host === d || host.endsWith("." + d))) {
        shell.openExternal(url);
      }
    } catch {}
    return { action: "deny" };
  });

  // Lock the window to the app; block any in-app navigation away.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_URL)) {
      event.preventDefault();
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        if (TRUSTED_DOMAINS.some((d) => host === d || host.endsWith("." + d))) {
          shell.openExternal(url);
        }
      } catch {}
    }
  });

  // Whole window is draggable areas only inside the site; keep the native
  // frame on Windows so the OS provides minimize/maximize/close.
  mainWindow.loadURL(APP_URL);

  // Use destroy() so the beforeunload veto in the redirect shield doesn't
  // block the close button — the OS-level protections make it unnecessary.
  mainWindow.on("close", (e) => {
    e.preventDefault();
    mainWindow.destroy();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// --- Bridge for the Settings page (see preload.cjs) -------------------------
ipcMain.handle("wa:hardware-acceleration:get", () => ({
  enabled: readSettings().hardwareAcceleration !== false,
  active: settingsAtLaunch.hardwareAcceleration !== false,
}));
ipcMain.handle("wa:hardware-acceleration:set", (_e, enabled) => {
  const next = writeSettings({ hardwareAcceleration: !!enabled });
  return {
    enabled: next.hardwareAcceleration,
    active: settingsAtLaunch.hardwareAcceleration !== false,
  };
});
ipcMain.handle("wa:relaunch", () => {
  app.relaunch();
  app.exit(0);
});

app.whenReady().then(async () => {
  app.setAppUserModelId("com.watchalong.desktop");

  // Block ad/tracker requests from inside player iframes.
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: AD_URL_PATTERNS },
    ({ url }, cb) => {
      console.log("[watchalong] blocked ad:", url);
      cb({ cancel: true });
    }
  );

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