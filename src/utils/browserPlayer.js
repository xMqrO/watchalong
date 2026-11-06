// ── Browser-build progress tracking ──────────────────────────────────────────
// In Electron, progress is polled via webview.executeJavaScript into the
// player. A plain browser cannot reach into a cross-origin player iframe, so
// this util listens to the messages the embedded players post to their
// parent. Each provider uses its own shape; all of them are read here:
//   OnVid / Vidking   { onvid: { action, currentTime, duration } }
//   VixSrc (relay)    { type: "PLAYER_EVENT", event: { event, currentTime, duration } }
//   VidFast / VidLink { type: "PLAYER_EVENT", data: { event, currentTime, duration } }
//   Videasy & others  the same objects sent as a JSON string
// We only ever trust messages from the player iframe we manage.

// How far before the saved spot playback resumes, so the viewer can pick
// the scene back up. One value for every source and both pages.
export const RESUME_LOOKBACK_SEC = 5;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Pull { currentTime, duration, paused } out of any known message shape.
function extractState(raw) {
  let d = raw;
  if (typeof d === "string") {
    if (d.length > 4000 || d[0] !== "{") return null;
    try {
      d = JSON.parse(d);
    } catch {
      return null;
    }
  }
  if (!d || typeof d !== "object") return null;

  const candidates = [d.onvid, d.event, d.data, d.data?.data, d];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const currentTime = num(c.currentTime) ?? num(c.time) ?? num(c.position);
    const duration = num(c.duration);
    const name = typeof c.event === "string" ? c.event : c.action;
    if (currentTime == null && duration == null && !name) continue;
    let paused = null;
    if (name === "pause" || name === "ended") paused = true;
    else if (name === "play" || name === "playing" || name === "timeupdate") paused = false;
    if (typeof c.paused === "boolean") paused = c.paused;
    if (currentTime == null && duration == null && paused == null) continue;
    return { currentTime, duration, paused };
  }
  return null;
}

// Attach a live reader to a player <iframe>. Returns null when the iframe
// isn't postMessage-ready. `read()` returns the latest known video state.
// `onUpdate(state)` fires on every message that carries a playback time, so
// callers can save the exact position the moment it changes.
export function createOnVidReader(iframe, { onUpdate } = {}) {
  if (!iframe || !iframe.contentWindow) return null;

  let detached = false;
  let lastResponseAt = 0;
  const state = { currentTime: null, duration: null, paused: null };

  const onMessage = (e) => {
    if (detached) return;
    // Only trust the player iframe we manage.
    if (e.source && e.source !== iframe.contentWindow) return;
    const s = extractState(e.data);
    if (!s) return;
    lastResponseAt = Date.now();
    if (s.duration != null && s.duration > 0) state.duration = s.duration;
    if (s.paused != null) state.paused = s.paused;
    if (s.currentTime != null && s.currentTime >= 0) {
      state.currentTime = s.currentTime;
      onUpdate?.({ ...state });
    }
  };
  window.addEventListener("message", onMessage);

  // Request a fresh position snapshot from OnVid-style players (others push
  // their time on their own and simply ignore this).
  const poll = () => {
    if (detached) return;
    try {
      iframe.contentWindow.postMessage({ onvid: { action: "getCurrentTime" } }, "*");
      iframe.contentWindow.postMessage({ onvid: { action: "getDuration" } }, "*");
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
      paused: state.paused,
    };
  };

  const detach = () => {
    detached = true;
    window.removeEventListener("message", onMessage);
  };

  return { poll, seek, read, detach };
}
