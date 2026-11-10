import { useEffect, useRef, useState } from "react";
import { storage } from "../utils/storage";

export default function A111Player({
  type,
  title,
  season,
  episode,
  progressKey,
  onTimeUpdate,
  onLoaded,
}) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState("resolving");
  const [errorMsg, setErrorMsg] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [proxyUrl, setProxyUrl] = useState(null);
  const [ext, setExt] = useState(null);

  useEffect(() => {
    setStatus("resolving");
    setErrorMsg(null);
    setFileUrl(null);
    setProxyUrl(null);

    let mounted = true;

    async function resolve() {
      const qs = new URLSearchParams({ type, title });
      if (type === "tv") {
        qs.set("season", String(season || 1));
        qs.set("episode", String(episode || 1));
      }

      let data;
      try {
        const res = await fetch(`/api/a111/resolve?${qs}`);
        data = await res.json();
      } catch {
        if (!mounted) return;
        setStatus("error");
        setErrorMsg("Could not reach server");
        return;
      }

      if (!mounted) return;

      if (!data.ok || !data.fileUrl) {
        setStatus("error");
        setErrorMsg(data.error || "Not found on 111477");
        return;
      }

      setFileUrl(data.fileUrl);
      // Use direct URL — browser video tag doesn't need CORS headers
      setProxyUrl(data.fileUrl);
      setExt(data.ext);
      setStatus("loading");
    }

    resolve();
    return () => { mounted = false; };
  }, [type, title, season, episode]);

  // Attach video once proxyUrl is ready
  useEffect(() => {
    if (!proxyUrl || !videoRef.current) return;
    const video = videoRef.current;
    video.src = proxyUrl;

    const savedTime = Number(storage.get("dlTime_" + progressKey) || 0);
    const startAt = savedTime > 5 ? Math.max(0, savedTime - 5) : 0;

    const onMeta = () => {
      if (startAt > 0 && video.duration > 0) video.currentTime = startAt;
      video.play().catch(() => {});
      setStatus("playing");
      onLoaded?.();
    };
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    video.load();

    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.src = "";
    };
  }, [proxyUrl, progressKey]);

  // Progress tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => {
      if (video.currentTime > 0)
        onTimeUpdate?.({ currentTime: video.currentTime, duration: video.duration });
    };
    video.addEventListener("timeupdate", handler);
    return () => video.removeEventListener("timeupdate", handler);
  }, [onTimeUpdate]);

  const openVlc = () => {
    if (fileUrl) window.open(`vlc://${fileUrl}`);
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {status === "resolving" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div className="spinner" />
          <span style={{ fontSize: 14, color: "var(--text2)" }}>Searching 111477…</span>
        </div>
      )}
      {status === "error" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 24, textAlign: "center" }}>
          <span style={{ fontSize: 28 }}>⚠️</span>
          <span style={{ fontSize: 14, color: "var(--text2)" }}>Not found on 111</span>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>{errorMsg}</span>
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
      {fileUrl && status !== "resolving" && (
        <button
          onClick={openVlc}
          title="Open in VLC"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 20,
            padding: "6px 12px",
            background: "rgba(255,138,0,0.9)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            backdropFilter: "blur(4px)",
          }}
        >
          Open in VLC
        </button>
      )}
    </div>
  );
}
