import { useMemo, useState } from "react";
import { CloseIcon, DownloadIcon, SettingsIcon, ExternalLinkIcon } from "./Icons";
import { isElectron } from "../utils/storage";

/**
 * Web build: the browser cannot intercept m3u8/subtitle streams the way the
 * desktop app can, but the site's /api/stream endpoint bridges the gap:
 * direct files are piped through as a real download, and HLS links produce a
 * self-contained .m3u8 playlist any player (VLC/ffmpeg) can open.
 */
export default function DownloadModal({
  onClose,
  mediaName,
  posterPath,
  m3u8Url,
  streamUrl,
  downloaderFolder, // eslint-disable-line no-unused-vars
  setDownloaderFolder, // eslint-disable-line no-unused-vars
  onOpenSettings,
  mediaId, // eslint-disable-line no-unused-vars
  mediaType, // eslint-disable-line no-unused-vars
  tmdbId, // eslint-disable-line no-unused-vars
  subtitles, // eslint-disable-line no-unused-vars
  onDownloadStarted, // eslint-disable-line no-unused-vars
}) {
  const [copied, setCopied] = useState(false);
  const url = streamUrl || m3u8Url || null;

  const downloadUrl = useMemo(() => {
    if (!url) return null;
    let base = "";
    try {
      base = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    } catch {}
    base = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 180) || "download";
    if (!/\.m3u8$/i.test(base)) base += ".m3u8";
    return `/api/stream?url=${encodeURIComponent(url)}&name=${encodeURIComponent(base)}`;
  }, [url]);

  const copyUrl = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          width: 520,
          maxWidth: "95vw",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <DownloadIcon /> Get stream link
          </span>
          <button
            style={{
              background: "none",
              border: "none",
              color: "var(--text2)",
              cursor: "pointer",
              display: "flex",
            }}
            onClick={onClose}
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {url ? (
            <>
              <div style={{ fontSize: 14, color: "var(--text1)", fontWeight: 500 }}>
                {mediaName}
              </div>
              <div
                style={{
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 12,
                  color: "var(--text2)",
                  wordBreak: "break-all",
                  maxHeight: 140,
                  overflow: "auto",
                  userSelect: "all",
                }}
              >
                {url}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {!isElectron && url && downloadUrl && (
                  <button
                    className="btn btn-primary"
                    style={{
                      fontSize: 13,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    onClick={() => {
                      window.location.href = downloadUrl;
                    }}
                  >
                    <DownloadIcon size={14} /> Download file
                  </button>
                )}
                <button className="btn btn-primary" onClick={copyUrl} style={{ fontSize: 13 }}>
                  {copied ? "✓ Copied" : "Copy link"}
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}
                  onClick={() => {
                    const win = window.open(url, "_blank", "noopener");
                    if (win) win.opener = null;
                  }}
                >
                  <ExternalLinkIcon size={13} /> Open in new tab
                </button>
                {onOpenSettings && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}
                    onClick={onOpenSettings}
                  >
                    <SettingsIcon /> Settings
                  </button>
                )}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 14, color: "var(--text2)", fontWeight: 500 }}>
                Waiting for stream URL…
              </div>
              <div style={{ fontSize: 13, color: "var(--text3)", lineHeight: 1.6 }}>
                Start playback first. This browser build cannot intercept the
                stream the way the desktop app can, so the direct link is only
                available once the player has loaded.
              </div>
            </div>
          )}

          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: 14,
              fontSize: 12,
              color: "var(--text3)",
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: "var(--text2)" }}>Want a local file?</strong>{" "}
            {!isElectron ? (
              <>
                Use <strong>Download file</strong> above — the site's server saves
                direct files straight away. HLS links download as a
                <code style={{ margin: "0 4px" }}>.m3u8</code> playlist: open it
                with VLC (Media → Open Network Stream) or convert with
                <code style={{ margin: "0 4px" }}>ffmpeg</code>.
              </>
            ) : (
              <>
                Browsers cannot save these streams directly. Use a tool like
                <code style={{ margin: "0 4px" }}>yt-dlp</code> or
                <code style={{ margin: "0 4px" }}>ffmpeg</code> with the link above,
                One-click downloads and subtitle downloads are only available in
                the desktop app.
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}