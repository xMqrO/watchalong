import { useState, useEffect, useRef, useId } from "react";
import { tmdbFetch, imgUrl } from "../utils/api";
import { NavSearchIcon } from "./NavIcons";

const MAX_SUGGESTIONS = 6;

// Search box for the home spotlight. Typing shows matching titles right
// under the field (no page change). Picking one opens it; Enter with nothing
// highlighted, or the last row, opens the full results grid.
// Keyboard: Up/Down move, Enter picks, Escape closes (ARIA combobox).
export default function HeroSearch({ apiKey, offline, onSelect, onSeeAll }) {
  const [value, setValue] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const listId = useId();

  const query = value.trim();

  useEffect(() => {
    if (!query || offline) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    let live = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await tmdbFetch(
          `/search/multi?query=${encodeURIComponent(query)}&page=1`,
          apiKey,
        );
        if (!live) return;
        setResults(
          (data.results || [])
            .filter((r) => r.media_type === "movie" || r.media_type === "tv")
            .slice(0, MAX_SUGGESTIONS),
        );
        setFailed(false);
      } catch {
        if (live) {
          setResults([]);
          setFailed(true);
        }
      }
      if (live) setLoading(false);
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, apiKey, offline]);

  // Close when clicking anywhere outside the box.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => setActive(-1), [results]);

  // Rows: each suggestion, then "See all results".
  const rowCount = query ? results.length + 1 : 0;
  const seeAllIndex = results.length;

  const pick = (index) => {
    if (index >= 0 && index < results.length) {
      setOpen(false);
      onSelect(results[index]);
    } else if (query) {
      setOpen(false);
      onSeeAll(query);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (rowCount) setActive((i) => (i + 1) % rowCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rowCount) setActive((i) => (i <= 0 ? rowCount - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
      } else {
        setValue("");
      }
    }
  };

  const showPanel = open && !!query;
  const optionId = (i) => `${listId}-opt-${i}`;

  return (
    <div className="hero-search-wrap" ref={wrapRef}>
      <div className={`hero-search${showPanel ? " is-open" : ""}`}>
        <NavSearchIcon />
        <input
          className="hero-search-input"
          type="search"
          value={value}
          placeholder="Search movies and series"
          aria-label="Search movies and series"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={showPanel && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {value && (
          <button
            type="button"
            className="hero-search-clear"
            aria-label="Clear search"
            onClick={() => {
              setValue("");
              wrapRef.current?.querySelector("input")?.focus();
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 7l10 10M17 7 7 17" />
            </svg>
          </button>
        )}
      </div>

      {showPanel && (
        <div className="hero-suggest" role="listbox" id={listId} aria-label="Suggestions">
          {offline && <p className="hero-suggest-note">You're offline. Search needs a connection.</p>}

          {!offline && failed && (
            <p className="hero-suggest-note">Couldn't reach TMDB. Check your connection and keep typing to retry.</p>
          )}

          {!offline && !failed && loading && results.length === 0 && (
            <p className="hero-suggest-note">Searching for "{query}"</p>
          )}

          {!offline && !failed && !loading && results.length === 0 && (
            <p className="hero-suggest-note">No titles match "{query}". Check the spelling or try fewer words.</p>
          )}

          {results.map((r, i) => {
            const title = r.title || r.name;
            const year = (r.release_date || r.first_air_date || "").slice(0, 4);
            return (
              <div
                key={`${r.media_type}-${r.id}`}
                id={optionId(i)}
                role="option"
                aria-selected={active === i}
                className={`hero-suggest-item${active === i ? " is-active" : ""}`}
                onPointerEnter={() => setActive(i)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
              >
                <span className="hero-suggest-poster">
                  {r.poster_path && (
                    <img src={imgUrl(r.poster_path, "w92")} alt="" width="36" height="54" />
                  )}
                </span>
                <span className="hero-suggest-text">
                  <span className="hero-suggest-title">{title}</span>
                  <span className="hero-suggest-meta">
                    {r.media_type === "tv" ? "Series" : "Movie"}
                    {year ? ` · ${year}` : ""}
                  </span>
                </span>
                {r.vote_average > 0 && (
                  <span className="hero-suggest-score">{r.vote_average.toFixed(1)}</span>
                )}
              </div>
            );
          })}

          {!offline && (
            <div
              id={optionId(seeAllIndex)}
              role="option"
              aria-selected={active === seeAllIndex}
              className={`hero-suggest-all${active === seeAllIndex ? " is-active" : ""}`}
              onPointerEnter={() => setActive(seeAllIndex)}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(seeAllIndex)}
            >
              See all results for "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
