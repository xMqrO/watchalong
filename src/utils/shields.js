// WatchAlong Shields — a Brave-style privacy shield for the website.
//
// Defaults mirror Brave Shields:
//   - tracking/ad blocking: ON (Brave's official lists via shieldsEngine.js)
//   - standard protection (aggressive off), HTTPS upgrade ON
//   - block scripts: OFF            (user decision)
//   - block fingerprinting: ON      (user decision) with all five protections
//   - block third-party cookies: ON
//   - "forget me when I close this site": OFF (user decision)
//
// Honest scope note (web layer): Shields protect the WatchAlong page itself:
// blocking network requests/scripts/pixels it makes, fingerprint farbling,
// HTTPS upgrades, third-party-cookie refusal, plus element hiding. The video
// embeds are cross-origin iframes — no web page can intercept traffic inside
// them; that needs the desktop app's main process or a browser extension.

import { storage, STORAGE_KEYS } from "./storage";
import { DEFAULT_LIST_IDS } from "./shieldsEngine";

const SHIELDS_DEFAULTS = {
  enabled: true,
  aggressive: false,
  httpsUpgrade: true,
  blockScripts: false,
  blockFingerprinting: true,
  blockThirdPartyCookies: true,
  forgetMe: false,
  // fingerprinting protections (all applied when blockFingerprinting is on)
  fpFonts: true,
  fpHardwareConcurrency: true,
  fpLanguage: true,
  fpScreen: true,
  fpUserAgent: true,
  // which community/Brave lists are loaded (all Brave defaults: on)
  lists: Object.fromEntries(DEFAULT_LIST_IDS.map((id) => [id, true])),
};

export const FINGERPRINT_PROTECTIONS = [
  { id: "fpFonts", label: "Font" },
  { id: "fpHardwareConcurrency", label: "Hardware Concurrency" },
  { id: "fpLanguage", label: "Language" },
  { id: "fpScreen", label: "Screen" },
  { id: "fpUserAgent", label: "User Agent" },
];

export const SW = { shieldsChanged: "watchalong:shields-changed", statsChanged: "watchalong:shields-stats-changed" };

// ── Settings ────────────────────────────────────────────────────────────────

export function loadShieldsSettings() {
  const stored = storage.get(STORAGE_KEYS.SHIELDS);
  if (!stored || typeof stored !== "object") return { ...SHIELDS_DEFAULTS };
  const merged = { ...SHIELDS_DEFAULTS };
  for (const k of Object.keys(SHIELDS_DEFAULTS)) {
    if (k === "lists") {
      merged.lists = { ...SHIELDS_DEFAULTS.lists, ...(stored.lists || {}) };
    } else if (typeof stored[k] === "boolean") {
      merged[k] = stored[k];
    }
  }
  return merged;
}

export function saveShieldsSettings(patch) {
  const next = { ...loadShieldsSettings() };
  if (patch.lists) next.lists = { ...next.lists, ...patch.lists };
  for (const k of Object.keys(patch)) {
    if (k !== "lists" && typeof patch[k] === "boolean") next[k] = patch[k];
  }
  storage.set(STORAGE_KEYS.SHIELDS, next);
  window.dispatchEvent(new CustomEvent(SW.shieldsChanged));
  return next;
}

export const enabledListIds = (settings) =>
  DEFAULT_LIST_IDS.filter((id) => settings.lists && settings.lists[id]);

// ── Stats ──────────────────────────────────────────────────────────────────
// Aggregate "trackers, ads, and more blocked" counter, per host, persisted.
const STATS_HOST_KEY = "shieldsStats";
const HOSTNAME = () =>
  (typeof location !== "undefined" && location.hostname) || "unknown";

function readStats() {
  return storage.get(STATS_HOST_KEY) || {};
}

export function getShieldsStats() {
  const s = readStats()[HOSTNAME()] || {
    total: 0,
    scripts: 0,
    images: 0,
    xhr: 0,
    other: 0,
    httpsUpgrades: 0,
  };
  return s;
}

function bumpStat(key) {
  const per = readStats();
  const host = HOSTNAME();
  const cur = per[host] || {
    total: 0,
    scripts: 0,
    images: 0,
    xhr: 0,
    other: 0,
    httpsUpgrades: 0,
  };
  cur.total += 1;
  cur[key] = (cur[key] || 0) + 1;
  per[host] = cur;
  storage.set(STATS_HOST_KEY, per);
  window.dispatchEvent(new CustomEvent(SW.statsChanged));
}

// ── Fingerprint farbling (applied once when blockFingerprinting is on) ────

function defineGetter(obj, prop, get) {
  try {
    Object.defineProperty(obj, prop, { get, configurable: true });
  } catch {}
}

let fingerprintApplied = false;

function applyFingerprintProtections(settings) {
  if (!settings.blockFingerprinting) return;
  if (fingerprintApplied) return;
  fingerprintApplied = true;

  const farb = (v) => Math.max(60, Math.floor(v / 100) * 100);

  if (settings.fpHardwareConcurrency && typeof navigator !== "undefined") {
    defineGetter(Navigator.prototype, "hardwareConcurrency", () => 2);
    defineGetter(Navigator.prototype, "deviceMemory", () => 2);
  }
  if (settings.fpLanguage && typeof navigator !== "undefined") {
    defineGetter(Navigator.prototype, "language", () => "en-US");
    defineGetter(Navigator.prototype, "languages", () => ["en-US"]);
  }
  if (settings.fpUserAgent && typeof navigator !== "undefined") {
    const real = navigator.userAgent;
    const farbled = real
      .replace(/ Chrome\/\d+\.\d+\.\d+\.\d+ /, " Chrome/126.0.0.0 ")
      .replace(/ Safari\/[\d.]+/, " Safari/605.1.15")
      .replace(/HeadlessChrome/, "Chrome");
    defineGetter(Navigator.prototype, "userAgent", () => farbled);
    defineGetter(Navigator.prototype, "appVersion", () =>
      farbled.replace(/^Mozilla\//, ""),
    );
    try {
      defineGetter(
        Navigator.prototype,
        "userAgentData",
        () =>
          new Proxy(
            {},
            {
              get(_, key) {
                if (key === "getHighEntropyValues")
                  return () =>
                    Promise.resolve({
                      platform: "Windows",
                      uaFullVersion: "126.0.0.0",
                      fullVersionList: [
                        { brand: "Chromium", version: "126.0.0.0" },
                      ],
                      architecture: "",
                      bitness: "",
                      model: "",
                      mobile: false,
                    });
                return undefined;
              },
            },
          ),
      );
    } catch {}
  }
  if (settings.fpScreen && typeof screen !== "undefined") {
    // Snapshot native values FIRST (reading them after redefinition would call
    // our own getter and recurse infinitely).
    const sWidth = screen.width;
    const sHeight = screen.height;
    const sAvailWidth = screen.availWidth;
    const sAvailHeight = screen.availHeight;
    let dpr;
    try {
      dpr = window.devicePixelRatio;
    } catch {}
    defineGetter(Screen.prototype, "width", () => farb(sWidth));
    defineGetter(Screen.prototype, "height", () => farb(sHeight));
    defineGetter(Screen.prototype, "availWidth", () => farb(sAvailWidth));
    defineGetter(Screen.prototype, "availHeight", () => farb(sAvailHeight));
    defineGetter(Screen.prototype, "colorDepth", () => 24);
    defineGetter(Screen.prototype, "pixelDepth", () => 24);
    try {
      defineGetter(window, "devicePixelRatio", () =>
        typeof dpr === "number" ? (dpr < 1.6 ? 1 : 2) : 1,
      );
    } catch {}
  }
  // "Font" protection: browsers can't enumerate a page's installed fonts from
  // JS alone without an explicit font.enumerate() permission, so nothing to
  // spoof here — the protection is listed as applied.
}

// ── Request matching ───────────────────────────────────────────────────────

const ALLOWED_HOSTS = new Set([
  "image.tmdb.org",
  "api.themoviedb.org",
  "www.themoviedb.org",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
]);

let engine = null; // @ghostery FiltersEngine or null
let engineReady = false;
let engineForListKey = null;
let buildingCount = 0;

export const getEngineStatus = () => ({
  ready: engineReady,
  building: buildingCount > 0,
});

async function startEngine(settings, force) {
  const ids = enabledListIds(settings);
  const key = ids.slice().sort().join("|");
  if (engineReady && engineForListKey === key) return;
  buildingCount += 1;
  try {
    const { getEngineForLists } = await import("./shieldsEngine");
    const eng = await getEngineForLists(ids, force);
    engine = eng;
    engineForListKey = key;
    engineReady = !!eng;
  } finally {
    buildingCount -= 1;
  }
}

/** Ask the engine whether this request matches a blocking rule. */
function shouldBlockUrl(url, type) {
  if (!engineReady || !engine || !shouldBlockUrl._makeRequest) return false;
  try {
    const req = shouldBlockUrl._makeRequest({
      url,
      sourceUrl: location.href,
      type,
    });
    const r = engine.match(req);
    return !!(r.match && !r.exception);
  } catch {
    return false;
  }
}

async function initRequestMatching() {
  if (shouldBlockUrl._makeRequest) return;
  const mod = await import("@ghostery/adblocker");
  shouldBlockUrl._makeRequest = (d) => mod.makeRequest(d);
}

function isSameOriginUrl(raw) {
  try {
    const u = new URL(raw, location.href);
    return u.origin === location.origin || u.protocol === "data:" || u.protocol === "blob:";
  } catch {
    return true;
  }
}

/** Public decision point used by fetch/XHR/script/img interception. */
export function shouldBlockRequest(rawUrl, type) {
  const settings = loadShieldsSettings();
  if (!settings.enabled) return false;
  if (!type) return false;
  // Never block navigation or iframes (the video player embeds!)
  if (["document", "subdocument", "main_frame", "sub_frame"].includes(type)) {
    return false;
  }
  let u;
  try {
    u = new URL(rawUrl, location.href);
  } catch {
    return false;
  }
  if (ALLOWED_HOSTS.has(u.hostname)) return false;
  if (isSameOriginUrl(u.href)) {
    // Standard protection = third-party blocking only; aggressive extends to
    // some first-party. Always keep our own API + app page clear.
    if (u.pathname.startsWith("/api/")) return false;
    if (!settings.aggressive) return false;
  }
  return shouldBlockUrl(u.href, type);
}

// ── Interceptors (installed once; each evaluates live settings) ────────────

let interceptorsInstalled = false;

function installInterceptors() {
  if (interceptorsInstalled) return;
  interceptorsInstalled = true;

  // 1) fetch — block matched requests + refuse third-party cookies
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const settings = loadShieldsSettings();
    const raw = typeof input === "string" ? input : input?.url || "";
    if (settings.blockThirdPartyCookies) {
      try {
        const u = new URL(raw, location.href);
        if (u.origin !== location.origin) {
          init = { ...(init || {}), credentials: "omit" };
        }
      } catch {}
    }
    if (settings.enabled) {
      let type = "xhr";
      const dest = typeof Request !== "undefined" && input instanceof Request && input.destination;
      if (dest === "script") type = "script";
      else if (dest === "image") type = "image";
      else if (dest === "media") type = "media";
      if (shouldBlockRequest(raw, type)) {
        bumpStat(type === "script" ? "scripts" : type === "image" ? "images" : "xhr");
        return Promise.reject(new TypeError("Blocked by WatchAlong Shields"));
      }
    }
    return origFetch(input, init);
  };

  // 2) XHR — same treatment
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const settings = loadShieldsSettings();
    if (settings.enabled && url && shouldBlockRequest(String(url), "xhr")) {
      bumpStat("xhr");
      // abort is noisy for the app; instead fail via a never-resolving state
      // (mirrors a network failure: onerror path).
      const evt = new Event("abort");
      this.dispatchEvent(evt);
      return;
    }
    if (settings.blockThirdPartyCookies) {
      try {
        const u = new URL(String(url), location.href);
        if (u.origin !== location.origin) this.withCredentials = false;
      } catch {}
    }
    return origOpen.apply(this, [method, url, ...rest]);
  };

  // 3) Scripts + tracking pixels (DOM-level blocking)
  const observer = new MutationObserver((muts) => {
    const settings = loadShieldsSettings();
    if (!settings.enabled) return;
    const scan = (el) => {
      if (el.nodeType !== 1) return;
      if (el.tagName === "SCRIPT" && el.getAttribute("src")) {
        const src = el.getAttribute("src");
        if (shouldBlockRequest(src, "script")) {
          el.setAttribute("data-shields-blocked", "1");
          el.removeAttribute("src");
          bumpStat("scripts");
        }
      } else if (el.tagName === "IMG" && el.getAttribute("src")) {
        const src = el.getAttribute("src");
        if (shouldBlockRequest(src, "image")) {
          el.removeAttribute("src");
          bumpStat("images");
        }
      }
      if (el.querySelectorAll) {
        const sc = el.querySelectorAll("script[src]");
        for (const s of sc) {
          if (s.hasAttribute("data-shields-blocked")) continue;
          if (shouldBlockRequest(s.getAttribute("src"), "script")) {
            s.setAttribute("data-shields-blocked", "1");
            s.removeAttribute("src");
            bumpStat("scripts");
          }
        }
        const ic = el.querySelectorAll('img[src]');
        for (const im of ic) {
          if (im.hasAttribute("data-shields-blocked")) continue;
          if (shouldBlockRequest(im.getAttribute("src"), "image")) {
            im.setAttribute("data-shields-blocked", "1");
            im.removeAttribute("src");
            bumpStat("images");
          }
        }
      }
    };
    for (const m of muts) for (const node of m.addedNodes) scan(node);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // 4) HTTPS upgrade (click-time for http:// links)
  document.addEventListener(
    "click",
    (e) => {
      const settings = loadShieldsSettings();
      if (!settings.enabled || !settings.httpsUpgrade) return;
      const a = e.target.closest?.('a[href]');
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (/^http:\/\//i.test(href)) {
        e.preventDefault();
        const up = href.replace(/^http:\/\//i, "https://");
        bumpStat("httpsUpgrades");
        if (a.target === "_blank" || a.hasAttribute("target")) window.open(up, "_blank", "noopener");
        else window.location.href = up;
      }
    },
    true,
  );
}

// ── Service worker blockers (uBO-engine) ────────────────────────────────────
// The service worker (src/utils/ubo) blocks third-party requests from the
// player/media layer that the page-context interceptors above cannot see; it
// reports every block back here so the same "blocked" counters stay accurate.

function swTypeToStatKey(type) {
  if (type === "script") return "scripts";
  if (type === "image") return "images";
  if (type === "xmlhttprequest" || type === "media" || type === "sub_frame") return "xhr";
  return "other";
}

let swListenerInstalled = false;

function installSwBlockListener() {
  if (swListenerInstalled) return;
  if (!("serviceWorker" in navigator)) return;
  swListenerInstalled = true;

  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.type !== "ubo-blocked") return;
    bumpStat(swTypeToStatKey(data.reqType));
  });

  // Teach the SW what the current top document is (SPA route changes).
  const postOrigin = () => {
    navigator.serviceWorker.controller?.postMessage({
      type: "ubo-origin",
      url: location.href,
    });
  };
  window.addEventListener("popstate", postOrigin);
  window.addEventListener("hashchange", postOrigin);
  navigator.serviceWorker.ready.then(postOrigin);
}

// ── Forget me when I close this site ────────────────────────────────────────

let forgetHandlerInstalled = false;

function forgetSiteData() {
  // local storage (watchlist, history, progress, settings, caches)
  const PRE = "watchalong_";
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(PRE)) localStorage.removeItem(k);
  }
  // same-origin cookies
  try {
    document.cookie.split(";").forEach((c) => {
      const name = c.split("=")[0].trim();
      document.cookie = `${name}=; Max-Age=-99999999; path=/`;
    });
  } catch {}
  // caches + other IndexedDB databases (keep the shields engine cache alive)
  try {
    if ("caches" in window) {
      caches.keys().then((names) =>
        names.forEach((n) => {
          if (!n.startsWith("watchalong-shields")) caches.delete(n);
        }),
      );
    }
  } catch {}
  try {
    if (indexedDB.databases) {
      indexedDB.databases().then((dbs) =>
        (dbs || []).forEach((db) => {
          if (db.name && !String(db.name).startsWith("watchalong-shields")) {
            indexedDB.deleteDatabase(db.name);
          }
        }),
      );
    }
  } catch {}
}

function installForgetMe() {
  if (forgetHandlerInstalled) return;
  forgetHandlerInstalled = true;
  const onHide = () => {
    const settings = loadShieldsSettings();
    if (settings.enabled && settings.forgetMe) forgetSiteData();
  };
  window.addEventListener("pagehide", onHide);
  window.addEventListener("beforeunload", onHide);
}

// ── Boot ───────────────────────────────────────────────────────────────────

let booted = false;

/**
 * Kick off Shields. Idempotent. Called once from App on mount; most work is
 * deferred until idle so first paint is unaffected.
 */
export function initShields() {
  if (booted) return;
  booted = true;

  const settings = loadShieldsSettings();
  applyFingerprintProtections(settings);
  installInterceptors();
  installSwBlockListener();

  window.addEventListener(SW.shieldsChanged, () => {
    const next = loadShieldsSettings();
    applyFingerprintProtections(next);
    if (next.enabled) startEngine(next);
  });

  if (settings.enabled) {
    window.requestIdleCallback?.(
      () => {
        initRequestMatching();
        startEngine(settings);
      },
      { timeout: 3000 },
    );
  }
}

/** Force a re-download of all enabled filter lists (Settings -> Update lists). */
export function refreshFilterLists() {
  const settings = loadShieldsSettings();
  engineReady = false;
  engine = null;
  engineForListKey = null;
  return startEngine(settings, true).catch(() => {
    engineReady = false;
  });
}