import { useState, useEffect, useRef, useCallback } from "react";
import { tmdbFetch, imgUrl } from "../utils/api";
import { SearchIcon, CloseIcon } from "../components/Icons";
import { storage } from "../utils/storage";

const HISTORY_KEY = "searchHistory";
const MAX_HISTORY = 12;

function loadHistory() {
  return storage.get(HISTORY_KEY) || [];
}

function saveHistory(history) {
  storage.set(HISTORY_KEY, history);
}

// Page-mode search: the URL owns the query (`/search?q=...`). The parent
// App replays `onQueryChange` into the URL via replaceState, so typing never
// spams history while still staying fully shareable / deep-linkable.
export default function SearchPage({
  query,
  onQueryChange,
  apiKey,
  onSelect,
  offline,
}) {
  const [inputValue, setInputValue] = useState(query || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const inputRef = useRef();

  // Keep the visible input in sync with the URL (back/forward, typed share).
  useEffect(() => {
    setInputValue(query || "");
  }, [query]);

  useEffect(() => {
    const tid = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(tid);
  }, []);

  useEffect(() => {
    if (!inputValue.trim()) {
      setResults([]);
      return;
    }
    let mounted = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await tmdbFetch(
          `/search/multi?query=${encodeURIComponent(inputValue)}&page=1`,
          apiKey,
        );
        if (mounted) {
          setResults(
            (data.results || [])
              .filter((r) => r.media_type !== "person")
              .slice(0, 12),
          );
        }
      } catch {}
      if (mounted) setLoading(false);
    }, 380);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [inputValue, apiKey]);

  const handleChange = useCallback(
    (value) => {
      setInputValue(value);
      onQueryChange?.(value);
    },
    [onQueryChange],
  );

  const addToHistory = useCallback((term) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((h) => h !== trimmed)].slice(
        0,
        MAX_HISTORY,
      );
      saveHistory(next);
      return next;
    });
  }, []);

  const removeFromHistory = useCallback((e, term) => {
    e.stopPropagation();
    setHistory((prev) => {
      const next = prev.filter((h) => h !== term);
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

  const handleHistoryClick = useCallback((term) => {
    handleChange(term);
  }, [handleChange]);

  const handleKey = (e) => {
    if (e.key === "Enter" && inputValue.trim()) addToHistory(inputValue);
  };

  const showHistory = !inputValue.trim() && history.length > 0;

  return (
    <div className="search-page">
      <div className="search-box">
        <div className="search-input-wrap">
          <SearchIcon />
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search movies and series..."
            value={inputValue}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKey}
          />
          {inputValue.trim() ? (
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => handleChange("")}
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>

        <div className="search-results">
          {offline && (
            <div
              style={{
                padding: "12px 20px",
                background: "rgba(255,165,0,0.1)",
                borderBottom: "1px solid var(--border)",
                fontSize: 13,
                color: "#ff9800",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              🌐 No internet, search is unavailable offline.
            </div>
          )}

          {!offline && loading && (
            <div className="loader">
              <div className="spinner" />
            </div>
          )}

          {!loading && inputValue.trim() && results.length === 0 && (
            <div className="search-empty">No results for "{inputValue}"</div>
          )}

          {!loading &&
            results.map((r) => (
              <div
                key={`${r.media_type}-${r.id}`}
                className="search-result"
                onClick={() => handleSelect(r)}
              >
                <img
                  src={
                    r.poster_path
                      ? imgUrl(r.poster_path, "w92")
                      : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='58'%3E%3Crect fill='%23222' width='40' height='58'/%3E%3C/svg%3E"
                  }
                  alt=""
                />
                <div className="search-result-info">
                  <div className="search-result-title">{r.title || r.name}</div>
                  <div className="search-result-meta">
                    {(r.release_date || r.first_air_date || "").slice(0, 4)}
                    {r.vote_average
                      ? ` · ★ ${r.vote_average.toFixed(1)}`
                      : ""}
                  </div>
                </div>
                <span
                  className={`search-result-type ${r.media_type === "tv" ? "type-tv" : "type-movie"}`}
                >
                  {r.media_type === "tv" ? "Series" : "Movie"}
                </span>
              </div>
            ))}

          {showHistory && (
            <div className="search-history">
              <div className="search-history-header">
                <span className="search-history-label">Recent searches</span>
                <button
                  className="search-history-clear"
                  onClick={clearHistory}
                >
                  Clear all
                </button>
              </div>
              {history.map((term) => (
                <div
                  key={term}
                  className="search-history-item"
                  onClick={() => handleHistoryClick(term)}
                >
                  <span className="search-history-icon">
                    <SearchIcon />
                  </span>
                  <span className="search-history-term">{term}</span>
                  <button
                    className="search-history-remove"
                    onClick={(e) => removeFromHistory(e, term)}
                    title="Remove"
                  >
                    <CloseIcon />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!inputValue.trim() && history.length === 0 && (
            <div className="search-hint">Search for movies and series</div>
          )}
        </div>
      </div>
    </div>
  );
}