// ── Redirect Shield ───────────────────────────────────────────────────────────
// Web-build mitigation for the cross-origin free players:
//   * A load-event watchdog blanks the player when it churns through several
//     rapid navigations (ad-redirect loop) and the page offers Resume /
//     Switch source.
//   * A beforeunload veto stops the embed's "top.location = casino" hijack
//     as a second line of defense: the browser shows a "Leave site?" prompt so
//     only the user can leave. SPA transitions (our own navigation) never fire
//     beforeunload, so in-app browsing is clean.
//   * Popups are gated by the browser's native popup blocker.
// Note: the player iframe is deliberately NOT sandboxed — the embed hosts
// detect the sandbox attribute and refuse to run ("This content can't be
// embedded in a sandboxed frame"), which also breaks video/audio playback.
// A true network-level adblocker is impossible from a webpage (no webRequest
// API); this veto + watchdog is the practical equivalent without breaking
// playback.

import { useCallback, useEffect, useRef, useState } from "react";
import { storage, STORAGE_KEYS } from "./storage";

const LOAD_WINDOW_MS = 8000;
const LOAD_THRESHOLD = 3;

export function useRedirectShield() {
  const enabled = storage.get(STORAGE_KEYS.REDIRECT_SHIELD) !== false;
  const loadsRef = useRef([]);
  const [blocked, setBlocked] = useState(false);

  // Veto silent top-level navigations while the player is live. Only real
  // page unloads trigger this — in-app router moves never unload the page.
  useEffect(() => {
    if (!enabled || blocked) return;
    const veto = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", veto);
    return () => window.removeEventListener("beforeunload", veto);
  }, [enabled, blocked]);

  const reset = useCallback(() => {
    loadsRef.current = [];
    setBlocked(false);
  }, []);

  const onPlayerLoad = useCallback(() => {
    if (!enabled || blocked) return;
    const now = Date.now();
    loadsRef.current = loadsRef.current.filter(
      (t) => now - t < LOAD_WINDOW_MS,
    );
    loadsRef.current.push(now);
    if (loadsRef.current.length >= LOAD_THRESHOLD) {
      loadsRef.current = [];
      setBlocked(true);
    }
  }, [enabled, blocked]);

  return {
    enabled,
    blocked,
    reset,
    onPlayerLoad,
  };
}