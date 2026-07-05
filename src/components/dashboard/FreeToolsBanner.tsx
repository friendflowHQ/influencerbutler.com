"use client";

import { useEffect, useState } from "react";

// Replaces the older single-tool freebie banners (Like Butler, CC Check). This
// one announces the whole Free forever tier: the Chrome extension plus the five
// See & Organize butlers. Dismissible per session; no sunset - the free tier is
// a permanent part of the product now.
const DISMISS_KEY = "ib_freetools_banner_dismissed_v1";

export default function FreeToolsBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let hidden = false;
    try {
      hidden = sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      hidden = false;
    }
    setDismissed(hidden);
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // sessionStorage may be unavailable - dismiss in-memory only
    }
    setDismissed(true);
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
            The whole Chrome extension plus five butlers work on every account - trial, paid,
            expired, or cancelled. No license check, no quota: Like Butler, Benable Like Butler, CC
            Check, Orders Butler, and Storefront Butler.
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
