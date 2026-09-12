// Vite dev plugin: mounts the WatchAlong API (server/api.js) inside the dev
// server so a single `npm run dev` serves both the frontend and /api/*.

import { handleApiRequest } from "./api.js";

export default function watchalongApiPlugin() {
  return {
    name: "watchalong-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const handled = await handleApiRequest(req, res);
          if (!handled) next();
        } catch (err) {
          console.error("[watchalong-api]", err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Internal error" }));
          }
        }
      });
    },
  };
}