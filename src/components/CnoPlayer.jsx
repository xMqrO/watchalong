import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MediaPlayer, MediaProvider, Poster, SeekButton, isHLSProvider, useMediaState } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import "./cno/cno-player.css";
import { storage } from "../utils/storage";
import {
  CnoUiContext,
  CcButton,
  MomentButton,
  SettingsButton,
  CnoMenuLayer,
  SubtitleOverlay,
  CnoToast,
  PICTURE_MODES,
  DEFAULT_SUB_STYLE,
} from "./cno/CnoMenus";
import { fetchSubtitleList, groupByLanguage, loadCues, activeCueText, formatTime } from "./cno/subtitles";

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;

const HLS_CONFIG = {
  maxBufferLength: 60,
  maxMaxBufferLength: 120,
  enableWorker: true,
  fragLoadingMaxRetry: MAX_RETRIES,
  fragLoadingRetryDelay: BASE_BACKOFF_MS,
  fragLoadingMaxRetryTimeout: BASE_BACKOFF_MS * Math.pow(2, MAX_RETRIES),
  manifestLoadingMaxRetry: MAX_RETRIES,
  manifestLoadingRetryDelay: BASE_BACKOFF_MS,
  levelLoadingMaxRetry: MAX_RETRIES,
};

const SUB_PREFS_KEY = "cnoSubPrefs";
const SETTINGS_KEY = "cnoSettings";
const DEFAULT_SETTINGS = { crop: false, picture: "Standard", keyboardAnims: true, highContrast: false, boost: 1 };

// Reuse the default layout's seek icons; @vidstack/react/icons needs the
// separate "media-icons" package, which isn't installed.
const SeekBackward10Icon = defaultLayoutIcons.SeekButton.Backward;
const SeekForward10Icon = defaultLayoutIcons.SeekButton.Forward;

function Seek10({ forward }) {
  return (
    <SeekButton className="vds-button" seconds={forward ? 10 : -10} aria-label={forward ? "Forward 10 seconds" : "Back 10 seconds"}>
      {forward ? <SeekForward10Icon className="vds-icon" /> : <SeekBackward10Icon className="vds-icon" />}
    </SeekButton>
  );
}

// "Ends 6:08 AM" — wall-clock time the video will finish at the current speed.
function EndsAt() {
  const currentTime = useMediaState("currentTime");
  const duration = useMediaState("duration");
  const rate = useMediaState("playbackRate") || 1;
  if (!(duration > 0)) return null;
  const end = new Date(Date.now() + ((duration - currentTime) / rate) * 1000);
  const label = end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <span style={{ fontSize: 14, opacity: 0.7, marginLeft: 12, whiteSpace: "nowrap" }}>Ends {label}</span>
  );
}

const LAYOUT_SLOTS = {
  beforePlayButton: <Seek10 />,
  afterPlayButton: <Seek10 forward />,
  beforeChapterTitle: <EndsAt />,
  captionButton: <CcButton />,
  beforeSettingsMenu: <MomentButton />,
  settingsMenu: <SettingsButton />,
};

export default function CnoPlayer({
  type,
  id,
  season,
  episode,
  progressKey,
  imdbId,
  tmdbId,
  title,
  poster,
  onTimeUpdate,
  onLoaded,
  onDownload,
}) {
  const playerRef = useRef(null);
  const [status, setStatus] = useState("resolving");
  const [errorMsg, setErrorMsg] = useState(null);
  const [playUrl, setPlayUrl] = useState(null);
  const startAtRef = useRef(0);
  const seekedRef = useRef(false);
  const retriesRef = useRef(0);
  // Pages pass inline callbacks; keep the latest without re-running effects.
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onLoadedRef = useRef(onLoaded);
  onTimeUpdateRef.current = onTimeUpdate;
  onLoadedRef.current = onLoaded;

  // ── Menus, toast ──
  const [openMenu, setOpenMenu] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // ── Subtitles ──
  const savedSubPrefs = storage.get(SUB_PREFS_KEY) || {};
  const [subList, setSubList] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsError, setSubsError] = useState(null);
  const [primaryLang, setPrimaryLangState] = useState(savedSubPrefs.lang || null);
  const [primaryUrl, setPrimaryUrl] = useState(null);
  const [secondaryLang, setSecondaryLangState] = useState(savedSubPrefs.secondLang || null);
  const [subStyle, setSubStyleState] = useState({ ...DEFAULT_SUB_STYLE, ...(savedSubPrefs.style || {}) });
  const [offset, setOffset] = useState(0);
  const [primaryCues, setPrimaryCues] = useState([]);
  const [secondaryCues, setSecondaryCues] = useState([]);
  const groups = useMemo(() => groupByLanguage(subList), [subList]);

  const saveSubPrefs = (patch) => storage.set(SUB_PREFS_KEY, { ...(storage.get(SUB_PREFS_KEY) || {}), ...patch });

  // ── Player settings ──
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, ...(storage.get(SETTINGS_KEY) || {}) });
  const setSetting = (key, value) => {
    setSettings((s) => {
      const next = { ...s, [key]: value };
      storage.set(SETTINGS_KEY, next);
      return next;
    });
  };
  const [sleep, setSleepState] = useState(null);
  const [sleepEndsAt, setSleepEndsAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  // ── Moments ──
  const momentsKey = "cnoMoments_" + progressKey;
  const [moments, setMoments] = useState(() => storage.get(momentsKey) || []);
  useEffect(() => { setMoments(storage.get(momentsKey) || []); }, [momentsKey]);

  const fail = (msg) => {
    setStatus("error");
    setErrorMsg(msg);
    onLoadedRef.current?.();
  };

  // Fetch the full subtitle list (all languages)
  useEffect(() => {
    setSubList([]);
    setPrimaryUrl(null);
    setOffset(0);
    setSubsError(null);
    let mounted = true;
    setSubsLoading(true);
    fetchSubtitleList({ type, imdbId, tmdbId, season, episode })
      .then((tracks) => { if (mounted) setSubList(tracks); })
      .catch(() => { if (mounted) setSubsError("Couldn't load subtitles"); })
      .finally(() => { if (mounted) setSubsLoading(false); });
    return () => { mounted = false; };
  }, [imdbId, tmdbId, type, season, episode]);

  // Pick the best match when the language changes or the list arrives
  useEffect(() => {
    if (!primaryLang) { setPrimaryUrl(null); return; }
    const g = groups.find((x) => x.lang === primaryLang);
    setPrimaryUrl((cur) => (g?.versions.some((v) => v.url === cur) ? cur : g?.versions[0]?.url || null));
  }, [primaryLang, groups]);

  const secondaryUrl = useMemo(() => {
    if (!secondaryLang) return null;
    return groups.find((g) => g.lang === secondaryLang)?.versions[0]?.url || null;
  }, [secondaryLang, groups]);

  useEffect(() => {
    setPrimaryCues([]);
    if (!primaryUrl) return;
    let mounted = true;
    loadCues(primaryUrl)
      .then((c) => { if (mounted) setPrimaryCues(c); })
      .catch(() => { if (mounted) showToast("Couldn't load that subtitle — try another version"); });
    return () => { mounted = false; };
  }, [primaryUrl, showToast]);

  useEffect(() => {
    setSecondaryCues([]);
    if (!secondaryUrl) return;
    let mounted = true;
    loadCues(secondaryUrl).then((c) => { if (mounted) setSecondaryCues(c); }).catch(() => {});
    return () => { mounted = false; };
  }, [secondaryUrl]);

  // Resolve the cno.to stream through the server
  useEffect(() => {
    setStatus("resolving");
    setErrorMsg(null);
    setPlayUrl(null);
    seekedRef.current = false;
    retriesRef.current = 0;
    const linkTime = Number(new URLSearchParams(window.location.search).get("t"));
    const savedTime = Number(storage.get("dlTime_" + progressKey) || 0);
    startAtRef.current = linkTime > 0 ? linkTime : savedTime > 5 ? Math.max(0, savedTime - 5) : 0;

    let mounted = true;

    async function resolve() {
      const qs = new URLSearchParams({ type, id: String(id) });
      if (type === "tv") {
        qs.set("season", String(season || 1));
        qs.set("episode", String(episode || 1));
      }

      let data;
      try {
        const res = await fetch(`/api/cno/resolve?${qs}`);
        data = await res.json();
      } catch (err) {
        console.error("[CnoPlayer] resolve fetch failed:", err);
        if (mounted) fail("Could not reach server");
        return;
      }

      if (!mounted) return;

      if (!data.ok || !data.playUrl) {
        console.error("[CnoPlayer] no stream:", data);
        const isNotInLib = data.error?.includes("not available");
        fail(isNotInLib ? "This title isn't in the CNO library — try a different source" : (data.error || "No stream found on cno.to"));
        return;
      }

      setPlayUrl(data.playUrl);
      setStatus("loading");
    }

    resolve();

    return () => { mounted = false; };
  }, [type, id, season, episode, progressKey]);

  // Keep the controls bar up while a menu is open
  useEffect(() => {
    const controls = playerRef.current?.controls;
    if (!controls) return;
    if (openMenu) controls.pause?.();
    else controls.resume?.();
  }, [openMenu]);

  // Sleep timer
  useEffect(() => {
    if (typeof sleep !== "number") { setSleepEndsAt(null); return; }
    const endsAt = Date.now() + sleep * 60000;
    setSleepEndsAt(endsAt);
    const pauseTimer = setTimeout(() => {
      playerRef.current?.pause();
      setSleepState(null);
      showToast("Sleep timer — paused");
    }, sleep * 60000);
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => { clearTimeout(pauseTimer); clearInterval(tick); };
  }, [sleep, showToast]);
  const sleepRemaining = sleepEndsAt ? `${Math.max(1, Math.ceil((sleepEndsAt - now) / 60000))} min left` : null;

  // Volume boost
  useEffect(() => {
    const p = playerRef.current;
    if (p && status === "playing" && p.state?.canSetAudioGain) p.audioGain = settings.boost > 1 ? settings.boost : null;
  }, [settings.boost, status]);

  // G / H nudge subtitle timing
  useEffect(() => {
    if (!playUrl) return;
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      if (k !== "g" && k !== "h") return;
      setOffset((o) => {
        const next = Math.round((o + (k === "h" ? 0.1 : -0.1)) * 10) / 10;
        showToast(`Subtitle timing: ${next ? `${Math.abs(next)} s ${next > 0 ? "later" : "earlier"}` : "on time"}`);
        return next;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playUrl, showToast]);

  const ui = {
    openMenu,
    toggleMenu: (m) => setOpenMenu((cur) => (cur === m ? null : m)),
    closeMenu: () => setOpenMenu(null),
    toast,
    subs: {
      groups,
      primary: primaryUrl ? { lang: primaryLang, url: primaryUrl } : null,
      secondary: secondaryUrl ? { lang: secondaryLang, url: secondaryUrl } : null,
      offset,
      style: subStyle,
      loading: subsLoading,
      error: subsError,
      primaryCues,
      secondaryCues,
    },
    setPrimaryLang: (lang) => { setPrimaryLangState(lang); saveSubPrefs({ lang }); },
    setPrimaryVersion: (url) => setPrimaryUrl(url),
    setSecondaryLang: (lang) => { setSecondaryLangState(lang); saveSubPrefs({ secondLang: lang }); },
    setOffset,
    setStyle: (style) => { setSubStyleState(style); saveSubPrefs({ style }); },
    settings: { ...settings, sleep },
    setSetting,
    setSleep: (v) => setSleepState(v),
    sleepRemaining,
    moments,
    addMoment: () => {
      const t = Math.floor(playerRef.current?.currentTime || 0);
      const cue = activeCueText(primaryCues, t, offset).replace(/\n/g, " ");
      const next = [...moments.filter((m) => m.t !== t), { t, label: cue || title || "Saved moment" }].sort((a, b) => a.t - b.t);
      setMoments(next);
      storage.set(momentsKey, next);
      showToast(`Moment saved at ${formatTime(t)}`);
    },
    removeMoment: (t) => {
      const next = moments.filter((m) => m.t !== t);
      setMoments(next);
      storage.set(momentsKey, next);
    },
    copyLink: () => {
      const t = Math.floor(playerRef.current?.currentTime || 0);
      const url = new URL(window.location.href);
      url.searchParams.set("t", String(t));
      navigator.clipboard?.writeText(url.toString())
        .then(() => showToast(`Link copied — starts at ${formatTime(t)}`))
        .catch(() => showToast("Couldn't copy the link"));
    },
    onDownload,
    download: () => {
      setOpenMenu(null);
      const p = playerRef.current;
      if (p?.state?.fullscreen) p.exitFullscreen().catch(() => {});
      onDownload?.();
    },
  };

  const handleProviderChange = (provider) => {
    if (isHLSProvider(provider)) provider.config = HLS_CONFIG;
  };

  const handleManifestParsed = (data) => {
    // Start on the highest quality, as the old player did.
    const hls = playerRef.current?.provider?.instance;
    if (hls && data?.levels?.length > 0) hls.currentLevel = data.levels.length - 1;
  };

  const handleCanPlay = () => {
    if (!seekedRef.current) {
      seekedRef.current = true;
      if (startAtRef.current > 0 && playerRef.current) {
        playerRef.current.currentTime = startAtRef.current;
      }
    }
    if (status !== "playing") {
      setStatus("playing");
      onLoadedRef.current?.();
    }
  };

  const handleHlsError = (data) => {
    console.error("[CnoPlayer] HLS error:", data?.type, data?.details, data?.fatal);
    if (!data?.fatal) return;
    if (data.type === "networkError" && retriesRef.current < MAX_RETRIES) {
      retriesRef.current++;
      const delay = BASE_BACKOFF_MS * Math.pow(2, retriesRef.current - 1);
      setTimeout(() => playerRef.current?.provider?.instance?.startLoad(), delay);
      return;
    }
    fail(data.type === "networkError"
      ? "Source Error — stream unreachable after retries"
      : `Source Error — ${data.details || data.type}`);
  };

  const handleTimeUpdate = ({ currentTime }) => {
    const duration = playerRef.current?.duration ?? 0;
    if (currentTime > 0) onTimeUpdateRef.current?.({ currentTime, duration });
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {status === "resolving" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div className="spinner" />
          <span style={{ fontSize: 14, color: "var(--text2)" }}>Looking up CNO stream…</span>
        </div>
      )}
      {status === "error" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 24, textAlign: "center" }}>
          <span style={{ fontSize: 28 }}>⚠️</span>
          <span style={{ fontSize: 14, color: "var(--text2)" }}>CNO stream unavailable</span>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>{errorMsg}</span>
        </div>
      )}
      {playUrl && status !== "error" && (
        <CnoUiContext.Provider value={ui}>
          <MediaPlayer
            key={playUrl}
            ref={playerRef}
            className="cno-player"
            data-cno-crop={settings.crop ? "" : undefined}
            title={title}
            src={{ src: playUrl, type: "application/x-mpegurl" }}
            autoPlay
            playsInline
            onProviderChange={handleProviderChange}
            onHlsManifestParsed={handleManifestParsed}
            onHlsError={handleHlsError}
            onCanPlay={handleCanPlay}
            onTimeUpdate={handleTimeUpdate}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              "--cno-picture": PICTURE_MODES[settings.picture] || "none",
            }}
          >
            <MediaProvider>
              {poster && <Poster className="vds-poster" src={poster} alt={title || "Poster"} />}
            </MediaProvider>
            <SubtitleOverlay />
            <DefaultVideoLayout
              icons={defaultLayoutIcons}
              seekStep={10}
              slots={LAYOUT_SLOTS}
              noKeyboardAnimations={!settings.keyboardAnims}
            />
            <CnoMenuLayer />
            <CnoToast />
          </MediaPlayer>
        </CnoUiContext.Provider>
      )}
    </div>
  );
}
