// ── Redirect Shield ───────────────────────────────────────────────────────────
// Web-build only mitigation for the cross-origin free players:
//   * A load-event watchdog blanks the player when it churns through several
//     rapid navigations (ad-redirect loop) and the page offers Resume /
//     Switch source.
//   * Popups are already gated by the browser's native popup blocker.
// Note: the iframe is deliberately NOT sandboxed — most embed players refuse
// to run in a sandboxed frame ("This content can't be embedded in a sandboxed
// frame"). A true network-level adblocker is impossible from a webpage (no
// webRequest API); this is the practical equivalent without breaking playback.

import { useCallback, useRef, useState } from "react";
import { storage, STORAGE_KEYS } from "./storage";

const LOAD_WINDOW_MS = 8000;
const LOAD_THRESHOLD = 3;

export function useRedirectShield() {
  const enabled = storage.get(STORAGE_KEYS.REDIRECT_SHIELD) !== false;
  const loadsRef = useRef([]);
  const [blocked, setBlocked] = useState(false);

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