"use client";

import { useEffect, useState } from "react";

/**
 * Dashboard-wide "your free access ends in N days" banner for win-back and
 * creator comps, with the one-click Keep my plan checkout. Shown during the last
 * 30 days of the comp. Data from /api/me/comp-status. Keeping the plan never
 * charges early: the first charge lands on the comp end date.
 */
type CompStatus = {
  active: boolean;
  kind?: string;
  endsAt?: string;
  daysLeft?: number;
  plan?: string;
  keepUrl?: string;
};

const SHOW_WITHIN_DAYS = 30;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export default function CompEndingBanner() {
  const [status, setStatus] = useState<CompStatus | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/me/comp-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CompStatus | null) => {
        if (alive && data) setStatus(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!status?.active || !status.endsAt || !status.keepUrl) return null;
  const days = status.daysLeft ?? 0;
  if (days > SHOW_WITHIN_DAYS) return null;

  const plan = status.plan || "Pro";
  const when = days <= 1 ? "tomorrow" : `in ${days} days`;
  const creator = status.kind === "creator";
  const urgent = days <= 7;

  return (
    <div
      role="region"
      aria-label="Free access ending"
      className={`mb-6 rounded-2xl border p-5 shadow-sm ${
        urgent ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {creator ? "Thank you for being part of Influencer Butler! " : ""}
            Your free {plan} access ends {when} ({formatDate(status.endsAt)}).
          </p>
          <p className="mt-1 text-sm text-slate-700">
            Add a card to keep your plan. Your first charge is not until {formatDate(status.endsAt)}, so
            you keep every free day. If you do nothing, your free butlers keep working and you are never
            charged.
          </p>
        </div>
        <a
          href={status.keepUrl}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2"
        >
          Keep my plan
        </a>
      </div>
    </div>
  );
}
