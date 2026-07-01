"use client";

import { useEffect, useState } from "react";

/**
 * In-app "leave a testimonial" ask. Shows for subscribers ~45 days in (second
 * month) who haven't submitted or dismissed it. Eligibility + dismissal are
 * resolved server-side via /api/dashboard/testimonial-ask (subscriptions is
 * RLS-locked). Dismissal is persistent so we don't nag across sessions.
 */
export default function TestimonialAskBanner() {
  const [show, setShow] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/testimonial-ask", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { show?: boolean };
        if (alive) setShow(data.show === true);
      } catch (err) {
        console.error("TestimonialAskBanner fetch failed", err);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!show) return null;

  const dismiss = async () => {
    setShow(false);
    setDismissing(true);
    try {
      await fetch("/api/dashboard/testimonial-ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
    } catch {
      // banner already hidden in-memory; server dismissal is best-effort
    } finally {
      setDismissing(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Leave a testimonial"
      className="mb-6 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-orange-50 p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            Enjoying Influencer Butler? Tell other creators.
          </p>
          <p className="mt-1 text-sm text-slate-600">
            You&apos;re two months in. A quick star rating and a sentence takes about two minutes, and
            approved reviews go on our homepage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/dashboard/feedback"
            className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
          >
            Leave a review
          </a>
          <button
            type="button"
            onClick={dismiss}
            disabled={dismissing}
            aria-label="Dismiss"
            className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-600 disabled:opacity-60"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
