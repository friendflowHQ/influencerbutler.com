"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "ib_cccheck_freebie_dismissed_v1";
const SUNSET_TS = Date.UTC(2026, 7, 1);

export default function CcCheckFreebieBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (Date.now() > SUNSET_TS) return;
    let hidden = false;
    try {
      hidden = sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      hidden = false;
    }
    setDismissed(hidden);
  }, []);

  if (dismissed || Date.now() > SUNSET_TS) return null;

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
      aria-label="Free forever announcement"
      className="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            CC Check is now free forever
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Grab every ASIN from any storefront, blog post, or competitor page on every account -
            trial, paid, expired, or cancelled. No license check, no quota. Use it as much as you
            want.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/help/tutorials/cc-check"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Open CC Check
          </a>
          <a
            href="/features/cc-check"
            className="inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50"
          >
            See how it works
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
