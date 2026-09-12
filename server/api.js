// WatchAlong API backend.
// Holds server-side credentials (TMDB token, AllAnime cipher key) so they
// never ship in the browser bundle. Used both by the Vite dev server plugin
// (server/dev-plugin.js) and the standalone production server (server/index.js).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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
  const url = req.url || "/";
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