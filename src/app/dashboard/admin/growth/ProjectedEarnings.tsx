"use client";

// Forward-looking "what could this month earn" cards. Two figures over the same
// secured revenue, side by side:
//   - Best case: every trial open right now, valued at its full first payment
//     (an optimistic ceiling: assumes all convert and none cancel).
//   - Cash this month: only the trials whose next charge date falls within this
//     calendar month, i.e. money that could actually land this month.
// Only rendered for the current month; the projection is a "now" concept.

import { formatUsdFromCents, type EarningsProjection, type ProjectionFigure } from "./format";

function trialWord(n: number): string {
  return n === 1 ? "trial" : "trials";
}

function ProjectionCard({
  figure,
  securedCents,
  eyebrow,
  trialsNoun,
  caption,
  accent,
}: {
  figure: ProjectionFigure;
  securedCents: number | null;
  eyebrow: string;
  /** How the trials feeding this figure are described, e.g. "in progress". */
  trialsNoun: string;
  caption: string;
  accent: "emerald" | "sky";
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
            <strong className="text-slate-800">{formatUsdFromCents(figure.trialCents)}</strong>.
          </>
        ) : (
          <>
            <strong className="text-slate-800">{formatUsdFromCents(securedCents)}</strong> already
            secured, plus about{" "}
            <strong className="text-slate-800">{formatUsdFromCents(figure.trialCents)}</strong> from{" "}
            {figure.trials.toLocaleString("en-US")} {trialWord(figure.trials)} {trialsNoun}.
          </>
        )}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-400">{caption}</p>
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

  const { securedCents, bestCase, thisMonth } = projection;

  return (
    <section className="mt-6 grid gap-3 sm:grid-cols-2">
      <ProjectionCard
        figure={bestCase}
        securedCents={securedCents}
        eyebrow="Projected month total (best case)"
        trialsNoun="in progress"
        accent="emerald"
        caption="Best-case ceiling: assumes every trial in progress converts to paid and none cancel. Each trial is valued at its plan's first payment (a monthly plan adds one month, an annual plan adds the full year). Some trials will not bill until next month, so this is an upper bound, not guaranteed cash this month."
      />
      <ProjectionCard
        figure={thisMonth}
        securedCents={securedCents}
        eyebrow="Projected cash this month"
        trialsNoun="billing this month"
        accent="sky"
        caption="Tighter view: secured revenue plus only the trials whose next charge date falls within this calendar month, so it reflects cash that could actually land this month. Near month-end most trials bill next month, so this reads close to secured revenue. Still assumes those trials convert and none cancel."
      />
    </section>
  );
}
