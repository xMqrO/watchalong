// Vercel API entrypoint for /api/*.
// Mounted via vercel.json rewrite: { "source": "/api/:path*", "destination": "/api/index" }.
// Re-uses the Node-style router from server/api.js.

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