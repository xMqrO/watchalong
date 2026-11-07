import { useEffect, useRef, useState, useCallback } from "react";
import { storage } from "../utils/storage";

const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;

function loadHlsScript() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (window._hlsLoading) return window._hlsLoading;
  window._hlsLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = HLS_CDN;
    s.onload = () => { resolve(window.Hls); window._hlsLoading = null; };
    s.onerror = () => { reject(new Error("Failed to load hls.js")); window._hlsLoading = null; };
    document.head.appendChild(s);
  });
  return window._hlsLoading;
}

export default function CnoPlayer({
  type,
  id,
  season,
  episode,
  progressKey,
  imdbId,
  tmdbId,
  onTimeUpdate,
  onLoaded,
}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [status, setStatus] = useState("resolving");
  const [errorMsg, setErrorMsg] = useState(null);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [activeTrack, setActiveTrack] = useState(null);
  const resolvedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  // Fetch subtitles once we have an id
  useEffect(() => {
    const effectiveId = imdbId || tmdbId;
    if (!effectiveId) return;
    const qs = new URLSearchParams({ type, lang: "en" });
    if (imdbId) qs.set("imdb_id", imdbId);
    else qs.set("tmdb_id", String(tmdbId));
    if (type === "tv") {
      qs.set("season", String(season || 1));
      qs.set("episode", String(episode || 1));
    }
    fetch(`/api/subtitles?${qs}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.tracks?.length > 0) {
          setSubtitleTracks(data.tracks);
        }
      })
      .catch(() => {});
  }, [imdbId, tmdbId, type, season, episode]);

  // Inject/swap subtitle track on video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Remove existing managed tracks
    Array.from(video.querySelectorAll("track[data-cno]")).forEach((t) => t.remove());
    if (!activeTrack) return;
    const track = document.createElement("track");
    track.setAttribute("data-cno", "1");
    track.kind = "subtitles";
    track.label = activeTrack.label;
    track.srclang = activeTrack.lang;
    track.src = activeTrack.url;
    track.default = true;
    video.appendChild(track);
    // Force enable
    setTimeout(() => {
      const t = video.textTracks[video.textTracks.length - 1];
      if (t) t.mode = "showing";
    }, 300);
  }, [activeTrack]);

  useEffect(() => {
    resolvedRef.current = false;
    setStatus("resolving");
    setErrorMsg(null);
    cleanup();

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
        console.log("[CnoPlayer] resolve response:", data);
      } catch (err) {
        console.error("[CnoPlayer] resolve fetch failed:", err);
        if (!mounted) return;
        setStatus("error");
        setErrorMsg("Could not reach server");
        onLoaded?.();
        return;
      }

      if (!mounted) return;

      if (!data.ok || !data.playUrl) {
        console.error("[CnoPlayer] no stream:", data);
        setStatus("error");
        const isNotInLib = data.error?.includes("not available");
        setErrorMsg(isNotInLib ? "This title isn't in the CNO library — try a different source" : (data.error || "No stream found on cno.to"));
        onLoaded?.();
        return;
      }

      console.log("[CnoPlayer] attaching player to:", data.playUrl);
      resolvedRef.current = true;
      setStatus("loading");
      await attachPlayer(data.playUrl);
    }

    async function attachPlayer(playlistUrl) {
      if (!mounted) return;
      const video = videoRef.current;
      if (!video) return;

      const savedTime = Number(storage.get("dlTime_" + progressKey) || 0);
      const startAt = savedTime > 5 ? Math.max(0, savedTime - 5) : 0;

      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      if (isSafari && video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = playlistUrl;
        if (startAt > 0) {
          video.addEventListener("loadedmetadata", () => {
            if (video.duration > 0) video.currentTime = startAt;
          }, { once: true });
        }
        video.play().catch(() => {});
        setStatus("playing");
        onLoaded?.();
        return;
      }

      let Hls;
      try {
        Hls = await loadHlsScript();
      } catch {
        if (!mounted) return;
        setStatus("error");
        setErrorMsg("Failed to load player library");
        return;
      }

      if (!mounted) return;

      if (!Hls.isSupported()) {
        setStatus("error");
        setErrorMsg("HLS not supported in this browser");
        return;
      }

      const hls = new Hls({
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        enableWorker: true,
        allowedVideoMimes: ["video/mp4", "video/iso.segment", "video/mp2t", "video/webm", "video/x-matroska"],
        fragLoadingMaxRetry: MAX_RETRIES,
        fragLoadingRetryDelay: BASE_BACKOFF_MS,
        fragLoadingMaxRetryTimeout: BASE_BACKOFF_MS * Math.pow(2, MAX_RETRIES),
        manifestLoadingMaxRetry: MAX_RETRIES,
        manifestLoadingRetryDelay: BASE_BACKOFF_MS,
        levelLoadingMaxRetry: MAX_RETRIES,
      });
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        if (!mounted) return;
        console.log("[CnoPlayer] MANIFEST_PARSED, levels:", data.levels?.length);
        if (data.levels && data.levels.length > 0) {
          hls.currentLevel = data.levels.length - 1;
        }
        if (startAt > 0) video.currentTime = startAt;
        video.play().catch((e) => console.warn("[CnoPlayer] play() rejected:", e));
        setStatus("playing");
        onLoaded?.();
      });

      let segmentRetries = 0;
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!mounted) return;
        console.error("[CnoPlayer] HLS error:", data.type, data.details, data.fatal, data);
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (segmentRetries < MAX_RETRIES) {
            segmentRetries++;
            const delay = BASE_BACKOFF_MS * Math.pow(2, segmentRetries - 1);
            setTimeout(() => {
              if (mounted && hlsRef.current) hlsRef.current.startLoad();
            }, delay);
          } else {
            setStatus("error");
            setErrorMsg("Source Error — stream unreachable after retries");
            onLoaded?.();
          }
        } else {
          setStatus("error");
          setErrorMsg(`Source Error — ${data.details || data.type}`);
          onLoaded?.();
        }
      });

      hls.loadSource(playlistUrl);
      hls.attachMedia(video);
    }

    resolve();

    return () => { mounted = false; cleanup(); };
  }, [type, id, season, episode, progressKey]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => {
      if (video.currentTime > 0) onTimeUpdate?.({ currentTime: video.currentTime, duration: video.duration });
    };
    video.addEventListener("timeupdate", handler);
    return () => video.removeEventListener("timeupdate", handler);
  }, [onTimeUpdate]);

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
      {/* Subtitle selector */}
      {status === "playing" && subtitleTracks.length > 0 && (
        <div style={{
          position: "absolute", bottom: 52, right: 12, zIndex: 10,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <select
            value={activeTrack?.url || ""}
            onChange={(e) => {
              const track = subtitleTracks.find((t) => t.url === e.target.value) || null;
              setActiveTrack(track);
            }}
            style={{
              background: "rgba(0,0,0,0.75)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 4, padding: "3px 6px", fontSize: 12, cursor: "pointer",
            }}
          >
            <option value="">Subtitles off</option>
            {subtitleTracks.map((t, i) => (
              <option key={i} value={t.url}>{t.label}</option>
            ))}
          </select>
        </div>
      )}
      <video
        ref={videoRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: status === "error" || status === "resolving" ? "none" : "block",
        }}
        controls
        autoPlay
        playsInline
      />
    </div>
  );
}
