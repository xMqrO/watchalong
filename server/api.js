// WatchAlong API backend.
// Holds server-side credentials (TMDB token, AllAnime cipher key) so they
// never ship in the browser bundle. Used both by the Vite dev server plugin
// (server/dev-plugin.js) and the standalone production server (server/index.js).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { resolveAllManga } from "./allmanga.js";

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
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

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

function rewritePlaylist(text, playlistUrl) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (t.startsWith("#EXT-X-MAP")) {
        return line.replace(/URI="([^"]+)"/gi, (m, u) => `URI="${resolveUrl(playlistUrl, u)}"`);
      }
      if (!t || t.startsWith("#")) return line;
      return resolveUrl(playlistUrl, t);
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

async function handleAllmangaResolve(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }
  const result = await resolveAllManga(body || {}, CONFIG.ALLANIME_AES_KEY);
  sendJson(res, 200, result);
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

    if (url === "/api/allmanga/resolve") {
      await handleAllmangaResolve(req, res);
      return true;
    }

    if (url.startsWith("/api/stream")) {
      await handleStream(req, res, url);
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