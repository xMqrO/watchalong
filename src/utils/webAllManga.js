// WatchAlong browser client for the async source resolvers.
// All resolution happens on the server (/api/vixsrc/resolve,
// /api/player/resolve) so resolver internals never ship to the browser, and no
// CORS proxy is needed. The server returns only the final clean playable URL.

// Providers whose streams the server resolves to a clean m3u8/mp4. If a
// provider gives up, the page auto-fails over to the next source.
const SERVER_RESOLVED = ["vidsrc", "videasy", "vidking", "vidfast", "vidlink"];

export async function resolveAllManga(args = {}) {
  const { playerSource, ...rest } = args;
  if (playerSource === "vixsrc") return resolveVixsrc(rest);
  if (SERVER_RESOLVED.includes(playerSource)) return resolveGenericProvider(playerSource, rest);
  return { ok: false, error: "Unknown source" };
}

async function resolveGenericProvider(provider, { id, isMovie, seasonNumber, episodeNumber, title, year, imdbId }) {
  try {
    const res = await fetch("/api/player/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        id,
        type: isMovie ? "movie" : "tv",
        season: seasonNumber,
        episode: episodeNumber,
        title,
        year,
        imdbId,
      }),
    });
    if (!res.ok) return { ok: false, error: `API ${res.status}` };
    const data = await res.json();
    if (!data || typeof data !== "object")
      return { ok: false, error: "Bad API response" };
    return data;
  } catch (e) {
    return { ok: false, error: e.message || "Error contacting API" };
  }
}

/**
 * VixSrc is WAF-blocked for browser-embedded pages, so the server resolves the
 * whole playlist chain (vixsrc.to Referer) and returns a self-contained m3u8.
 */
async function resolveVixsrc({ id, isMovie, seasonNumber, episodeNumber }) {
  try {
    const res = await fetch("/api/vixsrc/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: isMovie ? "movie" : "tv",
        id,
        season: seasonNumber,
        episode: episodeNumber,
      }),
    });
    if (!res.ok) return { ok: false, error: `API ${res.status}` };
    const data = await res.json();
    if (!data || typeof data !== "object")
      return { ok: false, error: "Bad API response" };
    return data;
  } catch (e) {
    return { ok: false, error: e.message || "Error contacting API" };
  }
}

/**
 * Returns the resolved video URL directly; the player iframe loads it.
 */
export async function setPlayerVideo({ url, referer, startTime }) {
  return { playerUrl: url };
}