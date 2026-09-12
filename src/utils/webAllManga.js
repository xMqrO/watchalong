// WatchAlong browser client for the AllManga (allanime.to) episode resolver.
// All resolution happens on the server (/api/allmanga/resolve) so the cipher
// keys and resolver internals never ship to the browser, and no CORS proxy is
// needed. The server returns only the final playable URL.

export async function resolveAllManga({
  title,
  seasonNumber,
  episodeNumber,
  isMovie,
  translationType,
}) {
  try {
    const res = await fetch("/api/allmanga/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        seasonNumber,
        episodeNumber,
        isMovie,
        translationType,
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