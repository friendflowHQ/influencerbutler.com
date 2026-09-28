"use client";

import { useEffect, useState } from "react";
import { annualSavingsPct } from "@/lib/pricing-constants";
import { trackEvent } from "@/lib/analytics-client";

/**
 * Dashboard-wide nudge for monthly subscribers to switch to annual. Annual
 * bills the full year up front (cash now) and annual customers churn far less.
 *
 * This only promotes the offer and links to the subscription page, where the
 * existing "Switch to annual" button (backed by /api/subscription/upgrade) does
 * the billing-sensitive LS variant swap with proration. Eligibility comes from
 * the lightweight /api/dashboard/annual-offer check. Session-dismissible, same
 * pattern as AffiliateUpsellBanner.
 */
const DISMISS_KEY = "ib_annual_switch_dismissed";

export default function SwitchToAnnualBanner() {
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/annual-offer", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { eligible?: boolean };
        if (!alive) return;
        if (data.eligible) {
          setEligible(true);
          const hidden =
            typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1";
          setDismissed(hidden);
        }
      } catch (error) {
        console.error("SwitchToAnnualBanner fetch failed", error);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!eligible || dismissed) return null;

  const savings = annualSavingsPct("solo");

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
      aria-label="Switch to annual"
      className="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-900">
            Switch to annual and save {savings}%
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Pay yearly instead of monthly, lock in the lower rate, and never think about it again.
            We apply a prorated credit for the rest of this month, so you only pay the difference
            today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/dashboard/subscription"
            onClick={() => trackEvent("annual_switch_banner_click", {})}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Switch to annual
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
