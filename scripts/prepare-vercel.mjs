// Vercel serverless entrypoint.
// The built dist/index.html uses relative asset paths ("./assets/...") because
// Electron loads it over file://. Vercel needs absolute paths so deep links
// like /smallville/s5 still load assets from /assets/. This runs only during
// the Vercel build; the local dist/ is built without this step, so Electron
// and the local node server are unaffected.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const indexHtmlPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "index.html",
);

try {
  const raw = await readFile(indexHtmlPath, "utf8");
  const out = raw
    .replaceAll("./assets/", "/assets/")
    .replaceAll("./logo.svg", "/logo.svg");
  if (out !== raw) {
    await writeFile(indexHtmlPath, out);
    console.log("[vercel] dist/index.html rewritten to absolute asset paths");
  } else {
    console.log("[vercel] dist/index.html already uses absolute paths");
  }
} catch (err) {
  console.error("[vercel] failed to rewrite index.html:", err);
  process.exitCode = 1;
}