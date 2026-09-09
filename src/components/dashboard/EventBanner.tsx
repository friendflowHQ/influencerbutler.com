"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics-client";

/**
 * Dashboard-wide banner for an upcoming group event. The admin schedules the
 * event and controls the banner text, CTA, target surfaces, and window from
 * /dashboard/admin/events; this renders the active `web` banner (if any) and
 * links to the Upcoming Events page to register. Session-dismissible per event,
 * same pattern as SwitchToAnnualBanner.
 */
type Banner = { id: string; text: string; ctaLabel: string | null; ctaUrl: string };

export default function EventBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/event-banner", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { banner?: Banner | null };
        if (!alive || !data.banner) return;
        setBanner(data.banner);
        const key = `ib_event_banner_dismissed_${data.banner.id}`;
        const hidden = typeof window !== "undefined" && sessionStorage.getItem(key) === "1";
        setDismissed(hidden);
      } catch (error) {
        console.error("EventBanner fetch failed", error);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!banner || dismissed) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(`ib_event_banner_dismissed_${banner.id}`, "1");
    } catch {
      // sessionStorage may be unavailable - dismiss in-memory only
    }
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Upcoming event"
      className="mb-6 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-sky-50 p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-indigo-900">Upcoming event</p>
          <p className="mt-1 text-sm text-slate-600">{banner.text}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={banner.ctaUrl}
            onClick={() => trackEvent("event_banner_click", { eventId: banner.id })}
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            {banner.ctaLabel || "View event"}
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
