// Build the uBlock Origin service worker: bundles src/utils/ubo/sw-entry.js
// (which imports @gorhill/ubo-core + server/ubo-lists.js) into public/sw.js.
// The ubo-core npm package is Node-oriented (imports fs/path/url/module/util),
// so those node builtins are aliased to tiny browser-compatible shims.
//
// Usage: node scripts/build-sw.mjs
// Run before `npm run build` (package.json chains it), and by `npm run dev`.

import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/../";
const shimDir = resolve(root, "src/utils/ubo");

const alias = {};
for (const m of ["fs", "path", "url", "module", "util"]) {
  alias[m] = join(shimDir, `shim-${m}.js`);
}

const outfile = resolve(root, "public/sw.js");

await build({
  entryPoints: [resolve(shimDir, "sw-entry.js")],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  outfile,
  alias,
  minify: false,
  banner: { js: "/* WatchAlong uBlock Origin service worker (built by scripts/build-sw.mjs) */" },
  legalComments: "none",
  logLevel: "info",
});

console.log("sw.js built →", outfile);