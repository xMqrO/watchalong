// ── Browser-build progress tracking ──────────────────────────────────────────
// In Electron, progress is polled via webview.executeJavaScript into the
// player. A plain browser cannot reach into a cross-origin player iframe, so
// this util uses the documented OnVid postMessage API (used by the Vidking /
// OnVid embeds that power the default source). The player answers through
// window.postMessage with { onvid: { action, currentTime, duration, ... } }.

// Attach a live reader to a player <iframe>. Returns null when the iframe
// isn't postMessage-ready. `read()` returns the latest known video state.
export function createOnVidReader(iframe) {
  if (!iframe || !iframe.contentWindow) return null;

  let detached = false;
  let lastResponseAt = 0;
  const state = { currentTime: null, duration: null };

  const onMessage = (e) => {
    if (detached) return;
    const d = e?.data && e.data.onvid;
    if (!d || typeof d !== "object") return;
    // Only trust the player iframe we manage.
    const source = e.source || null;
    if (source && source !== iframe.contentWindow) return;
    lastResponseAt = Date.now();
    if (d.action === "getCurrentTime") {
      if (typeof d.currentTime === "number") state.currentTime = d.currentTime;
      if (typeof d.duration === "number" && d.duration > 0) {
        state.duration = d.duration;
      }
    } else if (d.action === "getDuration") {
      if (typeof d.duration === "number" && d.duration > 0) {
        state.duration = d.duration;
      }
    }
  };
  window.addEventListener("message", onMessage);

  // Request a fresh position snapshot from the player (fire-and-forget; the
  // response arrives asynchronously and is stored for the next read()).
  const poll = () => {
    if (detached) return;
    try {
      iframe.contentWindow.postMessage(
        { onvid: { action: "getCurrentTime" } },
        "*",
      );
      iframe.contentWindow.postMessage(
        { onvid: { action: "getDuration" } },
        "*",
      );
    } catch {}
  };

  // Tell the player to jump to a position (used to resume saved progress).
  const seek = (seconds) => {
    if (detached) return;
    try {
      iframe.contentWindow.postMessage(
        { onvid: { action: "seekTo", time: Number(seconds) || 0 } },
        "*",
      );
    } catch {}
  };

  const read = () => {
    if (lastResponseAt === 0) return null;
    return {
      currentTime: state.currentTime,
      duration: state.duration,
    };
  };

  const detach = () => {
    detached = true;
    window.removeEventListener("message", onMessage);
  };

  return { poll, seek, read, detach };
}

// OnVid/OnVideo postMessage API action names (documented):
//   { onvid: { action: "getCurrentTime" } }  ->  { onvid: { action: "getCurrentTime", currentTime, duration } }
//   { onvid: { action: "getDuration" } }     ->  { onvid: { action: "getDuration", duration } }
//   { onvid: { action: "seekTo", time } }    ->  seek