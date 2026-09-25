// WatchAlong uBlock Origin service worker.
// Bundled by scripts/build-sw.mjs into public/sw.js (classic SW, no top-level await).
//
// Design:
//  - Blocks only THIRD-PARTY subresource requests (scripts, images, media,
//    frames, xhr, fonts, worker …) that match the uBlock Origin static network
//    filter engine loaded from the same upstream lists the page's Shields use
//    (EasyList, EasyPrivacy, uAssets, Brave, urlhaus …).
//  - Never blocks our own origin, never blocks navigations, never touches /api/*
//    (the server-side engine covers the proxied HLS playlists / segments).
//  - Block = reject the fetch (Response.error()). Pass-through = do nothing, the
//    browser uses the network as usual.
//  - Respects the site's Shields toggle (localStorage "watchalong_shields"),
//    queries the engine synchronously once it is initialised, and tells the
//    page every time it blocks something so the blocked-count UI updates.

import { StaticNetFilteringEngine } from "@gorhill/ubo-core";
import { UBO_LISTS } from "../../../server/ubo-lists.js";

const SITE_ORIGIN = self.location.origin;
const SHIELDS_KEY = "watchalong_shields";
const MAX_RULES_CHARS = 8 * 1024 * 1024;

let engine = null; // StaticNetFilteringEngine once created
let engineReady = false;
let currentOriginURL = SITE_ORIGIN + "/";

const DEST_TYPE = {
  script: "script",
  worker: "script",
  sharedworker: "script",
  serviceworker: "script",
  style: "stylesheet",
  image: "image",
  media: "media",
  font: "font",
  xhr: "xmlhttprequest",
  object: "object",
  embed: "object",
  frame: "sub_frame",
  iframe: "sub_frame",
  audioworklet: "other",
  paintworklet: "other",
  manifest: "manifest",
  xslt: "other",
  track: "other",
};

function getType(destination) {
  return DEST_TYPE[destination] || "other";
}

function shieldsEnabled() {
  try {
    const raw = self.localStorage?.getItem(SHIELDS_KEY);
    if (raw === null || raw === undefined) return true; // default on
    return raw !== "false";
  } catch {
    return true;
  }
}

async function loadListText(url) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const text = await res.text();
    return text && text.length > 200 ? text : null;
  } catch {
    return null;
  }
}

async function initEngine() {
  try {
    engine = await StaticNetFilteringEngine.create({ noPSL: true });
    await engine.useLists(
      UBO_LISTS.map((l) => ({ name: l.id, raw: "" }))
    );
    // Load rules list by list so one failing host doesn't take the whole engine
    // down. useLists replaces the previous rules, so accumulate and re-apply.
    const chunks = [];
    for (const list of UBO_LISTS) {
      const raw = await loadListText(list.url);
      if (!raw) {
        console.warn("[ubo-sw] list fetch failed:", list.id);
        continue;
      }
      chunks.push(`! ${list.title}\n${raw}`);
    }
    const combined = chunks.join("\n\n");
    if (combined.length > MAX_RULES_CHARS) {
      console.warn("[ubo-sw] rules too large, truncating:", combined.length);
    }
    await engine.useLists([{ name: "watchalong", raw: combined }]);
    engineReady = true;
    console.log(
      "[ubo-sw] engine ready, lists:",
      chunks.length,
      "rules bytes:",
      combined.length
    );
  } catch (err) {
    console.error("[ubo-sw] init failed:", err);
    engineReady = false;
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(initEngine());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data?.type === "ubo-origin") {
    try {
      currentOriginURL = new URL(String(data.url)).href;
    } catch {}
  }
});

function sendBlocked(host, type, count = 1) {
  self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      client.postMessage({ type: "ubo-blocked", host, reqType: type, count });
    }
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") return; // never block page navigation

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Keep the "top document" URL fresh for third-party context (SPA routes).
  if (event.clientId) {
    self.clients.get(event.clientId).then((client) => {
      if (client?.url && client.url !== currentOriginURL) currentOriginURL = client.url;
    });
  }

  // Never touch our own app or API.
  if (url.origin === SITE_ORIGIN) return;

  if (!engineReady) return; // engine still warming up → let everything through
  if (!shieldsEnabled()) return;

  const type = getType(req.destination);
  // "other" (unknown) requests: only block when we have a real type match claim.
  // uBO's generic hostname filters apply to all types, so keep matching for
  // those; explicit-type filters simply won't collide.
  const details = {
    url: req.url,
    type,
    originURL: currentOriginURL,
  };

  let blocked;
  try {
    blocked = engine.matchRequest(details) === 1;
  } catch {
    blocked = false;
  }

  if (!blocked) return; // default network behavior

  sendBlocked(url.hostname, type);
  event.respondWith(Promise.resolve(Response.error()));
});