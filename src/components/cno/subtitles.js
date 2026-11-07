// Subtitle helpers for the CNO player: fetch the subtitle list, group it by
// language, download + parse SRT/VTT files, and find the active cue.

const cueCache = new Map();

// Wyzie Subs is called from the viewer's browser: OpenSubtitles blocks
// Vercel's server IPs, so the server route only works locally/desktop.
const WYZIE_KEY = import.meta.env?.VITE_WYZIE_KEY || "";

async function fetchWyzie({ type, tmdbId, season, episode }) {
  const qs = new URLSearchParams({ id: String(tmdbId), key: WYZIE_KEY });
  if (type === "tv") {
    qs.set("season", String(season || 1));
    qs.set("episode", String(episode || 1));
  }
  const res = await fetch(`https://sub.wyzie.io/search?${qs}`);
  if (!res.ok) throw new Error(`wyzie ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("wyzie bad response");
  return data
    .filter((s) => s.url && (s.format === "srt" || s.format === "vtt"))
    .map((s) => ({
      label: s.display || s.language,
      lang: s.language,
      url: s.url,
      format: s.format,
      release: s.release || s.fileName || "",
      downloads: Number(s.downloadCount || 0),
      ai: s.source === "ai",
      hearingImpaired: !!s.isHearingImpaired,
    }))
    // Human-made, non-SDH subtitles first (SDH files caption sounds like
    // "[MUSIC PLAYING]" when nobody is talking), most downloaded first;
    // AI translations last.
    .sort((a, b) => (a.ai - b.ai) || (a.hearingImpaired - b.hearingImpaired) || (b.downloads - a.downloads));
}

async function fetchOpenSubtitles({ type, imdbId, tmdbId, season, episode }) {
  if (!imdbId && !tmdbId) return [];
  const qs = new URLSearchParams({ type, lang: "all" });
  if (imdbId) qs.set("imdb_id", imdbId);
  else qs.set("tmdb_id", String(tmdbId));
  if (type === "tv") {
    qs.set("season", String(season || 1));
    qs.set("episode", String(episode || 1));
  }
  const res = await fetch(`/api/subtitles?${qs}`);
  const data = await res.json();
  return data.ok && Array.isArray(data.tracks) ? data.tracks : [];
}

export async function fetchSubtitleList(params) {
  if (WYZIE_KEY && params.tmdbId) {
    try {
      const tracks = await fetchWyzie(params);
      if (tracks.length) return tracks;
    } catch (err) {
      console.warn("[CnoPlayer] Wyzie subtitles failed, trying OpenSubtitles:", err.message);
    }
  }
  return fetchOpenSubtitles(params);
}

// [{ lang, label, versions: [track, ...] }] — versions keep the server's
// most-downloaded-first order, so versions[0] is the "Best match".
export function groupByLanguage(tracks) {
  const map = new Map();
  for (const t of tracks) {
    if (!map.has(t.lang)) map.set(t.lang, { lang: t.lang, label: t.label, versions: [] });
    map.get(t.lang).versions.push(t);
  }
  return [...map.values()];
}

function toSeconds(ts) {
  const parts = ts.trim().replace(",", ".").split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function parseVtt(text) {
  const cues = [];
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i === -1) continue;
    const [start, rest] = lines[i].split("-->");
    const end = rest.trim().split(/\s+/)[0];
    const body = lines.slice(i + 1).join("\n").replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").trim();
    if (!body) continue;
    cues.push({ start: toSeconds(start), end: toSeconds(end), text: body });
  }
  return cues.sort((a, b) => a.start - b.start);
}

export async function loadCues(url) {
  if (cueCache.has(url)) return cueCache.get(url);
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`subtitle ${r.status}`);
      return r.text();
    })
    .then(parseVtt);
  cueCache.set(url, p);
  p.catch(() => cueCache.delete(url));
  return p;
}

// Positive offset = subtitles show later.
export function activeCueText(cues, time, offset) {
  if (!cues?.length) return "";
  const t = time - offset;
  let lo = 0, hi = cues.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  const out = [];
  for (let k = idx; k >= 0 && k > idx - 4; k--) {
    if (cues[k].end > t) out.unshift(cues[k].text);
  }
  return out.join("\n");
}

export function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
