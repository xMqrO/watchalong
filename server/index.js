// WatchAlong production server: serves the built frontend (dist/) plus /api/*.
//   npm run build
//   npm start            (or: PORT=8787 node server/index.js)

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";
import { handleApiRequest, loadConfig } from "./api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");
const PORT = Number(process.env.PORT) || 8787;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

async function sendFile(res, filePath) {
  const data = await readFile(filePath);
  res.statusCode = 200;
  res.setHeader("Content-Type", MIME[extname(filePath)] || "application/octet-stream");
  res.setHeader("Cache-Control", extname(filePath) === ".html" ? "no-cache" : "public, max-age=31536000, immutable");
  res.end(data);
}

// Vite emits asset references as "./assets/..." so the built index.html also
// works over file:// in Electron. Over HTTP the browser resolves those
// relative to the current path, which breaks deep links like /smallville/s5
// (the page would try to load /smallville/assets/...). Serve a version whose
// references are rooted at "/". The dist file on disk is left untouched.
let indexHtmlRewritten = null;
let indexStamp = 0;
async function sendIndex(res) {
  try {
    const st = await stat(join(DIST, "index.html"));
    if (!indexHtmlRewritten || st.mtimeMs !== indexStamp) {
      const raw = await readFile(join(DIST, "index.html"), "utf8");
      indexHtmlRewritten = raw
        .replaceAll("./assets/", "/assets/")
        .replaceAll("./logo.svg", "/logo.svg");
      indexStamp = st.mtimeMs;
    }
  } catch {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(indexHtmlRewritten);
}

async function serveStatic(req, res, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    res.statusCode = 400;
    res.end("Bad request");
    return;
  }
  if (decoded.includes("\0")) {
    res.statusCode = 400;
    res.end("Bad request");
    return;
  }

  let filePath = normalize(join(DIST, decoded));
  if (!filePath.startsWith(DIST)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  try {
    const s = await stat(filePath);
    if (s.isFile()) {
      await sendFile(res, filePath);
      return;
    }
  } catch {}

  // Directory or unknown route -> SPA fallback to index.html
  await sendIndex(res);
}

function logStartup() {
  const { TMDB_TOKEN } = loadConfig();
  console.log(`WatchAlong server: http://localhost:${PORT}/ (serving dist/)`);
  console.log("  TMDB token configured:", TMDB_TOKEN ? "yes" : "NO - set server/config.json or TMDB_TOKEN env");
}

const server = createServer(async (req, res) => {
  const urlPath = req.url || "/";
  if (urlPath.startsWith("/api")) {
    try {
      await handleApiRequest(req, res);
    } catch (err) {
      console.error("[server] api error:", err);
      res.statusCode = 500;
      res.end("Internal error");
    }
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }
  await serveStatic(req, res, urlPath);
});

server.listen(PORT, logStartup);