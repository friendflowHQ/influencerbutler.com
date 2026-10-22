"use client";

import { useEffect, useState } from "react";

// Replaces the older single-tool freebie banners (Like Butler, CC Check). This
// one announces the whole Free forever tier: the Chrome extension plus the six
// See & Organize butlers (FREE_BUTLER_SLUGS). Dismissal persists server-side
// in profiles.dashboard_dismissals, so closing it stays closed across logins
// and devices; no sunset - the free tier is a permanent part of the product
// now.
const DISMISS_KEY = "free_tools";

export default function FreeToolsBanner() {
  // Hidden until the server confirms it isn't dismissed, so it only appears
  // after that check resolves (same effect the old sessionStorage read had).
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/dashboard/banner-dismissals?key=${DISMISS_KEY}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { dismissed?: boolean };
        if (alive) setDismissed(Boolean(data.dismissed));
      } catch (error) {
        console.error("FreeToolsBanner dismissal fetch failed", error);
        if (alive) setDismissed(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    fetch("/api/dashboard/banner-dismissals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: DISMISS_KEY }),
    }).catch((error) => console.error("FreeToolsBanner dismiss failed", error));
  };

  return (
    <div
      role="region"
      aria-label="Free forever tools"
      className="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            Free forever, on every account
          </p>
          <p className="mt-1 text-sm text-slate-600">
            The whole Chrome extension plus six butlers work on every account - trial, paid,
            expired, or cancelled. No login, no card, no quota: Like Butler, Benable Like Butler,
            Instagram Like Butler, CC Check, Orders Butler, and Storefront Butler.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/extension"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Get the free tools
          </a>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
