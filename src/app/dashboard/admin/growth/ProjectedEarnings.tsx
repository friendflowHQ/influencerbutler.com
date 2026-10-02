"use client";

// Forward-looking "what could this month earn" cards. Two figures over the same
// secured revenue, side by side:
//   - Best case: every trial open right now, valued at its full first payment
//     (an optimistic ceiling: assumes all convert and none cancel).
//   - Cash this month: only the trials whose next charge date falls within this
//     calendar month, i.e. money that could actually land this month.
// Only rendered for the current month; the projection is a "now" concept.

import {
  formatUsdFromCents,
  type EarningsProjection,
  type PayoutBucket,
  type ProjectionFigure,
} from "./format";

function trialWord(n: number): string {
  return n === 1 ? "trial" : "trials";
}

function subscriberWord(n: number): string {
  return n === 1 ? "subscriber" : "subscribers";
}

function formatPayoutDate(ms: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(ms),
  );
}

function PayoutBreakdown({ buckets }: { buckets: PayoutBucket[] }) {
  const funded = buckets.filter((b) => b.cents > 0);
  if (funded.length === 0) return null;
  return (
    <div className="mt-3 border-t border-sky-100 pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">
        Expected by Lemon Squeezy payout
      </p>
      <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
        {funded.map((bucket) => (
          <li key={bucket.payoutDateMs}>
            Around {formatPayoutDate(bucket.payoutDateMs)}:{" "}
            <strong className="text-slate-800">{formatUsdFromCents(bucket.cents)}</strong>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] leading-snug text-slate-400">
        Lemon Squeezy pays out on a fixed cadence, net of a holdback on recent orders. A payout date
        can land in the following calendar month for revenue collected near month-end.
      </p>
    </div>
  );
}

function ProjectionCard({
  figure,
  securedCents,
  eyebrow,
  trialsNoun,
  caption,
  accent,
  payoutSplit,
}: {
  figure: ProjectionFigure;
  securedCents: number | null;
  eyebrow: string;
  /** How the trials feeding this figure are described, e.g. "in progress". */
  trialsNoun: string;
  caption: string;
  accent: "emerald" | "sky";
  payoutSplit?: PayoutBucket[] | null;
}) {
  const tone =
    accent === "emerald"
      ? { border: "border-emerald-200", bg: "from-emerald-50", num: "text-emerald-700", eye: "text-emerald-700" }
      : { border: "border-sky-200", bg: "from-sky-50", num: "text-sky-700", eye: "text-sky-700" };

  return (
    <div className={`rounded-xl border ${tone.border} bg-gradient-to-br ${tone.bg} to-white p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className={`text-3xl font-extrabold ${tone.num}`}>
          {figure.totalCents === null ? "n/a" : formatUsdFromCents(figure.totalCents)}
        </p>
        <p className={`text-xs font-semibold uppercase tracking-wider ${tone.eye}`}>{eyebrow}</p>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {securedCents === null ? (
          <>
            {figure.trials.toLocaleString("en-US")} {trialWord(figure.trials)} {trialsNoun} could add
            about{" "}
            <strong className="text-slate-800">{formatUsdFromCents(figure.trialCents)}</strong>, plus
            about{" "}
            <strong className="text-slate-800">{formatUsdFromCents(figure.activeRenewalCents)}</strong>{" "}
            from {figure.activeRenewals.toLocaleString("en-US")} of your active{" "}
            {subscriberWord(figure.activeRenewals)} renewing this month.
          </>
        ) : (
          <>
            <strong className="text-slate-800">{formatUsdFromCents(securedCents)}</strong> already
            secured, plus about{" "}
            <strong className="text-slate-800">{formatUsdFromCents(figure.trialCents)}</strong> from{" "}
            {figure.trials.toLocaleString("en-US")} {trialWord(figure.trials)} {trialsNoun}, plus about{" "}
            <strong className="text-slate-800">{formatUsdFromCents(figure.activeRenewalCents)}</strong>{" "}
            from {figure.activeRenewals.toLocaleString("en-US")} of your active{" "}
            {subscriberWord(figure.activeRenewals)} renewing this month.
          </>
        )}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-400">{caption}</p>
      {payoutSplit ? <PayoutBreakdown buckets={payoutSplit} /> : null}
    </div>
  );
}

export default function ProjectedEarnings({
  projection,
  loading,
}: {
  projection: EarningsProjection | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="h-32 animate-pulse rounded-xl border border-emerald-100 bg-emerald-50/40" />
        <div className="h-32 animate-pulse rounded-xl border border-sky-100 bg-sky-50/40" />
      </div>
    );
  }

  // No projection (not the current month, or live subs unreadable): render
  // nothing so the page just falls through to the normal tiles.
  if (!projection) return null;

  const { securedCents, bestCase, thisMonth, payoutSplit } = projection;

  return (
    <section className="mt-6 grid gap-3 sm:grid-cols-2">
      <ProjectionCard
        figure={bestCase}
        securedCents={securedCents}
        eyebrow="Projected month total (best case)"
        trialsNoun="in progress"
        accent="emerald"
        caption="Best-case ceiling: assumes every trial in progress converts to paid, and every active subscriber due to renew this month actually renews, with none cancelling or failing payment. Each trial and renewal is valued at the plan's list price (a monthly plan adds one month, an annual plan adds the full year). Some trials will not bill until next month, so this is an upper bound, not guaranteed cash this month."
      />
      <ProjectionCard
        figure={thisMonth}
        securedCents={securedCents}
        eyebrow="Projected cash this month"
        trialsNoun="billing this month"
        accent="sky"
        caption="Tighter view: secured revenue plus only the trials whose next charge date falls within this calendar month, plus active subscribers due to renew this month, so it reflects cash that could actually land this month. Near month-end most trials bill next month, so this reads closer to secured revenue. Still assumes those trials convert and those renewals go through, with none cancelling or failing payment."
        payoutSplit={payoutSplit}
      />
    </section>
  );
}
