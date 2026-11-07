// Subtitle helpers for the CNO player: fetch the OpenSubtitles list, group it
// by language, download + parse VTT files, and find the active cue.

const cueCache = new Map();

export async function fetchSubtitleList({ type, imdbId, tmdbId, season, episode }) {
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
