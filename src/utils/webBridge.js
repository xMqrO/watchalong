// ── WatchAlong webBridge ──────────────────────────────────────────────────────
// Provides a browser-safe stand-in for the Electron `window.electron` API so the
// rest of the app (which was written for Electron) runs unmodified in a browser.
// Anything that genuinely needs Electron (native downloads, subtitles over the
// filesystem, Rich Presence, window chrome) is replaced with a safe no-op or a
// web-equivalent fallback. Imported once from main.jsx.

import { resolveAllManga, setPlayerVideo } from "./webAllManga";

function noop() {}

function noopHandler() {
  return noop;
}

const webBridge = {
  // ── Secure storage ──
  async secureGet(key) {
    try {
      const raw = localStorage.getItem(`watchalong_enc_${key}`);
      return raw ? atob(raw) : null;
    } catch {
      return null;
    }
  },
  async secureSet(key, value) {
    try {
      if (value) localStorage.setItem(`watchalong_enc_${key}`, btoa(value));
      else localStorage.removeItem(`watchalong_enc_${key}`);
    } catch {}
  },

  // ── Backup (desktop-only; expose plain no-ops) ──
  onScheduledBackupRequested: noopHandler,
  offScheduledBackupRequested: noopHandler,
  async getScheduledBackupSettings() {
    return null;
  },
  async setScheduledBackupSettings() {},
  async performScheduledBackup() {
    return { ok: false };
  },

  getAppVersion: () => Promise.resolve("1.0.0"),
  async showNotification() {},

  getPlatform: () => Promise.resolve(null),

  onConfirmClose: noopHandler,
  offConfirmClose: noopHandler,
  async respondClose() {},

  // ── Downloads (not supported in the browser build) ──
  async getDownloads() {
    return [];
  },
  async fileExists() {
    return false;
  },
  async deleteDownload() {
    return { ok: true };
  },
  async deleteAllDownloads() {
    return { ok: true };
  },
  async pruneSubtitlePaths() {
    return { ok: true, subtitlePaths: [] };
  },
  async scanDirectory() {
    return [];
  },
  onDownloadProgress: noopHandler,
  offDownloadProgress: noopHandler,
  async runDownload() {
    return { ok: false, error: "Downloads are not available in the browser build" };
  },
  async checkDownloader() {
    return { exists: false };
  },
  async getVideoDuration() {
    return null;
  },
  async openPathAtTime() {},
  async openPath() {},
  async showInFolder() {},

  setZoomFactor: noop,

  // ── M3u8 / subtitle interception (requires webview interception; N/A) ──
  onM3u8Found: noopHandler,
  offM3u8Found: noopHandler,
  onSubtitleFound: noopHandler,
  offSubtitleFound: noopHandler,
  async playerStopped() {},
  async queryVideoProgress() {
    return null;
  },

  // ── Fullscreen / PiP window events (N/A) ──
  onWebviewEnterFullscreen: noopHandler,
  offWebviewEnterFullscreen: noopHandler,
  onWebviewLeaveFullscreen: noopHandler,
  offWebviewLeaveFullscreen: noopHandler,
  onPipOpened: noopHandler,
  offPipOpened: noopHandler,
  onPipClosed: noopHandler,
  offPipClosed: noopHandler,
  async getPipWebContentsId() {
    return null;
  },
  async closePipWindow() {},
  async openPipWindow(url) {
    if (url) {
      const win = window.open(url, "_blank", "noopener");
      if (win) win.opener = null;
    }
    return null;
  },

  // ── Blocked request stats (webview interception; N/A) ──
  async getBlockStats() {
    return { total: 0 };
  },
  onBlockedUpdate: noopHandler,
  offBlockedUpdate: noopHandler,

  // ── Subtitle search (SubDL/Wyzie require desktop client secrets) ──
  async searchSubtitles() {
    return { ok: false, error: "Subtitle downloads are not available in the browser build" };
  },
  async getSubtitleUrl() {
    return { ok: false };
  },

  // ── AllManga anime resolver (browser port) ──
  resolveAllManga,
  setPlayerVideo,

  // ── Misc ──
  async openExternal(url) {
    const win = window.open(url, "_blank", "noopener");
    if (win) win.opener = null;
  },
  async pickFolder() {
    return null;
  },
  async getInstallPath() {
    return null;
  },
  async getCacheSize() {
    return null;
  },
  async getDownloadsSize() {
    return null;
  },
  async clearWatchData() {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("watchalong_")) localStorage.removeItem(key);
      }
    } catch {}
  },
  async resetApp() {
    try {
      localStorage.clear();
    } catch {}
  },
  async clearAppCache() {
    try {
      for (const key of Object.keys(localStorage)) {
        if (
          key.startsWith("watchalong_") &&
          (key.includes("anilist") ||
            key.includes("episodeGroup") ||
            key.includes("aniskip") ||
            key.startsWith("dlDur_"))
        ) {
          localStorage.removeItem(key);
        }
      }
    } catch {}
  },

  // ── Discord Rich Presence (N/A) ──
  async discordRpcSetEnabled() {},
  async discordRpcUpdateActivity() {},

  // ── Wyzie redeem (open in browser tab) ──
  async wyzieValidateKey() {
    return { ok: false };
  },
  async wyzieOpenRedeem() {
    this.openExternal("https://wyzie.ru/settings");
  },

  // ── Window chrome (N/A in browser) ──
  windowIsMaximized: () => Promise.resolve(false),
  onWindowMaximize: noopHandler,
  offWindowMaximize: noopHandler,
  windowMinimize: noop,
  windowToggleMaximize: noop,
  windowClose: noop,
  windowSetMaximumSize: noop,
};

export function installWebBridge() {
  if (typeof window !== "undefined" && !window.electron) {
    window.electron = webBridge;
  }
  return window.electron || null;
}

export default webBridge;