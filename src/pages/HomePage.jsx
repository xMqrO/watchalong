import { useState, useEffect, useMemo, useCallback } from "react";
import MediaCard from "../components/MediaCard";
import PosterRow from "../components/PosterRow";
import HeroSearch from "../components/HeroSearch";
import { PlayIcon, StarIcon } from "../components/Icons";
import { imgUrl, tmdbFetch } from "../utils/api";
import { useRatings, getRatingForItem } from "../utils/useRatings";
import { isRestricted } from "../utils/ageRating";
import { storage } from "../utils/storage";
import { loadHomeLayout, loadHomeViewMode } from "../utils/homeLayout";

/**
 * Extract up to `count` unique, recently watched items from the user's
 * history (within the last 30 days).  Returns newest-first and dedupes
 * by TMDB id + media_type so we don't fire duplicate API calls.
 */
function getRecentHistoryItems(history, count = 5) {
  if (!history || history.length === 0) return [];
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = history
    .filter((h) => h.watchedAt && h.watchedAt > thirtyDaysAgo)
    .sort((a, b) => b.watchedAt - a.watchedAt);

  const seen = new Set();
  const unique = [];
  for (const item of recent) {
    const key = `${item.media_type || "movie"}_${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= count) break;
  }
  return unique;
}

export default function HomePage({
  trending,
  trendingTV,
  loading,
  onSelect,
  progress,
  inProgress,
  offline,
  onRetry,
  watched,
  onMarkWatched,
  onMarkUnwatched,
  history,
  apiKey,
  onSearch,
}) {
  // Spotlight: the top trending movies that have a backdrop. The viewer picks
  // which one fills the hero; nothing rotates on its own.
  const spotlight = useMemo(
    () => trending.filter((i) => i.backdrop_path).slice(0, 5),
    [trending],
  );
  const [spotIndex, setSpotIndex] = useState(0);
  const hero = spotlight[spotIndex] || spotlight[0] || trending[0];

  const [recommendedItems, setRecommendedItems] = useState([]);
  const [topRatedItems, setTopRatedItems] = useState([]);

  // Load layout config (order + visibility) once on mount
  const [layout] = useState(() => loadHomeLayout());
  const { order: rowOrder, visible: rowVisible } = layout;

  const [viewMode] = useState(() => loadHomeViewMode());

  // All items for batch ratings fetch
  const allItems = useMemo(
    () => [
      ...inProgress,
      ...trending.map((i) => ({ ...i, media_type: "movie" })),
      ...trendingTV.map((i) => ({ ...i, media_type: "tv" })),
      ...recommendedItems,
      ...topRatedItems,
    ],
    [inProgress, trending, trendingTV, recommendedItems, topRatedItems],
  );

  const { ratingsMap, ageLimitSetting } = useRatings(allItems);

  const getRating = useCallback(
    (item) => getRatingForItem(item, ratingsMap),
    [ratingsMap],
  );
  const itemRestricted = useCallback(
    (item) =>
      isRestricted(getRatingForItem(item, ratingsMap).minAge, ageLimitSetting),
    [ratingsMap, ageLimitSetting],
  );

  // Enrich ratingsMap with restricted flag for carousels
  const enrichedRatingsMap = useMemo(() => {
    const out = {};
    for (const [k, v] of Object.entries(ratingsMap)) {
      out[k] = { ...v, restricted: isRestricted(v.minAge, ageLimitSetting) };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratingsMap, ageLimitSetting]);

  // Filter recommended items that exceed age limit setting
  const filteredRecommendedItems = useMemo(() => {
    return recommendedItems.filter((item) => !itemRestricted(item));
  }, [recommendedItems, itemRestricted]);

  // Fetch personalised recommendations from multiple recent history items
  useEffect(() => {
    if (!apiKey || offline || !history || history.length === 0) return;
    const sources = getRecentHistoryItems(history, 5);
    if (sources.length === 0) return;

    const controller = new AbortController();

    // Build a Set of already-watched TMDB ids for dedup
    const watchedIds = new Set(
      (history || []).map((h) => `${h.media_type || "movie"}_${h.id}`),
    );

    // For each source, try /recommendations first, fall back to /similar
    const fetches = sources.map((source) => {
      const type = source.media_type === "tv" ? "tv" : "movie";
      return tmdbFetch(`/${type}/${source.id}/recommendations`, apiKey, {
        signal: controller.signal,
      })
        .then((data) => {
          const results = (data.results || []).map((i) => ({
            ...i,
            media_type: type,
          }));
          if (results.length > 0) return results;
          // Fall back to /similar if /recommendations returned nothing
          return tmdbFetch(`/${type}/${source.id}/similar`, apiKey, {
            signal: controller.signal,
          }).then((d) =>
            (d.results || []).map((i) => ({ ...i, media_type: type })),
          );
        })
        .catch(() => []);
    });

    Promise.all(fetches)
      .then((arrays) => {
        // Interleave results from each source for variety
        const merged = [];
        const maxLen = Math.max(...arrays.map((a) => a.length));
        for (let i = 0; i < maxLen; i++) {
          for (const arr of arrays) {
            if (arr[i]) merged.push(arr[i]);
          }
        }

        // Deduplicate and filter out already-watched items
        const seen = new Set();
        const deduped = merged.filter((item) => {
          const key = `${item.media_type}_${item.id}`;
          if (seen.has(key) || watchedIds.has(key)) return false;
          seen.add(key);
          return true;
        });

        setRecommendedItems(deduped.slice(0, 20));
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          console.warn("Recommendations fetch failed", e);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, offline, history?.length]);

  // Fetch top rated movies + TV, merge and shuffle
  useEffect(() => {
    if (!apiKey || offline) return;
    const controller = new AbortController();
    Promise.all([
      tmdbFetch("/movie/top_rated?page=1", apiKey, {
        signal: controller.signal,
      }),
      tmdbFetch("/tv/top_rated?page=1", apiKey, { signal: controller.signal }),
    ])
      .then(([moviesData, tvData]) => {
        const movies = (moviesData.results || [])
          .slice(0, 8)
          .map((i) => ({ ...i, media_type: "movie" }));
        const tv = (tvData.results || [])
          .slice(0, 8)
          .map((i) => ({ ...i, media_type: "tv" }));
        // Interleave movies and TV for variety
        const merged = [];
        const max = Math.max(movies.length, tv.length);
        for (let i = 0; i < max; i++) {
          if (movies[i]) merged.push(movies[i]);
          if (tv[i]) merged.push(tv[i]);
        }
        setTopRatedItems(merged);
      })
      .catch((e) => {
        if (e.name !== "AbortError") console.warn("Top rated fetch failed", e);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, offline]);

  // Stable pre-built item arrays for carousels, capped at 10
  const trendingMovieItems = useMemo(
    () => trending.slice(0, 10).map((i) => ({ ...i, media_type: "movie" })),
    [trending],
  );
  const trendingTVItems = useMemo(
    () => trendingTV.slice(0, 10).map((i) => ({ ...i, media_type: "tv" })),
    [trendingTV],
  );

  // Top rated, shown as a list ordered by the real TMDB score.
  const topRatedByScore = useMemo(
    () =>
      [...topRatedItems]
        .filter((i) => !itemRestricted(i))
        .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0)),
    [topRatedItems, itemRestricted],
  );

  const renderCard = (item, prog = 0, home = true) => {
    const type = item.media_type === "tv" ? "tv" : "movie";
    const rd = enrichedRatingsMap[`${type}_${item.id}`] || {};
    return (
      <MediaCard
        key={`${item.media_type}_${item.id}`}
        item={item}
        onClick={() => onSelect(item)}
        progress={prog}
        watched={watched}
        onMarkWatched={onMarkWatched}
        onMarkUnwatched={onMarkUnwatched}
        ageRating={rd.cert}
        restricted={rd.restricted}
        isHomeCard={home}
      />
    );
  };

  // "carousel" view mode (the default) now shows scrollable poster rows;
  // "list" view mode keeps the wrapping grid.
  const renderRow = (key, title, items) => {
    if (!items || items.length === 0) return null;
    if (viewMode === "list") {
      return (
        <section key={key} className="section" aria-labelledby={`row-${key}`}>
          <h2 className="section-title" id={`row-${key}`}>
            {title}
          </h2>
          <div className="cards-grid">{items.map((i) => renderCard(i))}</div>
        </section>
      );
    }
    return (
      <PosterRow key={key} id={key} title={title}>
        {items.map((i) => renderCard(i))}
      </PosterRow>
    );
  };

  return (
    <div className="home fade-in">
      {/* ── Offline ── */}
      {offline && (
        <div className="state-panel" role="status">
          <h1 className="state-panel-title">You're offline</h1>
          <p className="state-panel-text">
            Trending and search need an internet connection. Your downloads and
            library still work.
          </p>
          <button className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {!offline && loading && (
        <div className="loader" role="status" aria-label="Loading trending titles">
          <div className="spinner" />
        </div>
      )}

      {/* ── Spotlight ── */}
      {!loading && hero && (
        <section className="hero" aria-label="Spotlight">
          <div className="hero-bg">
            {hero.backdrop_path && (
              <img
                key={hero.id}
                src={imgUrl(hero.backdrop_path, "w1280")}
                srcSet={`${imgUrl(hero.backdrop_path, "w780")} 780w, ${imgUrl(hero.backdrop_path, "w1280")} 1280w, ${imgUrl(hero.backdrop_path, "original")} 2400w`}
                sizes="100vw"
                alt=""
                width="1920"
                height="1080"
                fetchpriority="high"
                decoding="async"
              />
            )}
          </div>
          <div className="hero-gradient" />
          {onSearch && (
            <div className="hero-header">
              <HeroSearch
                apiKey={apiKey}
                offline={offline}
                onSelect={onSelect}
                onSeeAll={onSearch}
              />
            </div>
          )}
          <div className="hero-content">
            <p className="hero-type">
              Trending now
              {spotlight.length > 1 ? ` · ${spotIndex + 1} of ${spotlight.length}` : ""}
            </p>
            <h1 className="hero-title">{hero.title || hero.name}</h1>
            <div className="hero-meta">
              {hero.vote_average > 0 && (
                <span className="hero-rating">
                  <StarIcon /> {hero.vote_average.toFixed(1)}
                </span>
              )}
              {hero.release_date && <span>{hero.release_date.slice(0, 4)}</span>}
              <span>Movie</span>
            </div>
            <p className="hero-overview">{hero.overview}</p>
            <div className="hero-actions">
              <button
                className="btn btn-primary"
                onClick={() => onSelect({ ...hero, media_type: "movie" })}
              >
                <PlayIcon /> Watch now
              </button>
            </div>
          </div>

          {spotlight.length > 1 && (
            <div className="spotlight-picker" role="group" aria-label="Choose spotlight title">
              {spotlight.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  className={`spotlight-tile${i === spotIndex ? " is-active" : ""}`}
                  aria-pressed={i === spotIndex}
                  onClick={() => setSpotIndex(i)}
                >
                  <img
                    src={imgUrl(item.backdrop_path, "w300")}
                    alt=""
                    width="300"
                    height="169"
                    loading="lazy"
                  />
                  <span className="spotlight-tile-title">
                    {item.title || item.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Rows in user-configured order ── */}
      <div className="home-rows">
        {rowOrder.map((id) => {
          if (!rowVisible[id]) return null;

          if (id === "continue") {
            if (inProgress.length === 0) return null;
            const cards = inProgress.map((item) => {
              const pk =
                item.media_type === "movie"
                  ? `movie_${item.id}`
                  : `tv_${item.id}_s${item.season}e${item.episode}`;
              const r = getRating(item);
              const restr = itemRestricted(item);
              return (
                <MediaCard
                  key={`${item.media_type}_${item.id}`}
                  item={item}
                  onClick={() => onSelect(item)}
                  progress={progress[pk] || 0}
                  watched={watched}
                  onMarkWatched={onMarkWatched}
                  onMarkUnwatched={onMarkUnwatched}
                  ageRating={r.cert}
                  restricted={restr}
                />
              );
            });
            return (
              <PosterRow key="continue" id="continue" title="Continue watching">
                {cards}
              </PosterRow>
            );
          }

          if (id === "recommended")
            return renderRow(
              "recommended",
              "Because you watched",
              filteredRecommendedItems,
            );
          if (id === "trendingMovies")
            return renderRow("trendingMovies", "Trending movies", trendingMovieItems);
          if (id === "trendingTV")
            return renderRow("trendingTV", "Trending series", trendingTVItems);

          if (id === "topRated") {
            if (topRatedByScore.length === 0) return null;
            if (viewMode === "list")
              return renderRow("topRated", "Top rated", topRatedByScore);
            return (
              <section key="topRated" className="section top-rated" aria-labelledby="row-topRated">
                <div className="section-head">
                  <h2 className="section-title" id="row-topRated">
                    Top rated
                  </h2>
                  <p className="section-note">Highest TMDB scores, movies and series</p>
                </div>
                <ol className="top-rated-list">
                  {topRatedByScore.map((item) => {
                    const title = item.title || item.name;
                    const year = (item.release_date || item.first_air_date || "").slice(0, 4);
                    return (
                      <li key={`${item.media_type}_${item.id}`}>
                        <button
                          type="button"
                          className="top-rated-item"
                          onClick={() => onSelect(item)}
                        >
                          <span className="top-rated-score">
                            {item.vote_average?.toFixed(1)}
                          </span>
                          <span className="top-rated-poster">
                            {item.poster_path && (
                              <img
                                src={imgUrl(item.poster_path, "w92")}
                                alt=""
                                width="46"
                                height="69"
                                loading="lazy"
                              />
                            )}
                          </span>
                          <span className="top-rated-text">
                            <span className="top-rated-title">{title}</span>
                            <span className="top-rated-meta">
                              {item.media_type === "tv" ? "Series" : "Movie"}
                              {year ? ` · ${year}` : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
