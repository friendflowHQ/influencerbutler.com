"use client";

import { useState, useSyncExternalStore } from "react";
import { FACEBOOK_GROUP_URL } from "@/lib/social";

// Evergreen community invite shown to every logged-in user (trial and paid).
// Dismissal is per-session, matching the other dashboard banners
// (FreeToolsBanner). No sunset date: the group invite is not a time-boxed
// campaign.
const DISMISS_KEY = "ib_facebook_group_join_dismissed_v1";

// sessionStorage fires no events for same-tab writes, so the subscription is a
// no-op; the in-session dismissal lives in React state instead.
const subscribe = () => () => {};

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export default function FacebookGroupBanner() {
  // Dismissed on the server render so the banner only appears after hydration.
  const storedDismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  const [dismissedNow, setDismissedNow] = useState(false);
  const dismissed = storedDismissed || dismissedNow;

  if (dismissed) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // sessionStorage may be unavailable - dismiss in-memory only
    }
    setDismissedNow(true);
  };

  return (
    <div
      role="region"
      aria-label="Community announcement"
      className="mb-6 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-blue-50 p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#1877F2]">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
              <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.128 22 16.991 22 12z" />
            </svg>
            Join the Influencer Butler community
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Swap tips with other creators, get a first look at new features, and ask questions
            in our free Facebook group. We answer there every day.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={FACEBOOK_GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0d6ad8]"
          >
            Join the group
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
