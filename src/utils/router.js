// ── URL Router ─────────────────────────────────────────────────────────────────
// Custom lightweight router layered on top of App's existing page/selected
// state. Every page maps to a user-shareable URL:
//   /                    → home
//   /settings[?section=] → settings
//   /library             → library (history + continue watching + watchlist)
//   /downloads           → downloads
//   /search?q=<query>    → search (URL owns the query)
//   /watch/<slug>-<id>   → movie (id is the stable TMDB id)
//   /<slug>[/s<n>[/ep<m>]] → tv series / season / episode
//
// Movies keep the id in the URL (stable + directly loadable). TV series use a
// slug-only URL and resolve the id via TMDB search, because a trailing `-<id>`
// would be ambiguous with real slugs like "the-100".

import { tmdbFetch } from "./api";

const decodeSeg = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const normName = (s = "") =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

export const slugify = (title = "") =>
  String(title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-") || "title";

export const deSlug = (slug = "") =>
  String(slug)
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");

// Parse a URL (defaults to window.location) into a routing descriptor.
// Returns { page, data, needsResolve } where needsResolve means a TMDB id must
// be looked up (slug-only series / watch routes) before the page can render.
export function parseRoute(pathnameValue, searchValue) {
  const pathname = pathnameValue ?? window.location.pathname;
  const search = searchValue ?? window.location.search;
  const clean = (p) => p.replace(/\/+$/, "") || "/";
  const path = clean(pathname);
  const parts = path === "/" ? [] : path.slice(1).split("/");
  const first = (parts[0] || "").toLowerCase();
  const params = new URLSearchParams(search);
  const notfound = { page: "notfound", data: null, needsResolve: false };

  if (first === "" || first === "home") {
    return { page: "home", data: null, needsResolve: false };
  }
  if (first === "settings") {
    return {
      page: "settings",
      data: { section: params.get("section") || null },
      needsResolve: false,
    };
  }
  if (first === "library" || first === "history" || first === "continue-watching") {
    return { page: "history", data: null, needsResolve: false };
  }
  if (first === "downloads") {
    return { page: "downloads", data: null, needsResolve: false };
  }
  if (first === "search") {
    return {
      page: "search",
      data: { query: params.get("q") || "" },
      needsResolve: false,
    };
  }
  if (first === "watch") {
    if (!parts[1]) return notfound;
    const watched = decodeSeg(parts[1]);
    const m = watched.match(/^(.+)-(\d+)$/);
    if (m) {
      return {
        page: "movie",
        data: { id: Number(m[2]), title: m[1], media_type: "movie" },
        needsResolve: false,
      };
    }
    return {
      page: "movie",
      data: { id: null, title: watched, media_type: "movie" },
      needsResolve: true,
    };
  }
  if (first === "404") return notfound;

  // TV series: /<slug>[/s<n>[/ep<m>]]
  if (parts.length > 3) return notfound;
  const season = parts[1] && /^s\d+$/i.test(parts[1])
    ? Number(parts[1].slice(1).toLowerCase())
    : null;
  if (parts[1] && season == null) return notfound;
  const episode = parts[2] && /^ep\d+$/i.test(parts[2])
    ? Number(parts[2].slice(2).toLowerCase())
    : null;
  if (parts[2] && episode == null) return notfound;

  return {
    page: "tv",
    data: {
      id: null,
      title: deSlug(decodeSeg(parts[0])),
      season,
      episode,
      media_type: "tv",
    },
    needsResolve: true,
  };
}

// Build the canonical URL for a page + data.
export function routeToPath(page, data = null) {
  // TMDB TV results expose the title as `name`; movies use `title`. Accept
  // both so slugs are always derived from the real series/movie name.
  const titleOf = (d) => d?.title || d?.name || "";
  switch (page) {
    case "home":
      return "/";
    case "settings": {
      const section = data?.section;
      return section
        ? `/settings?section=${encodeURIComponent(section)}`
        : "/settings";
    }
    case "history":
      return "/library";
    case "downloads":
      return "/downloads";
    case "search": {
      const q = String(data?.query || "").trim();
      return q ? `/search?q=${encodeURIComponent(q)}` : "/search";
    }
    case "movie": {
      const slug = slugify(titleOf(data));
      const id = data?.id;
      return id != null ? `/watch/${slug}-${id}` : `/watch/${slug}`;
    }
    case "tv": {
      const slug = slugify(titleOf(data));
      let path = `/${slug}`;
      if (data?.season != null) path += `/s${Number(data.season)}`;
      if (data?.episode != null) path += `/ep${Number(data.episode)}`;
      return path;
    }
    default:
      return "/";
  }
}

// Resolve a slug-only title to a minimal TMDB item via search.
// Picks the exact normalized-title match; falls back to the longest
// containment match; otherwise null.
export async function resolveRouteItem(kind, title, apiKey) {
  const q = String(title || "").trim();
  if (!q) return null;
  let res;
  try {
    res = await tmdbFetch(
      `/search/multi?query=${encodeURIComponent(q)}&include_adult=true&page=1`,
      apiKey,
    );
  } catch {
    return null;
  }
  const results = res?.results || [];
  const target = normName(q);
  let best = null;
  let bestLen = -1;
  for (const r of results) {
    if (r.media_type !== kind) continue;
    const name = kind === "movie" ? r.title : r.name;
    if (!name) continue;
    const norm = normName(name);
    if (norm === target) {
      return { id: r.id, title: name, media_type: kind };
    }
    if (norm.includes(target) || target.includes(norm)) {
      if (norm.length > bestLen) {
        bestLen = norm.length;
        best = { id: r.id, title: name, media_type: kind };
      }
    }
  }
  return best;
}