// Server-side uBlock Origin engine (@gorhill/ubo-core, runs natively in Node).
// This is the deterministic layer: playlists that WatchAlong proxies get their
// ad segments/playlists stripped before the player ever sees them, so ads never
// even get requested by the browser. The service worker (src/utils/ubo) is the
// second, browser-layer pass for anything that still reaches the page.

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UBO_LISTS } from "./ubo-lists.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, ".ubo-cache.bin");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_LIST_CHARS = 200;

let engine = null; // @gorhill/ubo-core StaticNetFilteringEngine or null
let engineReady = false;
let enginePromise = null;
let blockedCount = 0;

async function loadUboCore() {
  try {
    const mod = await import("@gorhill/ubo-core");
    return mod;
  } catch (err) {
    console.error("[ubo] @gorhill/ubo-core unavailable:", err.message);
    return null;
  }
}

async function fetchListText(url) {
  try {
    // NOTE: no AbortSignal here — aborting a response mid-parse tripped an
    // internal undici assertion on Node 24 and crashed the whole process.
    const res = await fetch(url, {
      headers: { "User-Agent": "watchalong-server (ad blocking)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text && text.length > MIN_LIST_CHARS ? text : null;
  } catch {
    return null;
  }
}

async function buildLists() {
  // sequential: parallel fetches + aborts crashed Node's undici parser
  const lists = [];
  for (let i = 0; i < UBO_LISTS.length; i++) {
    const list = UBO_LISTS[i];
    const text = await fetchListText(list.url);
    if (!text) {
      console.warn(`[ubo] list fetch failed (${i + 1}/${UBO_LISTS.length}): ${list.id}`);
      lists.push({ name: list.id, raw: "" });
    } else {
      lists.push({ name: list.id, raw: text });
    }
  }
  return lists;
}

async function buildEngine(mod) {
  let engine;
  try {
    engine = await mod.StaticNetFilteringEngine.create();
  } catch {
    // PSL selfie failed to load from disk (defensive) — run without it.
    engine = await mod.StaticNetFilteringEngine.create({ noPSL: true });
  }
  await engine.useLists(await buildLists());
  return engine;
}

/** Get the shared engine. Idempotent, memoised. Returns null when unavailable. */
export async function getEngine() {
  if (engineReady) return engine;
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const mod = await loadUboCore();
    if (!mod) return null;

    // 1) fresh cache → fast boot without downloads
    if (existsSync(CACHE_FILE) && Date.now() - statSync(CACHE_FILE).mtimeMs < CACHE_TTL_MS) {
      try {
        const cached = readFileSync(CACHE_FILE, "utf8");
        if (cached && cached.length > 0) {
          const eng = await mod.StaticNetFilteringEngine.create({ noPSL: true });
          await eng.deserialize(cached);
          engine = eng;
          engineReady = true;
          console.log("[ubo] engine restored from cache");
          return engine;
        }
      } catch {}
    }

    // 2) build fresh + persist
    try {
      const built = await buildEngine(mod);
      if (built) {
        engine = built;
        engineReady = true;
        try {
          const buf = await built.serialize();
          if (buf) writeFileSync(CACHE_FILE, buf);
        } catch {}
        console.log("[ubo] engine built from filter lists");
      }
    } catch (err) {
      console.error("[ubo] engine build failed:", err.message);
    }
    return engine;
  })();
  enginePromise.catch(() => {
    enginePromise = null;
  });
  return enginePromise;
}

/** Match a URL against the uBO engine. type: "script" | "media" | "image" | "xhr" | ... */
export async function isAdUrl(url, type = "media", originURL = undefined) {
  if (!url || !/^https?:\/\//i.test(String(url))) return false;
  const eng = await getEngine();
  if (!eng) return false;
  try {
    const details = { url: String(url), type };
    if (originURL) details.originURL = originURL;
    const code = eng.matchRequest(details);
    const blocked = code === 1;
    if (blocked) blockedCount += 1;
    return blocked;
  } catch {
    return false;
  }
}

/** Number of requests this process has blocked (for /api/ubo/status). */
export function getBlockedCount() {
  return blockedCount;
}

export function getEngineStatus() {
  return { ready: engineReady, lists: UBO_LISTS.length };
}

// ── HLS playlist ad stripping ────────────────────────────────────────────────

// "True" ad-blocking lines in a media playlist also always carry EXTINF.
function isUriLine(line) {
  return line && !line.startsWith("#");
}

function hasAdMarkerTag(line) {
  const t = line.toLowerCase();
  return (
    t.startsWith("#ext-x-cue-out") ||
    t.startsWith("#ext-x-cue-in") ||
    t.startsWith("#ext-x-asset") ||
    t.startsWith("#ext-x-daterange") ||
    (t.startsWith("#ext-x-part") && // fMP4 ad parts
      (t.includes("ad=") || t.includes("placement")) )
  );
}

/**
 * Strip ad content from an HLS media playlist:
 *  - any CUE-OUT … CUE-IN block (standard ad-insertion markers)
 *  - segments whose resolved URL matches the uBO engine
 * Segments are processed as groups (their EXTINF/discontinuity/date tags travel
 * with the URI), so when a segment is dropped its tags go with it and the
 * playlist stays structurally valid — players tolerate the resulting short gap.
 */
export async function stripAdsFromPlaylist(text, baseUrl) {
  if (!text || typeof text !== "string") return text;
  const lines = text.split(/\r?\n/);
  const out = [];
  let group = []; // tags + one URI forming a segment
  let inAdBlock = false;

  const flush = () => {
    if (group.length) out.push(...group);
    group = [];
  };

  for (const line of lines) {
    const t = line.trim();

    if (t.toLowerCase().startsWith("#ext-x-cue-in")) {
      inAdBlock = false;
      group = [];
      continue;
    }
    if (inAdBlock) {
      continue; // swallow everything until CUE-IN
    }
    if (t.toLowerCase().startsWith("#ext-x-cue-out")) {
      inAdBlock = true;
      group = [];
      continue;
    }
    if (hasAdMarkerTag(t)) {
      group = [];
      continue;
    }

    if (isUriLine(t)) {
      group.push(line);
      let resolved = null;
      try {
        resolved = new URL(t, baseUrl).href;
      } catch {}
      const blocked = resolved ? await isAdUrl(resolved, "media", baseUrl) : false;
      if (blocked) {
        group = []; // drop this segment and its tags
      } else {
        flush();
      }
      continue;
    }

    group.push(line);
  }
  flush();

  const result = out.join("\n");
  const dropped = lines.length - out.length;
  if (dropped !== 0) {
    console.log(`[ubo] playlist stripped: -${dropped} lines`);
  }
  return result;
}