"use client";

// Forward-looking "what could this month total" card. Shows the money already
// secured this month plus the first-payment value of the trials open right now,
// on the optimistic assumption that every trial converts and none cancel. Only
// rendered for the current month; the projection is a "now" concept.

import { formatUsdFromCents, type EarningsProjection } from "./format";

export default function ProjectedEarnings({
  projection,
  loading,
}: {
  projection: EarningsProjection | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-6 h-28 animate-pulse rounded-xl border border-emerald-100 bg-emerald-50/40" />
    );
  }

  // No projection (not the current month, or live subs unreadable): render
  // nothing so the page just falls through to the normal tiles.
  if (!projection) return null;

  const { securedCents, trialsInProgress, projectedTrialCents, totalCents } = projection;

  return (
    <section className="mt-6">
      <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-3xl font-extrabold text-emerald-700">
            {totalCents === null ? "n/a" : formatUsdFromCents(totalCents)}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Projected total this month
          </p>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {securedCents === null ? (
            <>
              {trialsInProgress.toLocaleString("en-US")}{" "}
              {trialsInProgress === 1 ? "trial" : "trials"} in progress could add about{" "}
              <strong className="text-slate-800">{formatUsdFromCents(projectedTrialCents)}</strong>.
            </>
          ) : (
            <>
              <strong className="text-slate-800">{formatUsdFromCents(securedCents)}</strong> already
              secured, plus about{" "}
              <strong className="text-slate-800">{formatUsdFromCents(projectedTrialCents)}</strong>{" "}
              from {trialsInProgress.toLocaleString("en-US")}{" "}
              {trialsInProgress === 1 ? "trial" : "trials"} in progress.
            </>
          )}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-slate-400">
          Estimate only: assumes every trial converts to paid and none cancel. Each trial is valued
          at its plan&apos;s first payment (a monthly plan adds one month, an annual plan adds the
          full year). Secured revenue is money already paid to us.
        </p>
      </div>
    </section>
  );
}
