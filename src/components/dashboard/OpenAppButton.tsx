"use client";

import { useCallback, useRef, useState } from "react";

/**
 * "Open app" pill for the dashboard top strip. Clicking it launches the
 * installed Influencer Butler desktop app via its custom URL scheme
 * (influencerbutler://open), which cold-launches the app if it is closed or
 * brings the running instance to the front (handled by the desktop app's
 * single-instance / focusExistingWindow path).
 *
 * Smart fallback: the desktop app is not always installed, and a custom-scheme
 * navigation to an unregistered handler silently does nothing. So we watch for
 * the page losing focus/visibility (which happens when the OS hands off to the
 * app, or when the browser shows its "Open Influencer Butler?" permission
 * prompt). If neither fires within a short window, we assume the app is not
 * installed and send the user to the /download chooser.
 *
 * Known imperfection: the first-time browser permission prompt itself blurs the
 * page, which we read as success. That is the safe failure mode -- worst case
 * the user sees the (correct) prompt instead of a false download redirect, so
 * the timeout is kept long enough for the prompt to appear.
 */

const APP_PROTOCOL_URL = "influencerbutler://open";
const DOWNLOAD_URL = "/download";
const FALLBACK_MS = 2000;

export default function OpenAppButton() {
  const [opening, setOpening] = useState(false);
  const timerRef = useRef<number | null>(null);

  const handleOpen = useCallback(() => {
    if (typeof window === "undefined") return;

    let settled = false;

    const cleanup = () => {
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    // The page lost focus / went hidden -> the app (or its permission prompt)
    // took over. Treat as success and stand down the fallback.
    const onLeave = () => {
      if (settled) return;
      settled = true;
      setOpening(false);
      cleanup();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") onLeave();
    };

    window.addEventListener("blur", onLeave, { once: true });
    document.addEventListener("visibilitychange", onVisibility);

    setOpening(true);

    // Assigning location.href (rather than window.open) avoids leaving a stray
    // blank tab when the scheme is unregistered.
    try {
      window.location.href = APP_PROTOCOL_URL;
    } catch {
      // ignore -- the fallback timer still runs
    }

    timerRef.current = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      setOpening(false);
      // The app never grabbed focus -> most likely not installed. Send the user
      // to the download chooser so the button is never a dead end.
      window.location.href = DOWNLOAD_URL;
    }, FALLBACK_MS);
  }, []);

  return (
    <button
      type="button"
      onClick={handleOpen}
      disabled={opening}
      aria-label="Open the Influencer Butler desktop app"
      className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-default disabled:opacity-70"
    >
      <svg
        className="h-3.5 w-3.5 flex-none text-orange-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 20h8M12 16v4" />
      </svg>
      <span>{opening ? "Opening…" : "Open app"}</span>
    </button>
  );
}
