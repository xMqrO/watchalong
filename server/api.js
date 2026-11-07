// WatchAlong API backend.
// Holds server-side credentials (TMDB token, AllAnime cipher key) so they
// never ship in the browser bundle. Used both by the Vite dev server plugin
// (server/dev-plugin.js) and the standalone production server (server/index.js).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { resolveProviderStream, PROVIDER_DEFS } from "./providers.js";
import {
  stripAdsFromPlaylist,
  getEngine as getUboEngine,
  getEngineStatus as getUboStatus,
  getBlockedCount as getUboBlocked,
} from "./ubo.js";

// Warm/build the uBO engine without letting failures break the request.
async function getEngineSafe() {
  try {
    await getUboEngine();
  } catch {}
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const TMDB_API = "https://api.themoviedb.org/3";
const TIMEOUT_MS = 20000;

export function loadConfig() {
  let fileCfg = {};
  try {
    fileCfg = JSON.parse(
      readFileSync(join(__dirname, "config.json"), "utf8"),
    ) || {};
  } catch {
    fileCfg = {};
  }
  return {
    TMDB_TOKEN:
      process.env.TMDB_TOKEN || fileCfg.TMDB_TOKEN || "",
    ALLANIME_AES_KEY:
      process.env.ALLANIME_AES_KEY || fileCfg.ALLANIME_AES_KEY || "Xot36i3lK3:v1",
  };
}

const CONFIG = loadConfig();

// ── /api/player — unified clean player for server-resolved sources ────────
// Resolve a provider's stream server-side (providers.js), then serve it
// through our own uBO-cleaned player so no ad-riddled page ever loads in the
// browser. Master→variant→key→segment→direct-file hops are proxied through us
// with the provider's referer/origin so referer-locked CDNs still play.

function proxyReferer(u, r) {
  return r && /^https?:\/\//i.test(r) ? r : new URL(u).origin + "/";
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Reject anything that isn't a plain TMDB path. Path is taken straight from
 * the URL after "/api/tmdb" and must not contain path traversal or junk.
 */
function isValidTmdbPath(p) {
  if (!p || p.length > 1024) return false;
  if (p.includes("..") || p.includes("\\") || p.includes("//")) return false;
  return /^[a-zA-Z0-9/._~?\-=&:%[\]@]+$/.test(p);
}

async function handleTmdb(req, res, apiPath) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  if (!isValidTmdbPath(apiPath)) {
    sendJson(res, 400, { error: "Invalid TMDB path" });
    return;
  }
  if (!CONFIG.TMDB_TOKEN) {
    sendJson(res, 500, {
      error: "TMDB token not configured on the server",
      code: "missing_token",
    });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(`${TMDB_API}${apiPath}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${CONFIG.TMDB_TOKEN}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    sendJson(res, 502, { error: "TMDB unreachable", code: "unreachable" });
    return;
  }

  const body = await upstream.text();
  res.statusCode = upstream.status;
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

// ── /api/stream ────────────────────────────────────────────────────────────
// Anonymous download bridge so the WEB build can save files. Browsers cannot
// re-mux the HLS streams the desktop app intercepts, so this proxy either
// (a) pipes a direct file (mp4/webm/…) straight through, or (b) for .m3u8
// resolves the highest-quality variant into a self-contained playlist with
// absolute segment URLs that any player (VLC, ffmpeg, hls.js) can use.

const BLOCKED_HOST_RE =
  /(^|\.)(local|localhost)$/i;
const PRIVATE_HOST_RE =
  /^(0\.0\.0\.0|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[[0-9a-f:]*:1\]|\[::1\])/i;
const STREAM_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function sanitizeFilename(raw, fallback = "download") {
  let name = String(raw ?? "")
    .replace(/\\/g, "/")
    .replace(/[\/:*?"<>|\u0000-\u001f]/g, "_")
    .trim()
    .slice(0, 180);
  if (!name) name = fallback.replace(/[\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 180);
  return name || "download";
}

function isHlsUrl(loc) {
  return /\.m3u8([?#].*)?$/i.test(loc || "");
}

function resolveUrl(base, maybeRelative) {
  try {
    return new URL(maybeRelative, base).href;
  } catch {
    return maybeRelative;
  }
}

async function fetchUpstream(url, headers = {}, withTimeout = true) {
  return fetch(url, {
    headers: {
      "User-Agent": STREAM_UA,
      Accept: "*/*",
      ...headers,
    },
    redirect: "follow",
    signal: withTimeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
  });
}

function pickBestVariant(text) {
  const lines = text.split(/\r?\n/);
  let best = null;
  let bestBw = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const bwMatch = /BANDWIDTH=(\d+)/.exec(line);
    const bwVal = bwMatch ? Number(bwMatch[1]) : 0;
    let uri = "";
    for (let j = i + 1; j < lines.length; j++) {
      const cand = lines[j].trim();
      if (!cand) continue;
      if (!cand.startsWith("#")) {
        uri = cand;
        break;
      }
      if (cand.startsWith("#EXT-X-STREAM-INF")) break;
    }
    if (uri && bwVal >= bestBw) {
      best = { uri, bandwidth: bwVal };
      bestBw = bwVal;
    }
  }
  return best;
}

/**
 * Absolute-ize (or proxy) the media URIs inside an m3u8 so the browser can
 * fetch them. With `proxy` set, segments and init-segments are rewritten to
 * our /api/player/media proxy (which forwards the provider referer/origin) —
 * needed for referer-locked CDNs (Videasy/VidFast). Without it, URIs are left
 * absolute on their (open) CDN as before.
 */
function rewritePlaylist(text, playlistUrl, proxy = null) {
  const rewriteUrl = (u) => {
    const abs = resolveUrl(playlistUrl, u);
    if (!proxy) return abs;
    return `${proxy.origin}/api/player/media?u=${encodeURIComponent(abs)}&r=${encodeURIComponent(proxy.referer)}`;
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (t.startsWith("#EXT-X-MAP")) {
        return line.replace(/URI="([^"]+)"/gi, (_m, u) => `URI="${rewriteUrl(u)}"`);
      }
      if (!t || t.startsWith("#")) return line;
      return rewriteUrl(t);
    })
    .join("\n");
}

/**
 * GET /api/stream?url=<encoded>&name=<optional filename>
 */
async function handleStream(req, res, cleanUrl) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let target;
  let name;
  try {
    const q = new URL(cleanUrl, "http://local").searchParams;
    target = q.get("url");
    name = q.get("name");
  } catch {
    sendJson(res, 400, { error: "Invalid request" });
    return;
  }

  let parsed;
  try {
    parsed = new URL(target || "");
  } catch {
    sendJson(res, 400, { error: "Invalid url" });
    return;
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    sendJson(res, 400, { error: "Only http(s) URLs are allowed" });
    return;
  }
  if (BLOCKED_HOST_RE.test(parsed.hostname) || PRIVATE_HOST_RE.test(parsed.hostname)) {
    sendJson(res, 403, { error: "Host not allowed" });
    return;
  }

  const referer = `${parsed.origin}/`;
  const isHls = isHlsUrl(parsed.href);

  try {
    if (!isHls) {
      const upstream = await fetchUpstream(parsed.href, { Referer: referer }, false);
      if (!upstream.ok) {
        res.statusCode = upstream.status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: `Upstream ${upstream.status}` }));
        return;
      }
      const filename = sanitizeFilename(name || decodeURIComponent(parsed.pathname.split("/").pop() || "download"));
      res.statusCode = upstream.status;
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (req.headers.range) res.setHeader("Content-Range", upstream.headers.get("content-range") || "");

      const body = Readable.fromWeb(upstream.body);
      body.on("error", () => res.destroy());
      res.on("close", () => body.destroy());
      body.pipe(res);
      return;
    }

    // HLS: resolve master → highest-bandwidth media playlist, then rewrite
    // segments to absolute URLs so the downloaded .m3u8 works standalone.
    let current = parsed.href;
    let playlistText = null;
    for (let i = 0; i < 5; i++) {
      const up = await fetchUpstream(current, { Referer: referer });
      if (!up.ok) {
        res.statusCode = up.status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: `Upstream ${up.status}` }));
        return;
      }
      const text = await up.text();
      const variant = pickBestVariant(text);
      if (variant) {
        current = resolveUrl(current, variant.uri);
        continue;
      }
      playlistText = text;
      break;
    }
    if (playlistText == null) throw new Error("Could not resolve HLS playlist");

    playlistText = await stripAdsFromPlaylist(playlistText, current);
    const baseName = sanitizeFilename(name || decodeURIComponent(parsed.pathname.split("/").pop() || "stream"));
    const filename = /\.m3u8$/i.test(baseName) ? baseName : `${baseName}.m3u8`;
    const payload = rewritePlaylist(playlistText, current);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.end(payload);
  } catch (err) {
    console.error("[api/stream] failed:", err.message);
    if (!res.headersSent) {
      sendJson(res, 502, { error: "Stream unreachable" });
    } else {
      res.destroy();
    }
  }
}


function playerHtml(param) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WatchAlong</title>
<style>
  html,body{margin:0;background:#000;height:100%;overflow:hidden}
  video{width:100vw;height:100vh;background:#000;object-fit:contain}
  #err{display:none;position:fixed;left:0;right:0;bottom:0;padding:10px 16px;
    background:rgba(229,9,20,.9);color:#fff;font:13px system-ui,sans-serif}
</style>
</head>
<body>
<video id="v" autoplay controls playsinline></video>
<div id="err"></div>
<script>
(function () {
  var m3u8 = new URLSearchParams(location.search).get(${JSON.stringify(param)});
  var video = document.getElementById("v");
  var errBox = document.getElementById("err");
  // Direct media files (eg. VidLink mp4) come back with &m=1 and need no HLS
  // demuxing — point the <video> straight at them.
  var directFile = /&m=1($|&)/.test(m3u8 || "");
  function showErr(m) {
    errBox.textContent = m;
    errBox.style.display = "block";
  }
  function tryPlay() {
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
  }
  function canNative() {
    return video.canPlayType &&
      (video.canPlayType("application/vnd.apple.mpegurl") ||
        video.canPlayType("application/x-mpegURL"));
  }
  // ── OnVid-compatible progress bridge ──────────────────────────────────
  // The parent page posts { onvid:{ action:"getCurrentTime" } } and expects
  // back { onvid:{ action, currentTime, duration, paused } }. We also seek
  // on request so saved resume time actually jumps the player.
  var lastPing = 0;
  function ping(action) {
    if (Date.now() - lastPing < 900) return;
    lastPing = Date.now();
    try {
      parent.postMessage({
        onvid: {
          action: action || "getCurrentTime",
          currentTime: video.currentTime,
          duration: isFinite(video.duration) ? video.duration : 0,
          paused: video.paused
        }
      }, "*");
    } catch (e) {}
  }
  ["play", "pause", "seeked", "durationchange", "timeupdate"].forEach(function (ev) {
    video.addEventListener(ev, function () { ping(""); });
  });
  window.addEventListener("message", function (e) {
    var d = e.data && e.data.onvid;
    if (!d || !d.action) return;
    if (d.action === "getCurrentTime" || d.action === "getDuration") {
      ping(d.action);
    } else if (d.action === "seekTo" && typeof d.time === "number" && isFinite(video.duration)) {
      video.currentTime = d.time;
      if (video.paused) tryPlay();
    }
  });
  // ── playback ───────────────────────────────────────────────────────────
  window.addEventListener("error", function (ev) {
    showErr(String(ev.message || ev.error || "Playback error"));
  }, true);
  window.addEventListener("click", function () {
    if (video.paused && video.src) tryPlay();
  });
  if (directFile) {
    video.src = m3u8;
    tryPlay();
  } else if (canNative()) {
    video.src = m3u8;
    tryPlay();
  } else {
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";
    s.onload = function () {
      if (window.Hls && Hls.isSupported()) {
        var hls = new Hls();
        hls.on(Hls.Events.ERROR, function (_e, data) {
          if (data && data.fatal) showErr(data.type + ": " + data.details);
        });
        hls.loadSource(m3u8);
        hls.attachMedia(video);
        tryPlay();
      } else if (canNative()) {
        video.src = m3u8;
        tryPlay();
      } else {
        showErr("No HLS support available");
      }
    };
    s.onerror = function () {
      showErr("Failed to load the player script");
    };
    document.head.appendChild(s);
  }
})();
</script>
</body>
</html>`;
}

// ── /api/player — unified clean player for server-resolved sources ────────
// Resolve a provider's stream server-side (providers.js), then serve it
// through our own uBO-cleaned player so no ad-riddled page ever loads in the
// user's browser. Master→variant→key hops are proxied through us.
function isValidFetchUrl(raw) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return false;
    if (u.username || u.password) return false;
    if (BLOCKED_HOST_RE.test(u.hostname) || PRIVATE_HOST_RE.test(u.hostname))
      return false;
    return true;
  } catch {
    return false;
  }
}

function requestOrigin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = (req.headers["x-forwarded-proto"] || "http")
    .split(",")[0].trim() || "http";
  return `${proto}://${host}`;
}

async function readJsonBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw);
}

async function handlePlayerResolve(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }
  const provider = String(body.provider || "");
  const type = String(body.type || "") === "tv" ? "tv" : "movie";
  const id = String(body.id || "").trim();
  if (!PROVIDER_DEFS[provider] || !id || !/^[0-9a-zA-Z-]+$/.test(id)) {
    return sendJson(res, 200, { ok: false, error: "Invalid request" });
  }
  if (type === "tv" && (!Number(body.season) || !Number(body.episode))) {
    return sendJson(res, 200, { ok: false, error: "Missing season/episode" });
  }
  const out = await resolveProviderStream({
    provider,
    type,
    id,
    season: Number(body.season) || 1,
    episode: Number(body.episode) || 1,
    title: String(body.title || ""),
    year: String(body.year || ""),
    imdbId: String(body.imdbId || ""),
  });
  if (!out.ok) {
    return sendJson(res, 200, { ok: false, error: out.error || "No stream" });
  }
  const playUrl = `/api/player/play?u=${encodeURIComponent(out.url)}&r=${encodeURIComponent(out.referer)}${out.kind === "mp4" ? "&m=1" : ""}`;
  return sendJson(res, 200, {
    ok: true,
    url: `/api/player?u=${encodeURIComponent(playUrl)}`,
    m3u8: out.url,
    referer: out.referer,
    provider,
    kind: out.kind || "hls",
  });
}

async function handlePlayerPlay(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD")
    return sendJson(res, 405, { error: "Method not allowed" });
  let u, r, m;
  try {
    const q = new URL(req.url, "http://local").searchParams;
    u = q.get("u");
    r = q.get("r");
    m = q.get("m");
  } catch {
    return sendJson(res, 400, { error: "Invalid request" });
  }
  if (!isValidFetchUrl(u)) return sendJson(res, 400, { error: "Invalid url" });
  const referer = proxyReferer(u, r);
  const direct = m === "1" || /\.(mp4|webm|mkv|mov|m4v)([?#].*)?$/i.test(new URL(u).pathname);

  // Direct media file (eg. VidLink mp4): hop the browser straight to the
  // range-capable media proxy which forwards the provider referer/origin.
  if (direct) {
    const dest = `/api/player/media?u=${encodeURIComponent(u)}&r=${encodeURIComponent(referer)}`;
    res.statusCode = 302;
    res.setHeader("Location", dest);
    res.setHeader("Cache-Control", "no-store");
    res.end();
    return;
  }

  try {
    let current = u;
    let text = null;
    const upstreamHeaders = { Referer: referer };
    try {
      upstreamHeaders.Origin = new URL(referer).origin;
    } catch {}
    for (let i = 0; i < 5; i++) {
      const up = await fetchUpstream(current, upstreamHeaders);
      if (!up.ok) return sendJson(res, 502, { error: `Upstream ${up.status}` });
      const t = await up.text();
      const variant = pickBestVariant(t);
      if (variant) {
        current = resolveUrl(current, variant.uri);
        continue;
      }
      text = t;
      break;
    }
    if (text == null) throw new Error("No media playlist");
    text = await stripAdsFromPlaylist(text, current);
    const origin = requestOrigin(req);
    // Segments/init/maps hop through our media proxy (referer-locked CDNs);
    // keys hop through the key proxy too.
    let payload = rewritePlaylist(text, current, { origin, referer });
    payload = payload
      .split(/\r?\n/)
      .map((line) => {
        if (!/^#EXT-X-KEY/i.test(line.trim())) return line;
        return line.replace(/URI="([^"]+)"/gi, (_mt, ur) => {
          try {
            const abs = new URL(ur, current).href;
            return `URI="${origin}/api/player/key?u=${encodeURIComponent(abs)}&r=${encodeURIComponent(referer)}"`;
          } catch {
            return ur;
          }
        });
      })
      .join("\n");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
    res.end(payload);
  } catch (err) {
    console.error("[api/player/play] failed:", err.message);
    if (!res.headersSent) sendJson(res, 502, { error: "Stream unreachable" });
    else res.destroy();
  }
}

async function handlePlayerKey(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD")
    return sendJson(res, 405, { error: "Method not allowed" });
  const q = new URL(req.url, "http://local").searchParams;
  const u = q.get("u");
  const r = q.get("r");
  if (!isValidFetchUrl(u)) return sendJson(res, 400, { error: "Invalid url" });
  try {
    const referer = proxyReferer(u, r);
    const headers = { Referer: referer };
    try {
      headers.Origin = new URL(referer).origin;
    } catch {}
    const up = await fetchUpstream(u, headers);
    if (!up.ok) return sendJson(res, 502, { error: `Upstream ${up.status}` });
    const buf = Buffer.from(await up.arrayBuffer());
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(buf);
  } catch (err) {
    console.error("[api/player/key] failed:", err.message);
    if (!res.headersSent) sendJson(res, 502, { error: "Key unreachable" });
    else res.destroy();
  }
}

const MEDIA_TYPE_BY_EXT = {
  ts: "video/mp2t",
  m2ts: "video/mp2t",
  aac: "audio/aac",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  srt: "application/x-subrip",
  vtt: "text/vtt; charset=utf-8",
  m3u8: "application/vnd.apple.mpegurl",
};

function mediaTypeFor(url, upstreamType) {
  if (upstreamType) return upstreamType;
  const ext = (/\.([a-z0-9]+)(?:[?#].*)?$/i.exec(new URL(url).pathname) || [])[1]?.toLowerCase();
  return MEDIA_TYPE_BY_EXT[ext] || "application/octet-stream";
}

/**
 * GET /api/player/media?u=<url>&r=<referer> — range-capable binary proxy.
 * Forwards Range, adds the provider referer/origin upstream, and streams HLS
 * segments, direct mp4/webm files, and subtitle files to the player.
 */
async function handlePlayerMedia(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD")
    return sendJson(res, 405, { error: "Method not allowed" });
  const q = new URL(req.url, "http://local").searchParams;
  const u = q.get("u");
  const r = q.get("r");
  if (!isValidFetchUrl(u)) return sendJson(res, 400, { error: "Invalid url" });
  try {
    const referer = proxyReferer(u, r);
    const headers = { Referer: referer };
    try {
      headers.Origin = new URL(referer).origin;
    } catch {}
    if (req.headers.range) headers.Range = req.headers.range;
    const up = await fetchUpstream(u, headers, false);
    if (!up.ok) return sendJson(res, up.status === 404 ? 404 : 502, { error: `Upstream ${up.status}` });
    const upstreamType = up.headers.get("content-type");
    res.statusCode = up.status || 200;
    res.setHeader("Content-Type", mediaTypeFor(u, upstreamType) || "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    const contentRange = up.headers.get("content-range");
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (up.headers.get("content-length") !== null && !contentRange) {
      res.setHeader("Content-Length", up.headers.get("content-length"));
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "private, max-age=900, stale-while-revalidate=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const body = Readable.fromWeb(up.body);
    body.on("error", () => res.destroy());
    res.on("close", () => body.destroy());
    body.pipe(res);
  } catch (err) {
    console.error("[api/player/media] failed:", err.message);
    if (!res.headersSent) sendJson(res, 502, { error: "Media unreachable" });
    else res.destroy();
  }
}

async function handlePlayerSubs(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD")
    return sendJson(res, 405, { error: "Method not allowed" });
  const q = new URL(req.url, "http://local").searchParams;
  const u = q.get("u");
  if (!isValidFetchUrl(u)) return sendJson(res, 400, { error: "Invalid url" });
  try {
    const up = await fetchUpstream(u, {});
    if (!up.ok) return sendJson(res, 502, { error: `Upstream ${up.status}` });
    const buf = Buffer.from(await up.arrayBuffer());
    const isVtt = /\.vtt($|\?)/i.test(u);
    const ctype =
      up.headers.get("content-type") ||
      (isVtt ? "text/vtt; charset=utf-8" : "application/octet-stream");
    res.statusCode = 200;
    res.setHeader("Content-Type", ctype);
    res.setHeader("Cache-Control", "private, max-age=600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(buf);
  } catch {
    return sendJson(res, 502, { error: "Subs unreachable" });
  }
}

async function handlePlayer(req, res) {
  const q = new URL(req.url, "http://local").searchParams;
  const u = q.get("u") || "";
  if (!u.startsWith("/api/player/play")) {
    return sendJson(res, 400, { error: "Invalid player url" });
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(playerHtml("u"));
}

// ── /api/a111/resolve + /api/a111/proxy — open directory at a.111477.xyz ────
const A111_BASE = "https://a.111477.xyz";
const A111_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Cache directory listings for 10 minutes to avoid hammering the server
const A111_DIR_CACHE = new Map();
const A111_CACHE_TTL = 10 * 60 * 1000;

// Fetch a directory listing page and return all hrefs
async function fetchA111Dir(path) {
  const cached = A111_DIR_CACHE.get(path);
  if (cached && Date.now() - cached.at < A111_CACHE_TTL) return cached.links;

  const url = `${A111_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "User-Agent": A111_UA, "Accept": "text/html" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`a111 fetch ${res.status} for ${path}`);
  const html = await res.text();
  const links = [];
  const re = /href="([^"?#]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1];
    if (href === "/" || href === "../" || href.startsWith("?") || href.startsWith("http")) continue;
    // Strip the leading section path prefix so we return just the entry name
    // e.g. /movies/Inception%20(2010)/ → Inception (2010)/
    href = decodeURIComponent(href);
    if (href.startsWith(path)) href = href.slice(path.length);
    if (!href || href === "/" || href === "../") continue;
    links.push(href);
  }
  A111_DIR_CACHE.set(path, { links, at: Date.now() });
  return links;
}

// Normalize a name for fuzzy matching: lowercase, strip punctuation/year/country tags
function normalizeTitle(name) {
  return name
    .toLowerCase()
    .replace(/\s*\(\d{4}\)\s*/g, " ")       // strip (2009)
    .replace(/\s*\(us\)\s*|\s*\(uk\)\s*|\s*\(au\)\s*/gi, " ")  // strip country tags
    .replace(/[^a-z0-9\s]/g, " ")            // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function titleScore(folderName, searchTitle) {
  const folderNorm = normalizeTitle(folderName.replace(/\/$/, ""));
  const searchNorm = normalizeTitle(searchTitle);
  if (folderNorm === searchNorm) return 100;
  if (folderNorm.startsWith(searchNorm)) return 80;
  if (folderNorm.includes(searchNorm)) return 60;
  // Word overlap score
  const folderWords = new Set(folderNorm.split(" ").filter(Boolean));
  const searchWords = searchNorm.split(" ").filter(Boolean);
  if (!searchWords.length) return 0;
  const matches = searchWords.filter(w => folderWords.has(w)).length;
  return Math.round((matches / searchWords.length) * 50);
}

// Find the best matching folder name from a list of directory entries
function findBestMatch(entries, title, minScore = 40) {
  let best = null;
  let bestScore = 0;
  for (const entry of entries) {
    const score = titleScore(entry, title);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore >= minScore ? best : null;
}

// Find the right episode file inside a TV show folder
// Pattern: looks for SxxExx or just the episode number
function findEpisodeFile(files, season, episode) {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  const patterns = [
    new RegExp(`[Ss]${s}[Ee]${e}`, "i"),
    new RegExp(`[Ss]${season}[Ee]${episode}\\b`, "i"),
    new RegExp(`${s}x${e}`, "i"),
    new RegExp(`season.?${season}.?episode.?${episode}`, "i"),
  ];
  // Also check just episode number as fallback
  const epOnly = new RegExp(`[Ee]${e}[^0-9]|[Ee]pisode.?${e}[^0-9]|[^0-9]${e}\\.`, "i");

  for (const pat of patterns) {
    const match = files.find(f => pat.test(f));
    if (match) return match;
  }
  const match = files.find(f => epOnly.test(f));
  return match || null;
}

function isVideoFile(name) {
  return /\.(mp4|mkv|avi|mov|m3u8|ts)$/i.test(name);
}

async function handleA111Resolve(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
  const q = new URL(req.url, "http://local").searchParams;
  const type = q.get("type") === "tv" ? "tv" : "movie";
  const title = (q.get("title") || "").trim();
  const season = parseInt(q.get("season") || "1", 10);
  const episode = parseInt(q.get("episode") || "1", 10);

  if (!title) return sendJson(res, 400, { error: "title required" });

  try {
    const rootSection = type === "tv" ? "/tvs/" : "/movies/";
    // Also check kdrama/asiandrama for TV
    const sectionsToCheck = type === "tv"
      ? ["/tvs/", "/kdrama/", "/asiandrama/"]
      : ["/movies/", "/misc/"];

    let fileUrl = null;
    let matchedFolder = null;

    for (const section of sectionsToCheck) {
      let entries;
      try {
        entries = await fetchA111Dir(section);
      } catch (err) {
        console.warn(`[a111] listing ${section} failed:`, err.message);
        continue;
      }

      const folders = entries.filter(e => e.endsWith("/"));
      const best = findBestMatch(folders, title);
      if (!best) continue;

      matchedFolder = best;
      const showPath = `${section}${best}`;

      if (type === "movie") {
        // For movies, look directly in the folder for video files
        let movieFiles;
        try {
          movieFiles = await fetchA111Dir(showPath);
        } catch { continue; }

        const videos = movieFiles.filter(isVideoFile);
        if (videos.length > 0) {
          // Pick highest quality: prefer 2160p > 1080p > 720p > first
          const sorted = videos.sort((a, b) => {
            const qual = (name) => {
              if (/2160p|4k/i.test(name)) return 4;
              if (/1080p/i.test(name)) return 3;
              if (/720p/i.test(name)) return 2;
              return 1;
            };
            return qual(b) - qual(a);
          });
          fileUrl = `${A111_BASE}${showPath}${sorted[0]}`;
          break;
        }
        // Maybe there's a subfolder (disc/version)
        const subfolders = movieFiles.filter(e => e.endsWith("/"));
        for (const sub of subfolders) {
          try {
            const subFiles = await fetchA111Dir(`${showPath}${sub}`);
            const vids = subFiles.filter(isVideoFile);
            if (vids.length > 0) {
              fileUrl = `${A111_BASE}${showPath}${sub}${vids[0]}`;
              break;
            }
          } catch {}
        }
        if (fileUrl) break;
      } else {
        // TV: look for season folder then episode file
        let showContents;
        try {
          showContents = await fetchA111Dir(showPath);
        } catch { continue; }

        const seasonFolders = showContents.filter(e => e.endsWith("/"));
        const seasonFiles = showContents.filter(isVideoFile);

        // Try to find season subfolder
        const seasonPat = new RegExp(`season.?0*${season}|s0*${season}[^0-9]`, "i");
        const seasonFolder = seasonFolders.find(f => seasonPat.test(f));

        let episodeFiles = seasonFiles;
        let episodePath = showPath;

        if (seasonFolder) {
          episodePath = `${showPath}${seasonFolder}`;
          try {
            const sfContents = await fetchA111Dir(episodePath);
            episodeFiles = sfContents.filter(isVideoFile);
          } catch {}
        }

        const epFile = findEpisodeFile(episodeFiles, season, episode);
        if (epFile) {
          fileUrl = `${A111_BASE}${episodePath}${epFile}`;
          break;
        }
      }
    }

    if (!fileUrl) {
      return sendJson(res, 200, { ok: false, error: `"${title}" not found on 111477` });
    }

    const origin = requestOrigin(req);
    const proxyUrl = `${origin}/api/a111/proxy?url=${encodeURIComponent(fileUrl)}`;

    return sendJson(res, 200, {
      ok: true,
      fileUrl,
      proxyUrl,
      matchedFolder,
      ext: fileUrl.split(".").pop().toLowerCase(),
    });
  } catch (err) {
    console.error("[api/a111/resolve] failed:", err.message);
    return sendJson(res, 200, { ok: false, error: err.message });
  }
}

// Proxy a file from a.111477.xyz to the browser — handles range requests for seeking
async function handleA111Proxy(req, res) {
  const q = new URL(req.url, "http://local").searchParams;
  const url = q.get("url");
  if (!url || !url.startsWith(A111_BASE)) {
    return sendJson(res, 400, { error: "Invalid url" });
  }

  const headers = {
    "User-Agent": A111_UA,
    "Accept": "*/*",
  };
  if (req.headers.range) headers["Range"] = req.headers.range;

  try {
    const upstream = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(60000),
    });

    res.statusCode = upstream.status;
    for (const [k, v] of upstream.headers.entries()) {
      if (/^(content-type|content-length|content-range|accept-ranges|last-modified|etag)$/i.test(k)) {
        res.setHeader(k, v);
      }
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=3600");

    // Stream body
    const reader = upstream.body.getReader();
    const writeChunk = () => reader.read().then(({ done, value }) => {
      if (done) { res.end(); return; }
      if (!res.write(value)) {
        res.once("drain", writeChunk);
      } else {
        writeChunk();
      }
    }).catch(() => res.end());
    writeChunk();
  } catch (err) {
    if (!res.headersSent) sendJson(res, 502, { error: err.message });
    else res.end();
  }
}

// ── /api/cno/resolve — scrape cno.to and extract the Lumenbox m3u8 ─────────
// cno.to embeds its player via a script tag that calls a JSON config endpoint.
// We fetch the page, pull the config URL, then hit that to get the m3u8.
const CNO_ORIGIN = "https://cno.to";
const CNO_REFERER = "https://cno.to/";

async function fetchCnoPage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": STREAM_UA,
      Accept: "text/html,application/xhtml+xml,*/*",
      Referer: CNO_REFERER,
      Origin: CNO_ORIGIN,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`cno.to fetch ${res.status}`);
  return res.text();
}

async function fetchCnoJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": STREAM_UA,
      Accept: "application/json,*/*",
      Referer: CNO_REFERER,
      Origin: CNO_ORIGIN,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`cno.to api ${res.status}`);
  return res.json();
}

function extractM3u8FromText(text) {
  // Look for direct m3u8 URLs in script/json content
  const m = /["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)/i.exec(text);
  return m ? m[1] : null;
}

function extractSrcFromText(text) {
  // Look for source URL patterns used by cno.to player config
  const patterns = [
    /"sources?":\s*\[?\s*\{[^}]*"file":\s*"([^"]+\.m3u8[^"]*)"/i,
    /"file":\s*"([^"]+\.m3u8[^"]*)"/i,
    /source:\s*["']([^"']+\.m3u8[^"']*)["']/i,
    /src:\s*["']([^"']+\.m3u8[^"']*)["']/i,
    /"url":\s*"([^"]+\.m3u8[^"]*)"/i,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return m[1];
  }
  return null;
}

// cno.to uses server IDs 1–30 (approx). We try a few until one responds.
const CNO_SERVERS = [21, 22, 23, 1, 2, 3, 4, 5];

async function fetchCnoApi(serverId, type, id, season, episode) {
  const path = type === "tv"
    ? `/api/s/${serverId}/tv/${id}/${season}/${episode}?v=3`
    : `/api/s/${serverId}/movie/${id}?v=3`;
  const res = await fetch(`${CNO_ORIGIN}${path}`, {
    headers: {
      "User-Agent": STREAM_UA,
      "Accept": "application/json, */*",
      "Referer": CNO_REFERER,
      "Origin": CNO_ORIGIN,
      "X-Requested-With": "XMLHttpRequest",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 410 || res.status === 404) {
    const err = new Error(`cno api ${res.status}`);
    err.notInLibrary = true;
    throw err;
  }
  if (!res.ok) throw new Error(`cno api ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (ct.includes("application/vnd.apple.mpegurl") || ct.includes("application/x-mpegurl") || text.trimStart().startsWith("#EXTM3U")) {
    console.log(`[cno server ${serverId}] m3u8 body preview:`, text.slice(0, 400));
    // Check if it's a master playlist referencing Lumenbox quality playlists.
    const lumen = /(https?:\/\/v\.lumenbox\.top\/[^\s"'#]+\.m3u8[^\s"'#]*)/i.exec(text);
    if (lumen) return { _directM3u8: lumen[1] };
    // Generic m3u8 URL in body
    const generic = /(https?:\/\/[^\s"'#]+\.m3u8[^\s"'#]*)/i.exec(text);
    if (generic) return { _directM3u8: generic[1] };
    // No absolute URL found — the body itself is the stream. Stash it and its final URL.
    return { _m3u8Body: text, _m3u8BaseUrl: res.url };
  }
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract a URL from whatever text came back
    const lumen = /(https?:\/\/v\.lumenbox\.top\/v\/[a-f0-9]+\/[^"'\s\n]+\.m3u8[^"'\s\n]*)/i.exec(text);
    if (lumen) return { _directM3u8: lumen[1] };
    const generic = /(https?:\/\/[^"'\s\n]+\.m3u8[^"'\s\n]*)/i.exec(text);
    if (generic) return { _directM3u8: generic[1] };
    throw new Error(`cno api bad response: ${text.slice(0, 80)}`);
  }
}

function extractM3u8FromCnoResponse(data) {
  if (data?._directM3u8) return data._directM3u8;
  if (data?._m3u8Body) {
    // We have a raw m3u8 body. Find any absolute CDN URL inside it.
    const lumen = /(https?:\/\/v\.lumenbox\.top\/[^\s"'#]+\.m3u8[^\s"'#]*)/i.exec(data._m3u8Body);
    if (lumen) return lumen[1];
    const generic = /(https?:\/\/[^\s"'#]+\.m3u8[^\s"'#]*)/i.exec(data._m3u8Body);
    if (generic) return generic[1];
    // If segments are relative, we can't reconstruct without the base URL — skip
    return null;
  }
  const str = JSON.stringify(data);
  const lumen = /(https?:\/\/v\.lumenbox\.top\/v\/[a-f0-9]+\/[^"'\s]+\.m3u8[^"'\s]*)/i.exec(str);
  if (lumen) return lumen[1];
  const generic = /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i.exec(str);
  if (generic) return generic[1];
  if (data?.source) return data.source;
  if (data?.url) return data.url;
  if (data?.file) return data.file;
  if (Array.isArray(data?.sources)) {
    const src = data.sources.find(s => s.file || s.src || s.url);
    if (src) return src.file || src.src || src.url;
  }
  if (Array.isArray(data)) {
    const src = data.find(s => s.file || s.src || s.url);
    if (src) return src.file || src.src || src.url;
  }
  return null;
}

async function handleCnoResolve(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
  const q = new URL(req.url, "http://local").searchParams;
  const type = q.get("type") === "tv" ? "tv" : "movie";
  const id = q.get("id");
  const season = q.get("season") || "1";
  const episode = q.get("episode") || "1";

  if (!id || !/^\d+$/.test(id)) return sendJson(res, 400, { error: "Invalid id" });

  for (const serverId of CNO_SERVERS) {
    try {
      const data = await fetchCnoApi(serverId, type, id, season, episode);
      const m3u8 = extractM3u8FromCnoResponse(data);
      if (!m3u8) continue;
      console.log(`[cno] server ${serverId} resolved m3u8 for ${type}/${id}`);

      const origin = requestOrigin(req);
      const playUrl = `${origin}/api/player/play?u=${encodeURIComponent(m3u8)}&r=${encodeURIComponent(CNO_REFERER)}`;

      return sendJson(res, 200, {
        ok: true,
        m3u8,
        referer: CNO_REFERER,
        playUrl,
        server: serverId,
      });
    } catch (err) {
      console.warn(`[api/cno/resolve] server ${serverId} failed:`, err.message);
      if (err.notInLibrary) {
        return sendJson(res, 200, { ok: false, error: "Title not available on cno.to" });
      }
    }
  }

  return sendJson(res, 200, { ok: false, error: "No stream found on cno.to" });
}

/**
 * Route an /api/* request. Returns true when handled (stdlib-compatible
 * (req, res)); false when the URL is outside /api.
 */
export async function handleApiRequest(req, res) {
  let url = req.url || "/";
  // On Vercel, the /api/:path* rewrite injects its splat param (`path`) into
  // the query string (e.g. "/api/health?path=health"). The real path is
  // already present in the URL, so drop that injected param for routing and
  // for the upstream TMDB proxy. No-op (and no effect) anywhere else.
  if (process.env.VERCEL && url.includes("?path=")) {
    try {
      const qIndex = url.indexOf("?");
      const params = new URLSearchParams(url.slice(qIndex + 1));
      params.delete("path");
      const qs = params.toString();
      url = url.slice(0, qIndex) + (qs ? "?" + qs : "");
    } catch {}
  }
  if (!url.startsWith("/api/") && url !== "/api") return false;

  try {
    if (url === "/api/health" || url === "/api") {
      sendJson(res, 200, {
        ok: true,
        name: "watchalong-api",
        tmdbConfigured: !!CONFIG.TMDB_TOKEN,
      });
      return true;
    }

    if (url.startsWith("/api/tmdb")) {
      await handleTmdb(req, res, url.slice("/api/tmdb".length));
      return true;
    }

    if (url === "/api/player/resolve") {
      await handlePlayerResolve(req, res);
      return true;
    }

    if (url.startsWith("/api/player/play")) {
      await handlePlayerPlay(req, res);
      return true;
    }

    if (url.startsWith("/api/player/key")) {
      await handlePlayerKey(req, res);
      return true;
    }

    if (url.startsWith("/api/player/media")) {
      await handlePlayerMedia(req, res);
      return true;
    }

    if (url.startsWith("/api/player/subs")) {
      await handlePlayerSubs(req, res);
      return true;
    }

    if (url.startsWith("/api/player")) {
      await handlePlayer(req, res);
      return true;
    }

    if (url.startsWith("/api/ubo")) {
      await getEngineSafe();
      sendJson(res, 200, { ...getUboStatus(), blocked: getUboBlocked() });
      return true;
    }

    if (url.startsWith("/api/stream")) {
      await handleStream(req, res, url);
      return true;
    }

    if (url.startsWith("/api/cno/resolve")) {
      await handleCnoResolve(req, res);
      return true;
    }

    if (url.startsWith("/api/a111/resolve")) {
      await handleA111Resolve(req, res);
      return true;
    }

    if (url.startsWith("/api/a111/proxy")) {
      await handleA111Proxy(req, res);
      return true;
    }

    sendJson(res, 404, { error: "Not found" });
    return true;
  } catch (err) {
    console.error("[api] request failed:", err);
    try {
      sendJson(res, 500, { error: "Internal error" });
    } catch {}
    return true;
  }
}
