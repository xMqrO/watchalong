// Vercel catch-all serverless function for /api/*.
// Zero-config mount (api/[...].js) preserves the original URL, so
// handleApiRequest sees exact paths like "/api/tmdb/search/multi?query=x".
// Reuses the existing Node-style router from server/api.js.
// Secrets come from Vercel env vars: TMDB_TOKEN (required), ALLANIME_AES_KEY (optional).

import { handleApiRequest } from "../server/api.js";

export default async function handler(req, res) {
  if (!res.setHeader) res.setHeader = () => {};
  if (!res.end) res.end = () => {};
  try {
    const handled = await handleApiRequest(req, res);
    if (!handled) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Not found" }));
    }
  } catch (err) {
    console.error("[api] handler failed:", err);
    try {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Internal error" }));
    } catch {}
  }
}