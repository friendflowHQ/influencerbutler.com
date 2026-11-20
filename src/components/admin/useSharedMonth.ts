"use client";

// A month (YYYY-MM) that follows the admin between pages. Order of precedence:
// ?month= in the URL (shareable links), then the last month picked on any
// admin page (localStorage), then the fallback (usually the current month).
// Changing it updates both, so Growth and Finance open on the same month.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ib-admin-month";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function initial(fallback: string): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("month");
    if (fromUrl && MONTH_RE.test(fromUrl)) return fromUrl;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && MONTH_RE.test(stored)) return stored;
  } catch {
    // storage or URL unavailable: use the fallback
  }
  return fallback;
}

export function useSharedMonth(fallback: string): [string, (next: string | ((prev: string) => string)) => void] {
  // Start on the fallback so server and client markup match, then adopt the saved month.
  const [month, setMonthState] = useState(fallback);

  useEffect(() => {
    setMonthState(initial(fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMonth = useCallback((next: string | ((prev: string) => string)) => {
    setMonthState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      try {
        window.localStorage.setItem(STORAGE_KEY, value);
        const url = new URL(window.location.href);
        url.searchParams.set("month", value);
        window.history.replaceState(null, "", url.toString());
      } catch {
        // best-effort persistence
      }
      return value;
    });
  }, []);

  return [month, setMonth];
}
