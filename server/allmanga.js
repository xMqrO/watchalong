// WatchAlong server-side AllManga (allanime.to) episode resolver.
// Moved off the browser (and its CORS-proxy dependency): this runs where we
// are free to set the Origin/Referer headers the AllAnime API expects. Only the
// final playable URL is returned to the client, so the cipher keys and API
// internals never reach the frontend bundle.

import { createHash, createDecipheriv } from "node:crypto";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0";

const HEADERS = {
  "User-Agent": UA,
  Accept: "*/*",
  Origin: "https://allmanga.to",
  Referer: "https://allmanga.to/",
};

async function apiFetch(url, { method = "GET", body, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, {
      method,
      headers: { ...HEADERS, ...headers },
      body,
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

// ── AllAnime hex cipher ───────────────────────────────────────────────────────

const ALLANIME_HEX_MAP = {
  79: "A", "7a": "B", "7b": "C", "7c": "D", "7d": "E", "7e": "F", "7f": "G",
  70: "H", 71: "I", 72: "J", 73: "K", 74: "L", 75: "M", 76: "N", 77: "O",
  68: "P", 69: "Q", "6a": "R", "6b": "S", "6c": "T", "6d": "U", "6e": "V",
  "6f": "W", 60: "X", 61: "Y", 62: "Z", 59: "a", "5a": "b", "5b": "c",
  "5c": "d", "5d": "e", "5e": "f", "5f": "g", 50: "h", 51: "i", 52: "j",
  53: "k", 54: "l", 55: "m", 56: "n", 57: "o", 48: "p", 49: "q", "4a": "r",
  "4b": "s", "4c": "t", "4d": "u", "4e": "v", "4f": "w", 40: "x", 41: "y",
  42: "z", "08": "0", "09": "1", "0a": "2", "0b": "3", "0c": "4", "0d": "5",
  "0e": "6", "0f": "7", "00": "8", "01": "9", 15: "-", 16: ".", 67: "_",
  46: "~", "02": ":", 17: "/", "07": "?", "1b": "#", 63: "[", 65: "]",
  78: "@", 19: "!", "1c": "$", "1e": "&", 10: "(", 11: ")", 12: "*",
  13: "+", 14: ",", "03": ";", "05": "=", "1d": "%",
};

function decodeAllanimeUrl(encoded) {
  if (encoded.startsWith("--")) encoded = encoded.slice(2);
  let result = "";
  for (let i = 0; i < encoded.length; i += 2) {
    const pair = encoded.slice(i, i + 2);
    result += ALLANIME_HEX_MAP[pair] !== undefined ? ALLANIME_HEX_MAP[pair] : pair;
  }
  return result.replace(/\\u002F/gi, "/").replace(/\\\|/g, "");
}

// ── AllAnime AES-256-CTR "tobeparsed" decryption (node:crypto) ───────────────

function decryptTobeparsed(blob, keyText) {
  try {
    const buf = Buffer.from(blob, "base64");
    if (buf.length < 32) return [];
    const iv12 = buf.subarray(1, 13);
    const ct = buf.subarray(13, buf.length - 16);
    const counter = Buffer.alloc(16);
    iv12.copy(counter, 0);
    counter[12] = 0;
    counter[13] = 0;
    counter[14] = 0;
    counter[15] = 2;
    const key = createHash("sha256").update(keyText).digest();
    const decipher = createDecipheriv("aes-256-ctr", key, counter);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      "utf8",
    );

    const sources = [];
    for (const chunk of plain.split(/[{}]/)) {
      const urlMatch = chunk.match(/"sourceUrl"\s*:\s*"(--[^"]+)"/);
      const nameMatch = chunk.match(/"sourceName"\s*:\s*"([^"]+)"/);
      const prioMatch = chunk.match(/"priority"\s*:\s*([0-9.]+)/);
      if (urlMatch) {
        sources.push({
          sourceUrl: urlMatch[1],
          sourceName: nameMatch ? nameMatch[1] : "",
          priority: prioMatch ? parseFloat(prioMatch[1]) : 0,
        });
      }
    }
    return sources;
  } catch {
    return [];
  }
}

function parseEpisodeSourceUrls(body, keyText) {
  const tbMatch = body.match(/"tobeparsed"\s*:\s*"([^"]+)"/);
  if (tbMatch) {
    const sources = decryptTobeparsed(tbMatch[1], keyText);
    if (sources.length) return sources;
  }
  try {
    const sourceUrls = JSON.parse(body)?.data?.episode?.sourceUrls;
    return sourceUrls?.length ? sourceUrls : null;
  } catch {
    return null;
  }
}

// ── AllAnime GQL helpers ──────────────────────────────────────────────────────

const SEARCH_GQL = `query($search:SearchInput $limit:Int $page:Int $translationType:VaildTranslationTypeEnumType $countryOrigin:VaildCountryOriginEnumType){shows(search:$search limit:$limit page:$page translationType:$translationType countryOrigin:$countryOrigin){edges{_id name availableEpisodes __typename}}}`;
const EPISODE_GQL = `query($showId:String! $translationType:VaildTranslationTypeEnumType! $episodeString:String!){episode(showId:$showId translationType:$translationType episodeString:$episodeString){episodeString sourceUrls}}`;
const EPISODE_GQL_HASH = "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec";
const PROVIDER_PRIORITY = ["S-mp4", "Luf-Mp4", "Yt-mp4", "Default", "Sl-Hls"];

async function allanimeGQL(variables, query) {
  const res = await apiFetch("https://api.allanime.day/api", {
    method: "POST",
    body: JSON.stringify({ variables, query }),
    headers: { "Content-Type": "application/json", Accept: "*/*" },
  });
  return { status: res.status, body: await res.text() };
}

// True when the episode resolver is being gated by AllAnime's anti-scraping
// crypto layer (see AA_CRYPTO_MISSING). Set on the most recent episode query.
let lastCryptoGate = false;
const GATE_MSG =
  "AllAnime now protects its source API with a rotating client-crypto gate " +
  "(AA_CRYPTO_MISSING); the dedicated AllManga source needs a maintenance " +
  "update. Other sources still work.";

function trackGate(body) {
  if (typeof body === "string" && body.includes("AA_CRYPTO_MISSING")) {
    lastCryptoGate = true;
  }
}

async function allanimeGQLEpisode(variables) {
  try {
    const encodedVars = encodeURIComponent(JSON.stringify(variables));
    const extensions = encodeURIComponent(
      JSON.stringify({ persistedQuery: { version: 1, sha256Hash: EPISODE_GQL_HASH } }),
    );
    const getUrl = `https://api.allanime.day/api?variables=${encodedVars}&extensions=${extensions}`;
    const getRes = await apiFetch(getUrl);
    const body = await getRes.text();
    if (body && body.includes("tobeparsed")) return { status: getRes.status, body };
  } catch {}
  return allanimeGQL(variables, EPISODE_GQL);
}

function sanitizeTitle(t) {
  return t
    .replace(/[''`´]/g, "")
    .replace(/[:!.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── AniList: resolve correct season title for S2+ ────────────────────────────

async function anilistSeasonTitle(baseTitle, seasonNumber) {
  const resolveS1 = seasonNumber <= 1;
  const query = `query($search:String){Media(search:$search,type:ANIME,sort:SEARCH_MATCH){title{english romaji}episodes relations{edges{relationType node{type format title{english romaji}episodes startDate{year}seasonYear}}}}}`;
  const fallback = { title: baseTitle, romaji: null, episodes: null, nextTitle: null, nextRomaji: null };
  try {
    const res = await fetch("https://graphql.anilist.co/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { search: baseTitle } }),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json();
    const media = json?.data?.Media;
    if (!media) return fallback;

    const s1Romaji = media?.title?.romaji || null;
    const s1Episodes = media?.episodes || null;
    const sequels = (media.relations?.edges || [])
      .filter(
        (e) =>
          e.relationType === "SEQUEL" &&
          e.node.type === "ANIME" &&
          (e.node.format === "TV" || e.node.format === "TV_SHORT"),
      )
      .sort((a, b) => {
        const ya = a.node.startDate?.year || a.node.seasonYear || 9999;
        const yb = b.node.startDate?.year || b.node.seasonYear || 9999;
        return ya - yb;
      });

    const getTitle = (node) => node.title?.english || node.title?.romaji || null;
    const getRomaji = (node) => node.title?.romaji || null;

    if (resolveS1) {
      const next = sequels[0]?.node ?? null;
      return {
        title: media.title?.english || baseTitle,
        romaji: s1Romaji,
        episodes: s1Episodes,
        nextTitle: next ? getTitle(next) : null,
        nextRomaji: next ? getRomaji(next) : null,
      };
    }

    const target = sequels[seasonNumber - 2];
    if (!target) return { ...fallback, romaji: s1Romaji };
    const nextNode = sequels[seasonNumber - 1]?.node ?? null;
    return {
      title: getTitle(target.node) || baseTitle,
      romaji: getRomaji(target.node) || s1Romaji,
      episodes: target.node.episodes || null,
      nextTitle: nextNode ? getTitle(nextNode) : null,
      nextRomaji: nextNode ? getRomaji(nextNode) : null,
    };
  } catch {
    return fallback;
  }
}

// ── Hardcoded show IDs / split seasons ───────────────────────────────────────

const HARDCODED_SHOW_IDS = {
  "jojo's bizarre adventure": [
    "MeX4czvkwKGo3zdDp", "zyqDjR8te4z6taKyk", "GTAQH8Z9K6WbAdXsS",
    "JS9PzKiPanesGRvs5", "b6xFsr7MDSMcJArB9", "pwduJkjBLytqiWCvM",
  ],
};

const SPLIT_SEASONS = {
  "spy x family": {
    1: [
      { from: 1, showId: null, offset: 0 },
      { from: 13, showId: "H8Aey6QXE7HSqwvW3", offset: 12 },
    ],
  },
};

async function resolveEpisodeFromId(showId, epStr, dubSub, keyText) {
  const candidates = [epStr];
  if (!epStr.includes(".")) candidates.push(epStr + ".0");

  let sourceUrls = null;
  for (const attempt of candidates) {
    const epRes = await allanimeGQLEpisode({
      showId,
      translationType: dubSub,
      episodeString: attempt,
    });
    if (!epRes.body) continue;
    trackGate(epRes.body);
    const urls = parseEpisodeSourceUrls(epRes.body, keyText);
    if (urls?.length) {
      sourceUrls = urls;
      break;
    }
  }
  if (!sourceUrls) {
    if (lastCryptoGate) return { ok: false, error: GATE_MSG };
    return null;
  }
  return trySourceUrls(sourceUrls);
}

async function trySourceUrls(sourceUrls) {
  const decodedSources = sourceUrls
    .filter((s) => s.sourceUrl?.startsWith("--"))
    .map((s) => ({
      sourceName: s.sourceName || "",
      priority: s.priority || 0,
      path: decodeAllanimeUrl(s.sourceUrl).replace("/clock", "/clock.json"),
    }))
    .sort((a, b) => {
      const ai = PROVIDER_PRIORITY.indexOf(a.sourceName);
      const bi = PROVIDER_PRIORITY.indexOf(b.sourceName);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  for (const src of decodedSources) {
    // yt-dlp sources are not available server-side either.
    if (src.sourceName === "Yt-mp4" || src.path.includes("fast4speed.rsvp")) continue;

    let fetchUrl = src.path;
    if (fetchUrl.startsWith("//")) fetchUrl = "https:" + fetchUrl;
    else if (fetchUrl.startsWith("/")) fetchUrl = "https://allanime.day" + fetchUrl;
    else if (!fetchUrl.startsWith("http")) fetchUrl = "https://allanime.day/" + fetchUrl;

    try {
      const res = await apiFetch(fetchUrl);
      if (res.status !== 200 || res.ok === false) continue;
      const body = await res.text();
      let linkJson;
      try {
        linkJson = JSON.parse(body);
      } catch {
        continue;
      }
      const links = linkJson?.links;
      if (!links?.length) continue;
      const allLinks = links.filter((l) => l.link);
      const mp4Links = allLinks.filter(
        (l) => !l.link.includes(".m3u8") && !l.link.includes("master."),
      );
      const best = (mp4Links.length ? mp4Links : allLinks).sort(
        (a, b) =>
          (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0),
      )[0];
      if (!best) continue;
      return {
        ok: true,
        url: best.link,
        resolution: best.resolutionStr || "?",
        sourceName: src.sourceName,
        isDirectMp4: !best.link.includes(".m3u8"),
        referer: "https://allmanga.to",
      };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Resolve a playable URL for one anime episode/movie.
 * Returns { ok, url, resolution, sourceName, isDirectMp4, referer, searchTitle }
 * or { ok: false, error }.
 */
export async function resolveAllManga(
  { title, seasonNumber, episodeNumber, isMovie, translationType },
  keyText,
) {
  lastCryptoGate = false;
  try {
    const season = seasonNumber || 1;
    const dubSub = translationType === "dub" ? "dub" : "sub";

    if (!isMovie) {
      const splitParts = SPLIT_SEASONS[title.toLowerCase()]?.[season];
      if (splitParts) {
        let activePart = splitParts[0];
        for (const part of splitParts) {
          if (episodeNumber >= part.from) activePart = part;
        }
        const partEp = episodeNumber - activePart.offset;
        if (activePart.showId) {
          const result = await resolveEpisodeFromId(
            activePart.showId,
            String(partEp),
            dubSub,
            keyText,
          );
          if (result) return result;
        }
      }
    }

    if (!isMovie) {
      const hardcodedIds = HARDCODED_SHOW_IDS[title.toLowerCase()];
      if (hardcodedIds) {
        const showId =
          hardcodedIds[season - 1] ?? hardcodedIds[hardcodedIds.length - 1];
        const result = await resolveEpisodeFromId(
          showId,
          String(episodeNumber),
          dubSub,
          keyText,
        );
        if (result) return result;
      }
    }

    const anilistResult = isMovie
      ? { title, romaji: null, episodes: null, nextTitle: null, nextRomaji: null }
      : await anilistSeasonTitle(title, season);

    let searchTitle = anilistResult.title;
    let adjustedEpisodeNumber = episodeNumber;

    if (
      !isMovie &&
      anilistResult.episodes &&
      episodeNumber > anilistResult.episodes &&
      anilistResult.nextTitle
    ) {
      adjustedEpisodeNumber = episodeNumber - anilistResult.episodes;
      searchTitle = anilistResult.nextTitle;
    }

    const epStr = isMovie ? "1" : String(adjustedEpisodeNumber);

    const candidateSet = new Set([
      searchTitle,
      sanitizeTitle(searchTitle),
      ...(anilistResult.romaji && searchTitle === anilistResult.title ? [anilistResult.romaji] : []),
      ...(anilistResult.nextRomaji && searchTitle === anilistResult.nextTitle ? [anilistResult.nextRomaji] : []),
      title,
      sanitizeTitle(title),
    ]);
    const candidates = [...candidateSet].filter(Boolean);

    async function searchAllmanga(query) {
      const vars = {
        search: { allowAdult: true, allowUnknown: false, query: query.toLowerCase() },
        limit: 40,
        page: 1,
        translationType: dubSub,
        countryOrigin: "ALL",
      };
      const res = await allanimeGQL(vars, SEARCH_GQL);
      if (!res.body) return null;
      try {
        const edges = JSON.parse(res.body)?.data?.shows?.edges;
        return edges?.length ? edges : null;
      } catch {
        return null;
      }
    }

    let edges = null;
    let matchedTitle = searchTitle;
    for (const candidate of candidates) {
      edges = await searchAllmanga(candidate);
      if (edges) {
        matchedTitle = candidate;
        break;
      }
    }
    if (!edges) return { ok: false, error: "No results for: " + searchTitle };

    const titleLower = matchedTitle.toLowerCase();
    const anime =
      edges.find((e) => (e.name || "").toLowerCase() === titleLower) || edges[0];

    const epCandidates = [epStr];
    if (!epStr.includes(".")) epCandidates.push(epStr + ".0");

    let sourceUrls = null;
    for (const attempt of epCandidates) {
      const epRes = await allanimeGQLEpisode({
        showId: anime._id,
        translationType: dubSub,
        episodeString: attempt,
      });
      if (!epRes.body) continue;
      trackGate(epRes.body);
      const urls = parseEpisodeSourceUrls(epRes.body, keyText);
      if (urls?.length) {
        sourceUrls = urls;
        break;
      }
    }
    if (!sourceUrls?.length) {
      if (lastCryptoGate) return { ok: false, error: GATE_MSG };
      return { ok: false, error: "No sourceUrls for ep " + epStr };
    }

    const result = await trySourceUrls(sourceUrls);
    if (result) return { ...result, searchTitle };

    return { ok: false, error: "No playable link found" };
  } catch (e) {
    console.error("[allmanga] resolve failed:", e);
    return { ok: false, error: e.message || "Error" };
  }
}