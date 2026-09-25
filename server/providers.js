// Server-side stream resolvers for the embedding providers.
//
// Goal: get a provider's media URL WITHOUT ever loading the provider's ad-
// ridden page in the browser. The resolved stream is served through our own
// uBO-cleaned player (/api/player), so the ad/redirect code never runs.
//
// Most providers (VidLink, Videasy/Vidking, VidFast, VidSrc-family) now hide
// their streams behind rent-time encryption. We resolve them through the
// public enc-dec.app decryption service, then proxy the actual media through
// /api/player/media with the correct referer/origin so the CDN accepts it.
//
// Resolver output shape:
//   { ok:true, url, referer, kind: "hls" | "mp4" }
//   { ok:false, error }
// The frontend auto-fails over to the next source when ok:false.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const FETCH_TIMEOUT_MS = 15000;
const ENC_APP = "https://enc-dec.app/api";

async function encFetch(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(
    `${ENC_APP}/${path}${qs ? `?${qs}` : ""}`,
    {
      headers: { "User-Agent": UA, Accept: "*/*", Origin: "https://enc-dec.app" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`enc-dec ${res.status}`);
  return res.json();
}

async function encPost(path, body) {
  const res = await fetch(`${ENC_APP}/${path}`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/json",
      Accept: "*/*",
      Origin: "https://enc-dec.app",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`enc-dec post ${res.status}`);
  return res.json();
}

function encResult(json) {
  if (json && json.status === 200 && json.result !== undefined) return json.result;
  throw new Error(String((json && json.error) || "enc-dec error"));
}

async function probeFetch(url, headers = {}) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*", ...headers },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, status: res.status, text: "" };
    return { ok: true, status: res.status, text: await res.text() };
  } catch {
    return { ok: false, status: 0, text: "" };
  }
}

function pickQuality(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const order = (q) => {
    const n = parseInt(String(q || ""), 10);
    if (!Number.isFinite(n)) return -1;
    if (q >= 2160) return 6;
    if (q >= 1080) return 5;
    if (q >= 720) return 4;
    if (q >= 480) return 3;
    return 2;
  };
  const sorted = [...sources].sort((a, b) => order(b.quality) - order(a.quality));
  return sorted[0] || null;
}

// Cheap liveness probe of a media URL (handy for CDNs that hard rate-limit,
// like VidLink's bcdn — 428/429 there means we should fail over to a mirror).
async function probeMedia(url, { referer, origin, extraHeaders = {} } = {}) {
  try {
    const headers = {
      "User-Agent": UA,
      Accept: "*/*",
      Range: "bytes=0-1",
      ...extraHeaders,
    };
    if (origin) headers.Origin = origin;
    if (referer) headers.Referer = referer;
    const res = await fetch(url, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

// ── VidLink (https://vidlink.pro) ───────────────────────────────────────────
// enc-dec.app encrypts the tmdb id; issuing GET /api/b/{movie|tv}/{enc}[/s/e]
// returns direct mp4 file URLs (h265) + subtitles. The CDN is picky, so the
// play path proxies the file through /api/player/media with the provider's
// origin/referer.
async function resolveVidLinkPack(type, id, season, episode) {
  const kind = type === "tv" ? "tv" : "movie";
  const enc = await encFetch("enc-vidlink", { text: String(id) });
  const apiBase = `https://vidlink.pro/api/b/${kind}/${encodeURIComponent(encResult(enc))}`;
  const streamUrl =
    kind === "tv"
      ? `${apiBase}/${season}/${episode}`
      : apiBase;
  const r = await probeFetch(streamUrl, {
    Origin: "https://vidlink.pro",
    Referer: "https://vidlink.pro/",
  });
  if (!r.ok || !r.text) return null;
  let json;
  try {
    json = JSON.parse(r.text);
  } catch {
    return null;
  }
  const qualities = json?.stream?.qualities || null;
  const urls = Object.values(qualities || {})
    .filter((v) => v && typeof v.url === "string")
    .sort((a, b) => (Number(b.se || b.ep) || 0) - (Number(a.se || a.ep) || 0));
  let best = urls[0] || null;
  if (best === null && typeof json?.stream?.url === "string") {
    best = { url: json.stream.url, type: json.stream.type || "mp4" };
  }
  if (!best) return null;
  // The bcdn CDN hard rate-limits our server (428/429) at times; when it does,
  // hand the caller a clean failure so the mirror fallback kicks in instead of
  // handing the player a URL that can't stream.
  const alive = await probeMedia(best.url, {
    referer: "https://vidlink.pro/",
    origin: "https://vidlink.pro",
  });
  if (!alive) return null;
  return { url: best.url, referer: "https://vidlink.pro/", kind: "mp4" };
}

// ── Videasy / Vidking / VidSrc-family (api.speedracelight.com) ─────────────
// Shared chain: GET seed → GET <server>/sources-with-title (doubly-encoded
// title, tmdb/id/imdb/year, enc=2, seed) → enc-dec.app/dec-videasy → JSON with
// source m3u8s. The "server" selects which store to pull from:
//   cdn      = Videasy (Yoru)
//   cdn      = Vidking (same store, its own player origin)
//   hdmovie  = VidSrc-family English store (Vyse) — vsembed's own route was
//              retired (404), so the "VidSrc" menu item uses this live mirror.
async function resolveVideasyPack({ server, origin }, { type, id, title, year, imdbId, season, episode }) {
  const kind = type === "tv" ? "tv" : "movie";
  const apiHost = "https://api.speedracelight.com";
  const playerHeaders = { Origin: origin, Referer: `${origin}/` };

  const seedRes = await probeFetch(
    `${apiHost}/seed?mediaId=${encodeURIComponent(String(id))}`,
    playerHeaders,
  );
  if (!seedRes.ok) return null;
  let seed;
  try {
    seed = JSON.parse(seedRes.text).seed;
  } catch {
    return null;
  }
  if (!seed) return null;

  const encTitle = encodeURIComponent(encodeURIComponent(String(title || "")));
  const params = [
    `title=${encTitle}`,
    `mediaType=${kind}`,
    `year=${encodeURIComponent(String(year || ""))}`,
  ];
  const ep = kind === "tv" ? String(episode) : String(episode || "");
  const se = kind === "tv" ? String(season) : String(season || "");
  params.push(`episodeId=${encodeURIComponent(ep)}`);
  params.push(`seasonId=${encodeURIComponent(se)}`);
  params.push(`tmdbId=${encodeURIComponent(String(id))}`);
  if (imdbId) params.push(`imdbId=${encodeURIComponent(String(imdbId))}`);
  params.push(`enc=2`);
  params.push(`seed=${encodeURIComponent(seed)}`);

  const dataRes = await probeFetch(
    `${apiHost}/${server}/sources-with-title?${params.join("&")}`,
    playerHeaders,
  );
  if (!dataRes.ok || !dataRes.text) return null;

  const dec = await encPost("dec-videasy", {
    text: dataRes.text,
    id: String(id),
    seed,
  });
  const result = await encResult(dec);
  const src = pickQuality(result?.sources);
  if (!src || !/^https?:\/\//.test(src.url || "")) return null;
  return { url: src.url, referer: `${origin}/`, kind: "hls" };
}

// ── VidFast (https://vidfast.vc) ─────────────────────────────────────────────
// Page route (Next.js app; the "en"/"token" value lives in its RSC payload) →
// enc-vidfast → POST servers list → per-server stream URL (encrypted) →
// dec-vidfast → final m3u8 on a referer-locked CDN. Endpoints MUST be POSTed;
// some listed servers are dead (404), so we try each and keep the first hit.
async function resolveVidFastPack(type, id, season, episode) {
  const kind = type === "tv" ? "tv" : "movie";
  const pageUrl = `https://vidfast.vc/${kind}/${encodeURIComponent(String(id))}${kind === "tv" ? `/${season}/${episode}` : ""}/`;
  const page = await probeFetch(pageUrl, {
    Referer: "https://vidfast.vc/",
    Origin: "https://vidfast.vc",
  });
  if (!page.ok || !page.text) return null;

  // Token lives in the RSC payload — prefer "token", else the first plausible
  // "en" value (some RSC chunks contain an empty en placeholder).
  let token = null;
  for (const line of page.text.matchAll(/\\"(en|token)\\":\\"(.*?)\\"/g)) {
    if (!line[2]) continue;
    if (!token || line[1] === "token") token = line[2];
  }
  if (!token) return null;

  const enc = await encFetch("enc-vidfast", { text: token });
  const parts = await encResult(enc);
  if (!parts || !parts.servers || !parts.stream) return null;

  const vfHeaders = {
    Referer: "https://vidfast.vc/",
    Origin: "https://vidfast.vc",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (parts.token) vfHeaders["X-CSRF-Token"] = parts.token;

  const serversRaw = await encPostRaw(parts.servers, vfHeaders);
  if (!serversRaw) return null;
  const serversDec = await encPost("dec-vidfast", { text: serversRaw });
  const servers = await encResult(serversDec);
  if (!Array.isArray(servers) || servers.length === 0) return null;

  // Good servers first (non-4K), dead ones last; keep the first that streams.
  const candidates = [...servers].sort((a, b) => {
    const a4k = /4k/i.test(String(a.description || "")) ? 1 : 0;
    const b4k = /4k/i.test(String(b.description || "")) ? 1 : 0;
    return a4k - b4k;
  });
  for (const server of candidates) {
    if (!server || !server.data) continue;
    const streamRaw = await encPostRaw(`${parts.stream}/${server.data}`, vfHeaders);
    if (!streamRaw) continue;
    const streamDec = await encPost("dec-vidfast", { text: streamRaw });
    let streamData;
    try {
      streamData = await encResult(streamDec);
    } catch {
      continue;
    }
    const url = streamData && streamData.url;
    if (!url || !/^https?:\/\//.test(url)) continue;
    const streamKind = /\.m3u8([?#].*)?$/i.test(url) ? "hls" : "mp4";
    return { url, referer: "https://vidfast.vc/", kind: streamKind };
  }
  return null;
}

async function encPostRaw(url, headers = {}) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        "Content-Type": "application/json",
        ...headers,
      },
      body: "{}",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export const PROVIDER_DEFS = {
  vixsrc: { label: "VixSrc", clean: true },
  vidsrc: { label: "VidSrc", clean: true },
  videasy: { label: "Videasy", clean: true },
  vidlink: { label: "VidLink", clean: true },
  vidking: { label: "Vidking", clean: true },
  vidfast: { label: "VidFast", clean: true },
};

function normalize(provider, out) {
  if (!out) return { ok: false, error: `No stream available on ${provider}` };
  return {
    ok: true,
    url: out.url,
    referer: out.referer,
    kind: out.kind || "hls",
    provider,
  };
}

// Shared mirror chain for the English VidSrc-family sources whose native CDN
// is down or WAF-blocking us. Tries the Vyse store (hdmovie) first, then the
// always-on shared mirror (cdn). Both play; hdmovie self-heals when its
// scraper upstream comes back.
async function resolveVideasyMirror(base) {
  const origin = "https://player.videasy.to";
  const viaHd = await resolveVideasyPack({ server: "hdmovie", origin }, base);
  return viaHd || (await resolveVideasyPack({ server: "cdn", origin }, base));
}

/**
 * Resolve a provider to a clean, playable URL. Returns
 * { ok:true, url, referer, kind } or { ok:false, error }.
 * `meta` carries optional TMDB-derived title/year/imdbId for providers that
 * need them.
 */
export async function resolveProviderStream({
  provider,
  type,
  id,
  season,
  episode,
  title,
  year,
  imdbId,
}) {
  const def = PROVIDER_DEFS[provider];
  if (!def) return { ok: false, error: "Unknown provider" };
  if (provider === "vixsrc") {
    return { ok: false, error: "Uses dedicated resolver" };
  }
  const base = { type, id, season, episode, title, year, imdbId };
  try {
    let out = null;
    if (provider === "vidlink") {
      const native = await resolveVidLinkPack(type, id, season, episode);
      out = native || (await resolveVideasyMirror(base));
    } else if (provider === "videasy") {
      out = await resolveVideasyPack({ server: "cdn", origin: "https://player.videasy.to" }, base);
    } else if (provider === "vidking") {
      out = await resolveVideasyPack({ server: "cdn", origin: "https://www.vidking.net" }, base);
    } else if (provider === "vidsrc") {
      // The dedicated VidSrc-family store (hdmovie) can go down wholesale;
      // fall back to the shared mirror so this source always plays.
      out = await resolveVideasyMirror(base);
    } else if (provider === "vidfast") {
      out = await resolveVidFastPack(type, id, season, episode);
    }
    return normalize(provider, out);
  } catch (err) {
    return { ok: false, error: err.message || "Resolver error" };
  }
}