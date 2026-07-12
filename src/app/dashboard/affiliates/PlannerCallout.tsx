// Reusable callout that points affiliates to the Content Planner. Shown while
// their application is under review and on the active dashboard, so they can
// plan and schedule content before their tracked link goes live.

import Link from "next/link";

export default function PlannerCallout({ waiting = false }: { waiting?: boolean }) {
  return (
    <section className="rounded-2xl border border-[#f97316]/30 bg-gradient-to-br from-orange-50 via-white to-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-wider text-[#f97316]">
            Content Planner
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {waiting
              ? "Waiting on approval? Start planning your content now."
              : "Plan and schedule your next promo in minutes."}
          </p>
          <p className="mt-1 text-sm text-slate-700">
            Hooks, copy-paste captions filtered by focus, a 5-email funnel, a 14-day calendar, and
            ready-made graphics. Line it all up now, then drop your tracked link in and go live.
          </p>
        </div>
        <Link
          href="/dashboard/affiliates/planner"
          className="inline-flex items-center justify-center rounded-lg bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
        >
          Open the Content Planner →
        </Link>
      </div>
    </section>
  );
}
