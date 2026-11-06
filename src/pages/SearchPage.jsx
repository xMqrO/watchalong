import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { tmdbFetch } from "../utils/api";
import { CloseIcon } from "../components/Icons";
import { NavSearchIcon } from "../components/NavIcons";
import MediaCard from "../components/MediaCard";
import { storage } from "../utils/storage";

const HISTORY_KEY = "searchHistory";
const MAX_HISTORY = 12;

function loadHistory() {
  return storage.get(HISTORY_KEY) || [];
}

function saveHistory(history) {
  storage.set(HISTORY_KEY, history);
}

const SORTS = [
  { id: "relevance", label: "Best match" },
  { id: "popular", label: "Most popular" },
  { id: "rating", label: "Highest rated" },
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
];

const DECADES = [
  { id: "any", label: "Any year" },
  { id: "2020", label: "2020s" },
  { id: "2010", label: "2010s" },
  { id: "2000", label: "2000s" },
  { id: "1990", label: "1990s" },
  { id: "old", label: "Before 1990" },
];

const RATINGS = [
  { id: "0", label: "Any rating" },
  { id: "6", label: "6+" },
  { id: "7", label: "7+" },
  { id: "8", label: "8+" },
];

const DEFAULT_FILTERS = {
  type: "all",
  genre: "any",
  sort: "relevance",
  decade: "any",
  lang: "any",
  rating: "0",
};

const yearOf = (r) =>
  Number((r.release_date || r.first_air_date || "").slice(0, 4)) || null;

let languageNames = null;
const languageLabel = (code) => {
  try {
    languageNames ??= new Intl.DisplayNames(["en"], { type: "language" });
    return languageNames.of(code) || code;
  } catch {
    return code;
  }
};

// Page-mode search: the URL owns the query (`/search?q=...`). The parent
// App replays `onQueryChange` into the URL via replaceState, so typing never
// spams history while still staying fully shareable / deep-linkable.
//
// Results are a poster grid. TMDB's search endpoint has no filters, so the
// filters below work on the pages already loaded; "Load more" fetches the
// next page and the filters apply to it too. Every option is built from
// data the results actually carry (genre ids, dates, scores, language).
export default function SearchPage({
  query,
  onQueryChange,
  apiKey,
  onSelect,
  offline,
  isSaved,
  onToggleSave,
  watched,
}) {
  const [inputValue, setInputValue] = useState(query || "");
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [genreNames, setGenreNames] = useState({});
  const inputRef = useRef();

  const term = inputValue.trim();

  // Keep the visible input in sync with the URL (back/forward, typed share).
  useEffect(() => {
    setInputValue(query || "");
  }, [query]);

  useEffect(() => {
    const tid = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(tid);
  }, []);

  // Genre id -> name for movies and series (cached by tmdbFetch).
  useEffect(() => {
    if (!apiKey || offline) return;
    let live = true;
    Promise.all([
      tmdbFetch("/genre/movie/list", apiKey).catch(() => ({})),
      tmdbFetch("/genre/tv/list", apiKey).catch(() => ({})),
    ]).then(([m, t]) => {
      if (!live) return;
      const map = {};
      for (const g of [...(m.genres || []), ...(t.genres || [])]) map[g.id] = g.name;
      setGenreNames(map);
    });
    return () => {
      live = false;
    };
  }, [apiKey, offline]);

  const fetchPage = useCallback(
    (q, p) =>
      tmdbFetch(`/search/multi?query=${encodeURIComponent(q)}&page=${p}`, apiKey).then(
        (data) => ({
          items: (data.results || []).filter(
            (r) => r.media_type === "movie" || r.media_type === "tv",
          ),
          totalPages: data.total_pages || 0,
        }),
      ),
    [apiKey],
  );

  // New search term: reset to page 1.
  useEffect(() => {
    if (!term || offline) {
      setResults([]);
      setTotalPages(0);
      setError(false);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { items, totalPages: tp } = await fetchPage(term, 1);
        if (!live) return;
        setResults(items);
        setPage(1);
        setTotalPages(tp);
        setError(false);
      } catch {
        if (live) setError(true);
      }
      if (live) setLoading(false);
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [term, offline, fetchPage]);

  const loadMore = async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const { items } = await fetchPage(term, page + 1);
      setResults((prev) => {
        const seen = new Set(prev.map((r) => `${r.media_type}_${r.id}`));
        return [...prev, ...items.filter((r) => !seen.has(`${r.media_type}_${r.id}`))];
      });
      setPage((p) => p + 1);
    } catch {
      setError(true);
    }
    setLoadingMore(false);
  };

  const handleChange = useCallback(
    (value) => {
      setInputValue(value);
      onQueryChange?.(value);
    },
    [onQueryChange],
  );

  const addToHistory = useCallback((t) => {
    const trimmed = t.trim();
    if (!trimmed) return;
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  const removeFromHistory = useCallback((t) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h !== t);
      saveHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  const handleSelect = (r) => {
    addToHistory(inputValue);
    onSelect(r);
  };

  // ── Filter options, built from what the loaded results contain ──────────
  const genreOptions = useMemo(() => {
    const names = new Set();
    for (const r of results)
      for (const id of r.genre_ids || []) if (genreNames[id]) names.add(genreNames[id]);
    return [...names].sort();
  }, [results, genreNames]);

  const langOptions = useMemo(() => {
    const counts = {};
    for (const r of results)
      if (r.original_language) counts[r.original_language] = (counts[r.original_language] || 0) + 1;
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  }, [results]);

  const filtered = useMemo(() => {
    const f = filters;
    let list = results.filter((r) => {
      if (f.type !== "all" && r.media_type !== f.type) return false;
      if (f.genre !== "any" && !(r.genre_ids || []).some((id) => genreNames[id] === f.genre))
        return false;
      if (f.lang !== "any" && r.original_language !== f.lang) return false;
      if (Number(f.rating) > 0 && !((r.vote_average || 0) >= Number(f.rating))) return false;
      if (f.decade !== "any") {
        const y = yearOf(r);
        if (!y) return false;
        if (f.decade === "old" ? y >= 1990 : y < Number(f.decade) || y >= Number(f.decade) + 10)
          return false;
      }
      return true;
    });
    const by = {
      popular: (a, b) => (b.popularity || 0) - (a.popularity || 0),
      rating: (a, b) => (b.vote_average || 0) - (a.vote_average || 0),
      newest: (a, b) => (yearOf(b) || 0) - (yearOf(a) || 0),
      oldest: (a, b) => (yearOf(a) || 9999) - (yearOf(b) || 9999),
    }[f.sort];
    if (by) list = [...list].sort(by);
    return list;
  }, [results, filters, genreNames]);

  const filtersActive = Object.keys(DEFAULT_FILTERS).some((k) => filters[k] !== DEFAULT_FILTERS[k]);
  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  const showHistory = !term && history.length > 0;

  return (
    <div className="results-page">
      <div className="results-head">
        <div className="results-input">
          <NavSearchIcon />
          <input
            ref={inputRef}
            type="search"
            className="results-input-field"
            placeholder="Search movies and series"
            aria-label="Search movies and series"
            value={inputValue}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && term) addToHistory(inputValue);
            }}
            autoComplete="off"
            spellCheck={false}
          />
          {inputValue && (
            <button
              type="button"
              className="results-input-clear"
              aria-label="Clear search"
              onClick={() => {
                handleChange("");
                inputRef.current?.focus();
              }}
            >
              <CloseIcon />
            </button>
          )}
        </div>

        {term && !offline && (
          <div className="results-filters" role="group" aria-label="Filter results">
            <label className="filter">
              <span className="filter-label">Type</span>
              <select value={filters.type} onChange={setFilter("type")}>
                <option value="all">Movies and series</option>
                <option value="movie">Movies</option>
                <option value="tv">Series</option>
              </select>
            </label>
            <label className="filter">
              <span className="filter-label">Genre</span>
              <select value={filters.genre} onChange={setFilter("genre")}>
                <option value="any">Any genre</option>
                {genreOptions.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter">
              <span className="filter-label">Sort</span>
              <select value={filters.sort} onChange={setFilter("sort")}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter">
              <span className="filter-label">Year</span>
              <select value={filters.decade} onChange={setFilter("decade")}>
                {DECADES.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter">
              <span className="filter-label">Language</span>
              <select value={filters.lang} onChange={setFilter("lang")}>
                <option value="any">Any language</option>
                {langOptions.map((l) => (
                  <option key={l} value={l}>
                    {languageLabel(l)}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter">
              <span className="filter-label">Rating</span>
              <select value={filters.rating} onChange={setFilter("rating")}>
                {RATINGS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            {filtersActive && (
              <button
                type="button"
                className="btn btn-secondary filter-reset"
                onClick={() => setFilters(DEFAULT_FILTERS)}
              >
                Reset filters
              </button>
            )}
          </div>
        )}
      </div>

      {offline && (
        <div className="results-state" role="status">
          <h2>You're offline</h2>
          <p>Search needs an internet connection. Your downloads and library still work.</p>
        </div>
      )}

      {!offline && term && loading && results.length === 0 && (
        <div className="loader" role="status" aria-label={`Searching for ${term}`}>
          <div className="spinner" />
        </div>
      )}

      {!offline && term && error && results.length === 0 && !loading && (
        <div className="results-state" role="alert">
          <h2>Search didn't load</h2>
          <p>TMDB couldn't be reached. Check your connection, then edit the search to try again.</p>
        </div>
      )}

      {!offline && term && !loading && !error && results.length === 0 && (
        <div className="results-state" role="status">
          <h2>No titles match "{term}"</h2>
          <p>Check the spelling, or try the original title or fewer words.</p>
        </div>
      )}

      {!offline && results.length > 0 && filtered.length === 0 && (
        <div className="results-state" role="status">
          <h2>Nothing matches these filters</h2>
          <p>{results.length} titles were found for "{term}", but none fit every filter.</p>
          <button type="button" className="btn btn-secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Reset filters
          </button>
        </div>
      )}

      {!offline && filtered.length > 0 && (
        <>
          <p className="results-count" role="status">
            {filtered.length} {filtered.length === 1 ? "title" : "titles"}
            {filtersActive ? ` of ${results.length} loaded` : ""}
          </p>
          <div className="results-grid">
            {filtered.map((r) => {
              const saved = isSaved?.(r);
              const title = r.title || r.name;
              return (
                <div key={`${r.media_type}_${r.id}`} className="result-tile">
                  <MediaCard
                    item={r}
                    onClick={() => handleSelect(r)}
                    progress={0}
                    watched={watched}
                  />
                  {r.vote_average > 0 && (
                    <span className="result-score" aria-label={`Rated ${r.vote_average.toFixed(1)} on TMDB`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
                      </svg>
                      {r.vote_average.toFixed(1)}
                    </span>
                  )}
                  {onToggleSave && (
                    <button
                      type="button"
                      className={`result-save${saved ? " is-saved" : ""}`}
                      aria-pressed={!!saved}
                      aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
                      onClick={() => onToggleSave(r)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 4.75h10a1 1 0 0 1 1 1V20l-6-4-6 4V5.75a1 1 0 0 1 1-1z" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {page < totalPages && (
            <div className="results-more">
              <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more results"}
              </button>
            </div>
          )}
        </>
      )}

      {showHistory && (
        <section className="results-recent" aria-labelledby="recent-heading">
          <div className="results-recent-head">
            <h2 id="recent-heading">Recent searches</h2>
            <button type="button" className="results-link" onClick={clearHistory}>
              Clear all
            </button>
          </div>
          <ul className="results-chips">
            {history.map((t) => (
              <li key={t} className="results-chip">
                <button type="button" className="results-chip-term" onClick={() => handleChange(t)}>
                  {t}
                </button>
                <button
                  type="button"
                  className="results-chip-remove"
                  aria-label={`Remove ${t} from recent searches`}
                  onClick={() => removeFromHistory(t)}
                >
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!term && history.length === 0 && !offline && (
        <div className="results-state">
          <h2>Find something to watch</h2>
          <p>Type a movie or series title. Results show as you type.</p>
        </div>
      )}
    </div>
  );
}
