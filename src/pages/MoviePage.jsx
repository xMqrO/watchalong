import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  memo,
  useCallback,
  useMemo,
} from "react";
import {
  tmdbFetch,
  imgUrl,
  PLAYER_SOURCES,
  getSourceUrl,
  sourceSupportsProgress,
  sourceProgressViaFrames,
  sourceIsAsync,
  fetchAnilistData,
  cleanAnilistDescription,
  isAnimeContent,
  NON_ANIME_DEFAULT_SOURCE,
  NEEDS_INTERCEPT,
  getNextSource,
  shouldServerFirstEmbed,
  markEmbedServerFirst,
  clearEmbedServerFirst,
} from "../utils/api";
import {
  PlayIcon,
  BookmarkIcon,
  BookmarkFillIcon,
  BackIcon,
  StarIcon,
  FilmIcon,
  DownloadIcon,
  WatchedIcon,
  TrailerIcon,
  RatingShieldIcon,
  RatingLockIcon,
  SourceIcon,
} from "../components/Icons";
import DownloadModal from "../components/DownloadModal";
import TrailerModal from "../components/TrailerModal";
import MediaCard from "../components/MediaCard";
import {
  storage,
  STORAGE_KEYS,
  isElectron,
  getFailoverSource,
  setFailoverSource,
  clearFailoverSource,
} from "../utils/storage";
import { createOnVidReader } from "../utils/browserPlayer";
import {
  fetchMovieRating,
  isRestricted,
  getAgeLimitSetting,
  getRatingCountry,
} from "../utils/ageRating";
import {
  GAMEPAD_PLAYER_SCRIPT,
  GAMEPAD_EXIT_CHECK_JS,
  GAMEPAD_EXIT_RESET_JS,
  GAMEPAD_CLEANUP_JS,
} from "../utils/playerGamepadScript";
import { setPlayerGamepadActive } from "../utils/gamepadPlayerState";
import { useRedirectShield } from "../utils/useRedirectShield";

const EMBED_FALLBACK_TIMEOUT_MS = 12000;

export default function MoviePage({
  item,
  apiKey,
  playerSettings,
  onSave,
  isSaved,
  onHistory,
  progress,
  saveProgress,
  onBack,
  onSettings,
  onDownloadStarted,
  watched,
  onMarkWatched,
  onMarkUnwatched,
  downloads,
  onGoToDownloads,
  onSelect,
}) {
  const [details, setDetails] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [trailerKey, setTrailerKey] = useState(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [m3u8Url, setM3u8Url] = useState(null);
  const [interceptedSubs, setInterceptedSubs] = useState([]);
  const [playerSource, setPlayerSource] = useState(
    () => storage.get("playerSource") || NON_ANIME_DEFAULT_SOURCE,
  );

  // Accent colour + subtitle lang come from App-level state (via props),
  // so they are always fresh after Settings save without any extra storage reads.
  const playerAccentColor = playerSettings?.accentColor ?? null;
  const playerSubLang = playerSettings?.subtitleLang ?? null;
  const progressViaFrames = useMemo(
    () => sourceProgressViaFrames(playerSource),
    [playerSource],
  );
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [dubMode, setDubMode] = useState(
    () => storage.get(STORAGE_KEYS.ALLMANGA_DUB_MODE) || "sub",
  );
  const [anilistData, setAnilistData] = useState(null);
  const [menuPos, setMenuPos] = useState(null);
  const sourceRef = useRef(null);
  const playerWrapRef = useRef(null);
  const webviewRef = useRef(null);
  // Browser-build progress tracking (Electron uses webview.executeJavaScript)
  const browserReaderRef = useRef(null); // OnVid postMessage channel
  // Wall-clock fallback is anchored to the last trusted position (resume
  // point or the latest OnVid snapshot) so progress never resets to ~0 when
  // a source doesn't answer the OnVid API. It also powers auto-watched.
  const fallbackBaseSecRef = useRef(0); // last trusted position (seconds)
  const fallbackBaseAtRef = useRef(0); // epoch when fallbackBaseSec was set
  const browserResumeSeekedRef = useRef(false); // only seek to resume once
  // Always-current refs for interval callbacks, avoids stale closures without restarting the interval
  const saveProgressRef = useRef(saveProgress);
  saveProgressRef.current = saveProgress;
  const onMarkWatchedRef = useRef(onMarkWatched);
  onMarkWatchedRef.current = onMarkWatched;
  // AllManga async URL resolution
  const [resolvedPlayerUrl, setResolvedPlayerUrl] = useState(null);
  const [resolvingUrl, setResolvingUrl] = useState(false);
  const [resolveError, setResolveError] = useState(null);
  // Refs mirror the above so the resolve-effect can guard without stale closures
  const resolvingUrlRef = useRef(false);
  const resolvedPlayerUrlRef = useRef(null);
  // Embed-first flag: when a source's provider iframe fails to load we fall
  // back to that same source's server resolver (set by the iframe onError).
  const [embedFallbackActive, setEmbedFallbackActive] = useState(false);
  const embedFallbackActiveRef = useRef(false);
  // True when the source must be resolved server-side (async sources).
  const isAsync = useMemo(() => sourceIsAsync(playerSource), [playerSource]);
  // Set when a real OnVid playback read comes back (proves the embed actually
  // started streaming); used to cancel the embed → server failover timer.
  const embeddingProofRef = useRef(false);
  // True once the embed iframe fires its load event (healthy embed); also
  // cancels the failover timer.
  const embedLoadFiredRef = useRef(false);
  const [collection, setCollection] = useState(null); // { name, parts }
  // Webview loading overlay
  const [webviewLoading, setWebviewLoading] = useState(false);
  const [playerFullscreen, setPlayerFullscreen] = useState(false);

  // Derived: detect anime before any effects so effects can use it
  const isAnime = useMemo(
    () => isAnimeContent(item, details),
    [item.id, details],
  );
  const [downloaderFolder, setDownloaderFolder] = useState(
    () => storage.get("downloaderFolder") || "",
  );

  // Age rating
  const [rating, setRating] = useState({ cert: null, minAge: null });
  const ageLimitSetting = useMemo(() => getAgeLimitSetting(storage), []);
  const ratingCountry = useMemo(() => getRatingCountry(storage), []);
  const restricted = isRestricted(rating.minAge, ageLimitSetting);

  const progressKey = `movie_${item.id}`;
  const pct = progress[progressKey] || 0;
  const isWatched = !!watched?.[progressKey];
  const hasProgress = pct > 0;

  // ── Derived display values (must be declared before any callbacks that use them) ──
  const d = details || item;
  const title = d.title || d.name;
  const year = (d.release_date || "").slice(0, 4);
  const mediaName = `${title}${year ? " (" + year + ")" : ""}`;

  const { watchedSecs, totalSecs, displayPct, progressLabel } = useMemo(() => {
    const watchedSecs = storage.get("dlTime_" + progressKey) || 0;
    const totalSecs = d?.runtime ? d.runtime * 60 : 0;
    const derivedPct =
      watchedSecs > 0 && totalSecs > 0
        ? Math.floor((watchedSecs / totalSecs) * 100)
        : 0;
    const displayPct = pct > 0 ? pct : derivedPct;
    const fmt = (s) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      return h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
        : `${m}:${String(sec).padStart(2, "0")}`;
    };
    const progressLabel =
      watchedSecs > 0 && totalSecs > 0
        ? `${fmt(watchedSecs)} / ${fmt(totalSecs)}`
        : watchedSecs > 0
          ? fmt(watchedSecs)
          : displayPct > 0
            ? `${displayPct}%`
            : null;
    return { watchedSecs, totalSecs, displayPct, progressLabel };
  }, [progressKey, pct, d?.runtime]);

  // Read threshold from settings (default 20s), stable across renders
  const [watchedThreshold] = useState(
    () => storage.get("watchedThreshold") ?? 20,
  );

  // Ref to prevent double-marking
  const autoMarkedRef = useRef(false);
  // Tracks last known playback position, used to detect resolution-change resets
  const lastKnownTimeRef = useRef(0);
  // Timestamp until which we ignore reset detection (post-seekback cooldown)
  const seekBackCooldownRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    tmdbFetch(`/movie/${item.id}`, apiKey)
      .then((d) => {
        if (mounted) setDetails(d);
      })
      .catch(() => {
        if (mounted) setDetails(item);
      });
    return () => {
      mounted = false;
    };
  }, [item.id, apiKey]);

  useEffect(() => {
    let mounted = true;
    fetchMovieRating(item.id, apiKey, ratingCountry).then((r) => {
      if (mounted) setRating(r);
    });
    return () => {
      mounted = false;
    };
  }, [item.id, apiKey, ratingCountry]);

  useEffect(() => {
    let mounted = true;
    tmdbFetch(`/movie/${item.id}/videos`, apiKey)
      .then((data) => {
        if (!mounted) return;
        const videos = data.results || [];
        const trailer =
          videos.find((v) => v.type === "Trailer" && v.site === "YouTube") ||
          videos.find((v) => v.site === "YouTube");
        if (trailer) setTrailerKey(trailer.key);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [item.id, apiKey]);

  // Fetch movie collection (sequels/prequels)
  useEffect(() => {
    setCollection(null);
    if (!details?.belongs_to_collection?.id) return;
    let mounted = true;
    tmdbFetch(`/collection/${details.belongs_to_collection.id}`, apiKey)
      .then((data) => {
        if (!mounted) return;
        const parts = (data.parts || [])
          .map((p) => ({ ...p, media_type: "movie" }))
          .sort((a, b) =>
            (a.release_date || "").localeCompare(b.release_date || ""),
          );
        if (parts.length > 1) {
          setCollection({ name: data.name, parts });
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [details?.belongs_to_collection?.id, apiKey]);

  // Reset m3u8 URL, subtitle URL and source menu whenever the movie or source changes
  useEffect(() => {
    setM3u8Url(null);
    setInterceptedSubs([]);
    setShowSourceMenu(false);
    setAnilistData(null);
    resolvedPlayerUrlRef.current = null;
    setResolvedPlayerUrl(null);
    setResolveError(null);
    embedFallbackActiveRef.current = false;
    setEmbedFallbackActive(false);
    embeddingProofRef.current = false;
    embedLoadFiredRef.current = false;
    setWebviewLoading(true); // instantly blank the player on every source/item switch
  }, [item.id, playerSource, dubMode]);

  // Fetch AniList data for anime content
  useEffect(() => {
    let mounted = true;
    if (isAnime) {
      fetchAnilistData(item.title || item.name, "ANIME", item.id).then(
        (data) => {
          if (mounted && data) setAnilistData(data);
        },
      );
    }
    return () => {
      mounted = false;
    };
  }, [item.id, isAnime]);

  // Resolve AllManga movie URL via main-process IPC
  useEffect(() => {
    if (!playing) return;
    const epKey = `movie_${item.id}_${dubMode}`;

    // Embed-first sources fall back to the same source's server resolver when
    // the provider iframe is already known to be dead on this title, or when
    // the deployed vercel.app origin gets the embed WAF-blocked by Referer.
    const serverMode = isAsync || embedFallbackActive;
    if (!serverMode && shouldServerFirstEmbed(playerSource, epKey)) {
      embedFallbackActiveRef.current = true;
      setEmbedFallbackActive(true);
      return;
    }

    // Auto-failover: if a previous attempt taught us AllManga doesn't have
    // this title, skip straight to the cached fallback source.
    if (serverMode) {
      const cached = getFailoverSource(epKey);
      if (cached && cached !== playerSource) {
        setM3u8Url(null);
        setInterceptedSubs([]);
        resolvedPlayerUrlRef.current = null;
        setResolvedPlayerUrl(null);
        resolvingUrlRef.current = false;
        setResolvingUrl(false);
        setResolveError(null);
        setPlayerSource(cached);
        return;
      }
    }

    if (!serverMode) return;
    // Use refs as guards
    if (resolvedPlayerUrlRef.current || resolvingUrlRef.current) return;
    resolvingUrlRef.current = true;
    setResolvingUrl(true);
    setResolveError(null);
    const startTime = storage.get("dlTime_" + progressKey) || 0;
    let mounted = true;
    window.electron
      .resolveAllManga({
        id: item.id,
        playerSource,
        title,
        seasonNumber: 1,
        episodeNumber: 1,
        isMovie: true,
        translationType: dubMode,
        year,
        imdbId: d.imdb_id || "",
      })
      .then((res) => {
        if (!mounted) return;
        if (res?.ok && res.url) {
          clearFailoverSource(epKey);
          if (res.isDirectMp4 !== undefined) {
            window.electron
              .setPlayerVideo({
                url: res.url,
                referer: res.referer || "",
                startTime,
              })
              .then((r) => {
                if (!mounted) return;
                resolvedPlayerUrlRef.current = r.playerUrl;
                setResolvedPlayerUrl(r.playerUrl);
                setM3u8Url(res.url);
              })
              .catch(() => {
                if (mounted) setResolveError("Failed to start local player");
              });
          } else {
            resolvedPlayerUrlRef.current = res.url;
            setResolvedPlayerUrl(res.url);
          }
        } else {
          // AllManga doesn't have this title → switch to the next source
          // automatically and remember the choice for next time.
          const next = getNextSource(playerSource);
          if (next) {
            setFailoverSource(epKey, next);
            setM3u8Url(null);
            setInterceptedSubs([]);
            resolvedPlayerUrlRef.current = null;
            setResolvedPlayerUrl(null);
            setResolveError(null);
            setPlayerSource(next);
          } else {
            setResolveError(res?.error || "Movie not found on this source");
          }
        }
      })
      .catch((e) => {
        if (mounted) setResolveError(e.message || "Error");
      })
      .finally(() => {
        if (mounted) {
          resolvingUrlRef.current = false;
          setResolvingUrl(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [playing, playerSource, dubMode, embedFallbackActive]);

  // Embed → server failover, load-watchdog style: a healthy embed always
  // fires the iframe load event quickly (ads, WAF bodies and all). Only when
  // BOTH the load event and the error event stay silent (DNS hang, connection
  // drop, relay dead) do we flip to the same source's server resolver so
  // playback always starts.
  useEffect(() => {
    if (!playing || isAsync || embedFallbackActiveRef.current) return;
    if (resolvedPlayerUrlRef.current) return;
    const epKey = `movie_${item.id}_${dubMode}`;
    if (shouldServerFirstEmbed(playerSource, epKey)) return;
    const startedAt = Date.now();
    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (embedLoadFiredRef.current || embeddingProofRef.current) {
        done = true;
        clearInterval(interval);
        return;
      }
      if (Date.now() - startedAt > EMBED_FALLBACK_TIMEOUT_MS && !resolvedPlayerUrlRef.current) {
        done = true;
        clearInterval(interval);
        embedFallbackActiveRef.current = true;
        setEmbedFallbackActive(true);
      }
    }, 1000);
    return () => {
      done = true;
      clearInterval(interval);
    };
  }, [playing, playerSource, dubMode, item.id]);

  useEffect(() => {
    if (!window.electron) return;
    const handler = window.electron.onM3u8Found((url) => {
      setM3u8Url((prev) => (prev !== url ? url : prev));
    });
    return () => window.electron.offM3u8Found(handler);
  }, []);

  // Close source dropdown on scroll or click-outside
  useEffect(() => {
    if (!showSourceMenu) return;
    const close = () => setShowSourceMenu(false);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    const handleClick = (e) => {
      if (
        sourceRef.current?.contains(e.target) ||
        e.target.closest(".source-dropdown")
      )
        return;
      close();
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      document.removeEventListener("mousedown", handleClick);
    };
  }, [showSourceMenu]);

  useEffect(() => {
    if (!window.electron) return;
    const handler = window.electron.onSubtitleFound(({ url, lang }) => {
      // Only keep VTT, deduplicate per language (latest wins)
      if (!url || !url.toLowerCase().includes(".vtt")) return;
      setInterceptedSubs((prev) => {
        const filtered = prev.filter((s) => s.lang !== lang);
        return [...filtered, { url, lang: lang || "unknown" }];
      });
    });
    return () => window.electron.offSubtitleFound(handler);
  }, []);

  // Reset auto-mark guard when a new movie loads or watched state resets
  useEffect(() => {
    autoMarkedRef.current = false;
    lastKnownTimeRef.current = 0;
    seekBackCooldownRef.current = 0;
  }, [item.id, isWatched]);

  // Show loader instantly when play starts
  useEffect(() => {
    if (playing) setWebviewLoading(true);
  }, [playing]);

  // ── Webview memory cleanup ────────────────────────────────────────────────
  // useLayoutEffect fires synchronously BEFORE React mutates the DOM, so the
  // webview is still attached when we navigate it to about:blank.
  // This lets Chromium unload.
  useLayoutEffect(() => {
    if (playing) return;
    const wv = webviewRef.current;
    if (wv) {
      try {
        wv.src = "about:blank";
      } catch {}
    }
  }, [playing]);

  // On unmount: signal main process to destroy the player WebContents and flush session cache.
  useEffect(() => {
    return () => {
      window.electron?.playerStopped?.();
    };
  }, []);

  // ── Controller support: play/pause, seek, volume, fullscreen ─────────────
  // Only active while the "controller support" setting is on.
  const [gamepadEnabled, setGamepadEnabled] = useState(
    () => storage.get(STORAGE_KEYS.GAMEPAD_ENABLED) !== false, // default on
  );
  useEffect(() => {
    const handler = () =>
      setGamepadEnabled(storage.get(STORAGE_KEYS.GAMEPAD_ENABLED) !== false);
    window.addEventListener("watchalong:gamepad-settings-changed", handler);
    return () =>
      window.removeEventListener(
        "watchalong:gamepad-settings-changed",
        handler,
      );
  }, []);

  useEffect(() => {
    setPlayerGamepadActive(gamepadEnabled && playing);
    return () => setPlayerGamepadActive(false);
  }, [playing, gamepadEnabled]);

  useEffect(() => {
    if (!isElectron) return;
    const wv = webviewRef.current;
    if (!wv || !playing || !gamepadEnabled) return;

    const inject = () => {
      wv.executeJavaScript(GAMEPAD_PLAYER_SCRIPT).catch(() => {});
    };
    wv.addEventListener("dom-ready", inject);
    try {
      inject();
    } catch {}

    // Poll for a B-button "leave the player" request from the guest script.
    const exitPoll = setInterval(async () => {
      try {
        const requested = await wv.executeJavaScript(GAMEPAD_EXIT_CHECK_JS);
        if (requested) {
          wv.executeJavaScript(GAMEPAD_EXIT_RESET_JS).catch(() => {});
          setPlaying(false);
        }
      } catch {}
    }, 250);

    return () => {
      wv.removeEventListener("dom-ready", inject);
      clearInterval(exitPoll);
      try {
        wv.executeJavaScript(GAMEPAD_CLEANUP_JS);
      } catch {}
    };
  }, [playing, gamepadEnabled]);

  // Attach player load events so we know when the new source has painted
  // (iframes fire the DOM `load` event; see onLoad/onError on the <iframe>).
  // Kept as a noop in the browser build.
  useEffect(() => {
    if (isElectron) {
      if (!playing) return;
      const wv = webviewRef.current;
      if (!wv) return;
      const done = () => setWebviewLoading(false);
      wv.addEventListener("did-finish-load", done);
      wv.addEventListener("did-fail-load", done);
      return () => {
        wv.removeEventListener("did-finish-load", done);
        wv.removeEventListener("did-fail-load", done);
      };
    }
  }, [playing, playerSource, item.id]);

  // ── Browser build: OnVid postMessage channel + resume saved progress ───────
  // The website's player iframe is cross-origin, so we track progress through
  // OnVid's message API (see browserPlayer.js). On attach, seek back to the
  // last saved position so the movie resumes where the user left off.
  useEffect(() => {
    if (isElectron || !playing || !progressKey) return;
    const iframe = webviewRef.current;
    const reader = createOnVidReader(iframe);
    browserReaderRef.current = reader;
    browserResumeSeekedRef.current = false;
    // Anchor the wall-clock fallback to the saved position so resuming a
    // movie never restarts progress from 0 (fixes non-OnVid sources).
    const savedForBase = Number(storage.get("dlTime_" + progressKey) || 0);
    fallbackBaseSecRef.current = savedForBase;
    fallbackBaseAtRef.current = Date.now();

    let resumeTimer = null;
    if (reader) {
      const savedSeconds = savedForBase;
      if (savedSeconds >= 25) {
        resumeTimer = setTimeout(() => {
          let attempts = 0;
          const attemptSeek = () => {
            if (browserResumeSeekedRef.current) return;
            const st = reader.read();
            if (st && st.duration > 0) {
              reader.seek(savedSeconds);
              browserResumeSeekedRef.current = true;
              return;
            }
            if (attempts++ >= 30) {
              browserResumeSeekedRef.current = true;
              return;
            }
            reader.poll();
            setTimeout(attemptSeek, 1000);
          };
          reader.poll();
          attemptSeek();
        }, 3500);
      }
    }

    return () => {
      clearTimeout(resumeTimer);
      reader?.detach();
      browserReaderRef.current = null;
    };
  }, [playing, playerSource, item.id, progressKey, isElectron]);

  // ── Auto-track progress + auto-watched every 5s ──────────────────────────
  useEffect(() => {
    if (!playing || !sourceSupportsProgress(playerSource)) return;
    let interval = null;
    const timer = setTimeout(() => {
      interval = setInterval(async () => {
        try {
          // ── Browser build: track progress via OnVid postMessage channel ──
          // The website's player iframe is cross-origin, so we use OnVid's
          // message API. When the source doesn't answer, fall back to a
          // wall-clock estimate anchored to the last trusted position so
          // progress keeps moving (and auto-watched still fires) for EVERY
          // source — not just OnVid-compatible ones.
          if (!isElectron || !window.electron?.queryVideoProgress) {
            const reader = browserReaderRef.current;
            const exact = reader?.read() || null;
            if (exact && exact.duration > 0 && exact.currentTime != null) {
              embeddingProofRef.current = true;
              const ct = exact.currentTime;
              lastKnownTimeRef.current = ct;
              // Re-anchor the wall-clock estimate to the real read
              fallbackBaseSecRef.current = ct;
              fallbackBaseAtRef.current = Date.now();
              const p = Math.floor((ct / exact.duration) * 100);
              saveProgressRef.current(progressKey, Math.min(p, 100));
              storage.set("dlTime_" + progressKey, Math.floor(ct));
              const remaining = exact.duration - ct;
              if (
                !autoMarkedRef.current &&
                remaining >= 0 &&
                remaining <= watchedThreshold
              ) {
                autoMarkedRef.current = true;
                onMarkWatchedRef.current?.(progressKey);
              }
            } else if (!exact) {
              // Fallback: estimate position = last trusted position + wall
              // time since it was observed. Never starts from 0 on resume.
              if (!fallbackBaseAtRef.current) {
                fallbackBaseSecRef.current = 0;
                fallbackBaseAtRef.current = Date.now();
              }
              const estimated =
                fallbackBaseSecRef.current +
                Math.max(0, (Date.now() - fallbackBaseAtRef.current) / 1000);
              const totalSecs = d?.runtime ? d.runtime * 60 : 0;
              lastKnownTimeRef.current = estimated;
              if (totalSecs > 0) {
                const p = Math.floor((estimated / totalSecs) * 100);
                saveProgressRef.current(progressKey, Math.min(100, p));
                const remaining = totalSecs - estimated;
                if (
                  !autoMarkedRef.current &&
                  remaining >= 0 &&
                  remaining <= watchedThreshold
                ) {
                  autoMarkedRef.current = true;
                  onMarkWatchedRef.current?.(progressKey);
                }
              }
              storage.set("dlTime_" + progressKey, Math.floor(estimated));
            }
            reader?.poll();
            return;
          }

          const wv = webviewRef.current;
          if (!wv) return;
          let result;
          if (progressViaFrames && window.electron?.queryVideoProgress) {
            result = await window.electron.queryVideoProgress(
              wv.getWebContentsId(),
            );
          } else {
            result = await wv.executeJavaScript(`
              (() => {
                const v = document.querySelector('video')
                if (!v || !v.duration || v.duration === Infinity || v.paused) return null
                // Re-attach seek tracker if video element was recreated (e.g. quality change)
                if (!v._seekTracked) {
                  v._seekTracked = true
                  v.addEventListener('seeked', () => {
                    v._lastUserSeek = Date.now()
                    v._lastUserSeekTo = v.currentTime
                  })
                }
                return {
                  currentTime: v.currentTime,
                  duration: v.duration,
                  recentUserSeek: v._lastUserSeek ? (Date.now() - v._lastUserSeek < 6000) : false,
                  lastUserSeekTo: v._lastUserSeekTo ?? null,
                }
              })()
            `);
          }
          if (result && result.duration > 0) {
            const ct = result.currentTime;

            // ── Resolution-change reset detection ──────────────────────────
            // Videasy resets to 0 on quality change. We only seek back if:
            // - ct is near zero (≤5s)
            // - we were well into the video (>30s)
            // - the user did NOT manually seek in the last 6s
            const now = Date.now();
            if (
              lastKnownTimeRef.current > 30 &&
              ct <= 5 &&
              !result.recentUserSeek
            ) {
              if (now > seekBackCooldownRef.current) {
                // First reset: seek back and start cooldown
                const seekTo = lastKnownTimeRef.current;
                seekBackCooldownRef.current = now + 8000;
                try {
                  await wv.executeJavaScript(`
                    (() => {
                      const v = document.querySelector('video')
                      if (v) v.currentTime = ${seekTo}
                    })()
                  `);
                } catch {}
              }
              // In both cases (first reset or cooldown): skip progress save with wrong position
              return;
            }

            // If user seeked, update ref to their chosen position immediately
            if (result.recentUserSeek && result.lastUserSeekTo !== null) {
              lastKnownTimeRef.current = result.lastUserSeekTo;
              fallbackBaseSecRef.current = result.lastUserSeekTo;
              fallbackBaseAtRef.current = Date.now();
            } else {
              lastKnownTimeRef.current = ct;
            }
            const p = Math.floor((ct / result.duration) * 100);
            saveProgressRef.current(progressKey, Math.min(p, 100));
            // Also persist actual seconds so DownloadsPage can show resume position
            storage.set("dlTime_" + progressKey, Math.floor(ct));

            // Auto-mark watched when remaining time ≤ threshold
            const remaining = result.duration - ct;
            if (
              !autoMarkedRef.current &&
              remaining <= watchedThreshold &&
              remaining >= 0
            ) {
              autoMarkedRef.current = true;
              onMarkWatchedRef.current?.(progressKey);
            }
          }
        } catch {}
      }, 5000);
    }, 3000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      // Flush the last known position immediately on teardown (source
      // switch, pause/stop, navigation) instead of waiting for the next
      // 5s tick — the interval dies with the effect.
      const key = progressKey;
      const last = lastKnownTimeRef.current;
      if (last > 0) {
        const total = d?.runtime ? d.runtime * 60 : 0;
        if (total > 0) {
          saveProgressRef.current(
            key,
            Math.min(100, Math.floor((last / total) * 100)),
          );
        }
        storage.set("dlTime_" + key, Math.floor(last));
      }
    };
  }, [playing, progressKey, watchedThreshold, playerSource, progressViaFrames]);

  const handlePlay = useCallback(() => {
    setM3u8Url(null);
    setInterceptedSubs([]);
    setPlaying(true);
    onHistory({ ...d, media_type: "movie" });
  }, [d, onHistory]);

  // Intercept fullscreen requests from embedded players (vidsrc / 2embed use
  // the native Fullscreen API which would otherwise fullscreen the entire app).
  // Videasy and AllManga handle fullscreen internally via CSS, skip those.
  useEffect(() => {
    if (!playing) return;
    if (!NEEDS_INTERCEPT.includes(playerSource)) return;
    const enterH = window.electron?.onWebviewEnterFullscreen?.(() => {
      setPlayerFullscreen(true);
      document.documentElement.setAttribute("data-player-fullscreen", "1");
    });
    const leaveH = window.electron?.onWebviewLeaveFullscreen?.(() => {
      setPlayerFullscreen(false);
      document.documentElement.removeAttribute("data-player-fullscreen");
      if (document.fullscreenElement) document.exitFullscreen?.();
    });
    return () => {
      if (enterH) window.electron?.offWebviewEnterFullscreen?.(enterH);
      if (leaveH) window.electron?.offWebviewLeaveFullscreen?.(leaveH);
      document.documentElement.removeAttribute("data-player-fullscreen");
    };
  }, [playing, playerSource]);

  // ── CSS overlay fullscreen (web embeds) ────────────────────────────────────
  // Kept as an overlay fallback on desktop: Chromium attaches a native Space
  // toggle (fired on keyup) to a media element that IS the fullscreen element;
  // that double-toggles OnVid's own keydown handler ("pauses while Space is
  // held"). The onWebviewEnterFullscreen listener above routes to this overlay
  // instead of native fullscreen. No user-facing button for it.
  useEffect(() => {
    if (!playing) {
      setPlayerFullscreen(false);
      document.documentElement.removeAttribute("data-player-fullscreen");
    }
  }, [playing]);

  const handleSetDownloaderFolder = useCallback((folder) => {
    setDownloaderFolder(folder);
    storage.set("downloaderFolder", folder);
  }, []);

  // Prefer AniList metadata for anime when available
  const displayOverview =
    isAnime && anilistData?.description
      ? cleanAnilistDescription(anilistData.description)
      : d.overview;
  const displayScore =
    isAnime && anilistData?.averageScore
      ? (anilistData.averageScore / 10).toFixed(1)
      : d.vote_average > 0
        ? d.vote_average.toFixed(1)
        : null;
  const displayGenres =
    isAnime && anilistData?.genres?.length
      ? anilistData.genres.map((g, i) => ({ id: i, name: g }))
      : d.genres || [];

  // Unreleased detection
  const isUnreleased = useMemo(() => {
    if (!d.release_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(d.release_date) > today;
  }, [d.release_date]);

  // Check if this movie is already downloaded or currently downloading
  const movieDownload = (downloads || []).find(
    (dl) =>
      dl.mediaType === "movie" &&
      (dl.tmdbId === item.id || dl.mediaId === item.id) &&
      (dl.status === "completed" ||
        dl.status === "local" ||
        dl.status === "downloading"),
  );

  // ── Redirect & Popup Shield ───────────────────────────────────────────────
  const shield = useRedirectShield();
  const realPlayerSrc = isAsync || embedFallbackActive
    ? resolvedPlayerUrl || "about:blank"
    : getSourceUrl(
        playerSource,
        "movie",
        item.id,
        null,
        null,
        {},
        playerAccentColor,
        playerSubLang,
      );
  useEffect(() => {
    if (shield.blocked) return;
    shield.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realPlayerSrc]);

  return (
    <div className="fade-in">
      <div className="detail-hero">
        <div
          className="detail-bg"
          style={{
            backgroundImage: `url(${imgUrl(d.backdrop_path, "w1280")})`,
          }}
        />
        <div className="detail-gradient" />
        <div className="detail-content">
          <div className="detail-poster" style={{ position: "relative" }}>
            {d.poster_path ? (
              <img src={imgUrl(d.poster_path)} alt={title} loading="lazy" />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text3)",
                }}
              >
                <FilmIcon />
              </div>
            )}
            {isWatched && (
              <div className="detail-watched-badge">
                <WatchedIcon size={36} />
              </div>
            )}
          </div>
          <div className="detail-info">
            <div className="detail-type">Movie</div>
            <div className="detail-title">{title}</div>
            <div className="genres">
              {displayGenres.map((g) => (
                <span key={g.id} className="genre-tag">
                  {g.name}
                </span>
              ))}
            </div>
            <div className="detail-meta">
              {displayScore && (
                <span className="detail-rating">
                  <StarIcon /> {displayScore}
                </span>
              )}
              {year && <span>{year}</span>}
              {d.runtime && <span>{d.runtime} min</span>}
              {d.original_language && (
                <span>{d.original_language?.toUpperCase()}</span>
              )}
            </div>
            {rating.cert && (
              <div
                className={`age-rating-pill${restricted ? " age-rating-pill--restricted" : ""}`}
              >
                {restricted ? (
                  <RatingLockIcon size={13} />
                ) : (
                  <RatingShieldIcon size={13} />
                )}
                <span className="age-rating-pill-cert">{rating.cert}</span>
                {restricted && (
                  <span className="age-rating-pill-label">
                    Inappropriate for your age setting
                  </span>
                )}
              </div>
            )}
            <p className="detail-overview">{displayOverview}</p>
            {!isWatched && displayPct > 0 && (
              <div className="progress-bar-row" style={{ marginBottom: 12 }}>
                <div className="progress-bar-outer">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${Math.min(displayPct, 100)}%` }}
                  />
                </div>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>
                  {progressLabel}
                </span>
              </div>
            )}
            <div className="detail-actions">
              {isUnreleased ? (
                <button
                  className="btn btn-primary btn-restricted"
                  disabled
                  title="This movie has not been released yet"
                >
                  🔒 Unreleased
                </button>
              ) : restricted ? (
                <button
                  className="btn btn-primary btn-restricted"
                  disabled
                  title="Inappropriate for your age rating setting"
                >
                  🔒 Restricted
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handlePlay}>
                  <PlayIcon /> {playing ? "Restart" : "Play"}
                </button>
              )}
              {trailerKey &&
                (restricted ? (
                  <button
                    className="btn btn-secondary btn-restricted"
                    disabled
                    title="Inappropriate for your age rating setting"
                  >
                    🔒 Trailer
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowTrailer(true)}
                  >
                    <TrailerIcon /> Trailer
                  </button>
                ))}
              <button className="btn btn-secondary" onClick={onSave}>
                {isSaved ? <BookmarkFillIcon /> : <BookmarkIcon />}
                {isSaved ? "Saved" : "Save"}
              </button>
              {!isElectron && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowDownload(true)}
                  title="Download this movie"
                >
                  <DownloadIcon /> Download
                </button>
              )}
              {!isUnreleased &&
                (isWatched ? (
                  <button
                    className="btn btn-ghost watched-btn"
                    onClick={() => onMarkUnwatched?.(progressKey)}
                  >
                    <WatchedIcon size={16} /> Watched
                  </button>
                ) : (
                  <>
                    <button
                      className="btn btn-ghost"
                      onClick={() => onMarkWatched?.(progressKey)}
                    >
                      ✓ Mark Watched
                    </button>
                    {hasProgress && (
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 13 }}
                        onClick={() => {
                          saveProgress(progressKey, 0);
                          storage.set("dlTime_" + progressKey, null);
                        }}
                      >
                        ⊘ Not Started
                      </button>
                    )}
                  </>
                ))}
              <button className="btn btn-ghost" onClick={onBack}>
                <BackIcon /> Back
              </button>
            </div>
          </div>
        </div>
      </div>

      {playing && !restricted && !isUnreleased && (
        <div className="section">
          <div
            className={`player-wrap${playerFullscreen ? " player-wrap--fullscreen" : ""}`}
            ref={playerWrapRef}
          >
            {/* Universal source-loading overlay, shown instantly on every source/item switch */}
            {webviewLoading && !resolveError && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.92)",
                  gap: 14,
                  borderRadius: "inherit",
                }}
              >
                <div className="spinner" />
                <span style={{ fontSize: 14, color: "var(--text2)" }}>
                  {resolvingUrl
                    ? "Looking up movie…"
                    : `Loading ${PLAYER_SOURCES.find((s) => s.id === playerSource)?.label ?? "source"}…`}
                </span>
              </div>
            )}
            {/* AllManga: error if lookup failed */}
            {(isAsync || embedFallbackActive) &&
              resolveError &&
              !resolvingUrl && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.85)",
                  gap: 10,
                  borderRadius: "inherit",
                }}
              >
                <span style={{ fontSize: 28 }}>⚠️</span>
                <span style={{ fontSize: 14, color: "var(--text2)" }}>
Movie not found on this source
                </span>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>
                  {resolveError}
                </span>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>
                  Try a different source, or switch sub/dub.
                </span>
              </div>
            )}
            {/* Redirect shield: player churning through ad redirects */}
            {shield.blocked && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 21,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.92)",
                  gap: 14,
                  borderRadius: "inherit",
                  textAlign: "center",
                  padding: 24,
                }}
              >
                <span style={{ fontSize: 30 }}>🛡️</span>
                <span
                  style={{
                    fontSize: 15,
                    color: "var(--text1)",
                    fontWeight: 600,
                  }}
                >
                  Redirect blocked
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text3)",
                    maxWidth: 300,
                    lineHeight: 1.6,
                  }}
                >
                  The player kept redirecting too many times. If this repeats,
                  switch to a different source via the source menu.
                </span>
                <button
                  className="player-overlay-btn"
                  onClick={() => shield.reset()}
                  style={{ marginTop: 4 }}
                >
                  Resume player
                </button>
              </div>
            )}
            <iframe
              ref={webviewRef}
              src={shield.blocked ? "about:blank" : realPlayerSrc}
              title={`${title} player`}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="no-referrer"
              onLoad={() => {
                setWebviewLoading(false);
                embedLoadFiredRef.current = true;
                shield.onPlayerLoad();
                if (!isAsync) {
                  clearEmbedServerFirst(
                    playerSource,
                    `movie_${item.id}_${dubMode}`,
                  );
                }
              }}
              onError={() => {
                setWebviewLoading(false);
                if (!isAsync) {
                  markEmbedServerFirst(playerSource, `movie_${item.id}_${dubMode}`);
                  embedFallbackActiveRef.current = true;
                  setEmbedFallbackActive(true);
                }
              }}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                border: "none",
                background: "#000",
                visibility:
                  webviewLoading ||
                  ((isAsync || embedFallbackActive) &&
                    !resolvedPlayerUrl)
                    ? "hidden"
                    : "visible",
              }}
            />
            {/* Left-side overlay button group, flex row, no fixed px offsets */}
            <div className="player-overlay-group">
              <button
                ref={sourceRef}
                className="player-overlay-btn"
                onClick={() => {
                  const rect = sourceRef.current?.getBoundingClientRect();
                  if (rect)
                    setMenuPos({ top: rect.bottom + 6, left: rect.left });
                  setShowSourceMenu((v) => !v);
                }}
                title="Change source"
              >
                <SourceIcon />
                {PLAYER_SOURCES.find((s) => s.id === playerSource)?.label ??
                  "Source"}
              </button>
              {/* Sub/Dub toggle, only for async sources */}
              {isAsync && (
                <button
                  className="player-overlay-btn"
                  onClick={() => {
                    const next = dubMode === "sub" ? "dub" : "sub";
                    setDubMode(next);
                    storage.set(STORAGE_KEYS.ALLMANGA_DUB_MODE, next);
                    setM3u8Url(null);
                    setInterceptedSubs([]);
                    resolvedPlayerUrlRef.current = null;
                    setResolvedPlayerUrl(null);
                    resolvingUrlRef.current = false;
                    setResolvingUrl(false);
                    setResolveError(null);
                  }}
                  title="Toggle Sub/Dub"
                >
                  {dubMode === "sub" ? "SUB" : "DUB"}
                </button>
              )}
            </div>
            {showSourceMenu && menuPos && (
              <div
                className="source-dropdown source-dropdown--fixed"
                style={{ top: menuPos.top, left: menuPos.left }}
                onClick={(e) => e.stopPropagation()}
              >
                {PLAYER_SOURCES.map((src) => (
                  <button
                    key={src.id}
                    className={
                      "source-dropdown__item" +
                      (playerSource === src.id
                        ? " source-dropdown__item--active"
                        : "")
                    }
                    onClick={() => {
                      setShowSourceMenu(false);
                      if (src.id === playerSource) return;
                      // Manual selection wins over auto-failover
                      clearFailoverSource(`movie_${item.id}_${dubMode}`);
                      clearEmbedServerFirst(src.id, `movie_${item.id}_${dubMode}`);
                      setPlayerSource(src.id);
                      storage.set(STORAGE_KEYS.PLAYER_SOURCE, src.id);
                      setM3u8Url(null);
                      setInterceptedSubs([]);
                      resolvedPlayerUrlRef.current = null;
                      setResolvedPlayerUrl(null);
                      resolvingUrlRef.current = false;
                      setResolvingUrl(false);
                      setResolveError(null);
                    }}
                  >
                    <span>{src.label}</span>
                    {src.tag && (
                      <span className="source-dropdown__tag">{src.tag}</span>
                    )}
                    {src.note && (
                      <span className="source-dropdown__note">{src.note}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <button
              className="player-overlay-btn"
              onClick={() =>
                movieDownload
                  ? onGoToDownloads?.(movieDownload.id)
                  : (setShowSourceMenu(false), setShowDownload(true))
              }
              title={
                movieDownload
                  ? movieDownload.status === "downloading"
                    ? "Downloading… - view in Downloads"
                    : "Already downloaded - view in Downloads"
                  : "Download"
              }
            >
              {movieDownload ? (
                <span
                  className="player-downloaded-icon"
                  style={{
                    color:
                      movieDownload.status === "downloading"
                        ? "var(--red)"
                        : "#4caf50",
                  }}
                >
                  {movieDownload.status === "downloading" ? "↓" : "✓"}
                </span>
              ) : (
                <DownloadIcon />
              )}
              {!movieDownload && m3u8Url && (
                <span className="player-overlay-dot" />
              )}
              {!sourceSupportsProgress(playerSource) && (
                <span
                  className="player-no-progress-hint"
                  title="No automatic progress tracking for this source"
                >
                  ⚠ no tracking
                </span>
              )}
            </button>
          </div>

          {displayPct > 0 && (
            <div className="progress-bar-row">
              <div className="progress-bar-outer">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${Math.min(displayPct, 100)}%` }}
                />
              </div>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>
                {progressLabel}
              </span>
            </div>
          )}
          <div className="progress-mark-row">
            <span
              style={{ fontSize: 12, color: "var(--text3)", marginRight: 4 }}
            >
              Mark progress:
            </span>
            {[25, 50, 75, 100].map((p) => (
              <button
                key={p}
                className="btn btn-ghost"
                style={{ padding: "5px 14px", fontSize: 12 }}
                onClick={() => saveProgress(progressKey, p)}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>
      )}

      {collection && onSelect && (
        <div className="section">
          <div className="section-title">{collection.name}</div>
          <div className="scroll-row">
            {collection.parts.map((part) => {
              const pk = `movie_${part.id}`;
              const isCurrent = part.id === item.id;
              return (
                <CollectionCard
                  key={part.id}
                  part={part}
                  pk={pk}
                  isCurrent={isCurrent}
                  onSelect={onSelect}
                  progress={progress[pk] || 0}
                  watched={watched}
                  onMarkWatched={onMarkWatched}
                  onMarkUnwatched={onMarkUnwatched}
                />
              );
            })}
          </div>
        </div>
      )}

      {showTrailer && trailerKey && (
        <TrailerModal
          trailerKey={trailerKey}
          title={title}
          onClose={() => setShowTrailer(false)}
        />
      )}

      {showDownload && (
        <DownloadModal
          onClose={() => setShowDownload(false)}
          m3u8Url={m3u8Url}
          streamUrl={
            isAsync || embedFallbackActive
              ? resolvedPlayerUrl
              : m3u8Url
          }
          subtitles={interceptedSubs}
          mediaName={mediaName}
          downloaderFolder={downloaderFolder}
          setDownloaderFolder={handleSetDownloaderFolder}
          onOpenSettings={onSettings}
          onDownloadStarted={onDownloadStarted}
          mediaId={item.id}
          mediaType="movie"
          posterPath={d.poster_path}
          tmdbId={item.id}
        />
      )}
    </div>
  );
}

// ── CollectionCard ─────────────────────────────────────────────────────────
// Isolated memo'd wrapper so the onClick for each collection part is stable
// and doesn't cause MediaCard to re-render on every progress tick.
const CollectionCard = memo(function CollectionCard({
  part,
  isCurrent,
  onSelect,
  progress,
  watched,
  onMarkWatched,
  onMarkUnwatched,
}) {
  const handleClick = useCallback(() => onSelect(part), [onSelect, part]);
  return (
    <div
      style={{
        opacity: isCurrent ? 0.5 : 1,
        pointerEvents: isCurrent ? "none" : "auto",
      }}
    >
      <MediaCard
        item={part}
        onClick={handleClick}
        progress={progress}
        watched={watched}
        onMarkWatched={onMarkWatched}
        onMarkUnwatched={onMarkUnwatched}
      />
    </div>
  );
});
