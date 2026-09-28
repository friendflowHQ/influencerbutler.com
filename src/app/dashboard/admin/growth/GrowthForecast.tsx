"use client";

// Future-month forecast. For any month past the current one, we cannot show
// secured numbers, so instead we project from recent trend: new subscriptions
// and trials grow at a derived monthly rate, active subscribers roll forward
// net of churn, and monthly revenue is modelled as active subscribers times
// average revenue per subscriber. The three assumptions (growth, churn,
// conversion) start from the trend and are adjustable; every number here
// recomputes instantly as the sliders move, so it stays a "what if", never a
// promise. See src/lib/growth-forecast.ts for the math.

import { useMemo, useState } from "react";
import {
  defaultAssumptions,
  projectForward,
  type ForecastAssumptions,
  type ForecastBaseline,
} from "@/lib/growth-forecast";
import { formatUsdFromCents, monthLabel } from "./format";

function roundCount(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString("en-US");
}

function pct(fraction: number): string {
  const v = fraction * 100;
  const rounded = Math.round(v * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

/** A labelled slider bound to one assumption, shown as a percentage. */
function Knob({
  label,
  value,
  onChange,
  min,
  max,
  hint,
  signed,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  hint: string;
  /** Show a leading + for positive values (growth can be negative). */
  signed?: boolean;
}) {
  const percent = Math.round(value * 1000) / 10;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-semibold text-slate-700">{label}</label>
        <span className="text-sm font-bold text-slate-900">
          {signed && percent > 0 ? "+" : ""}
          {percent}%
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.5}
        value={percent}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="mt-2 w-full accent-indigo-600"
        aria-label={label}
      />
      <p className="mt-1 text-[11px] leading-snug text-slate-400">{hint}</p>
    </div>
  );
}

function ProjectedTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
      <p className="text-2xl font-extrabold" style={{ color: accent }}>
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default function GrowthForecast({
  baseline,
  defaults,
  currentMonth,
  targetMonth,
  monthsAhead,
}: {
  baseline: ForecastBaseline;
  defaults: ForecastAssumptions;
  currentMonth: string;
  targetMonth: string;
  monthsAhead: number;
}) {
  const [assumptions, setAssumptions] = useState<ForecastAssumptions>(defaults);

  const projections = useMemo(
    () => projectForward(baseline, assumptions, currentMonth, monthsAhead),
    [baseline, assumptions, currentMonth, monthsAhead],
  );
  const target = projections[projections.length - 1] ?? null;

  const canForecast =
    baseline.newSubsPerMonth !== null ||
    baseline.revenueCentsPerMonth !== null ||
    baseline.activeNow !== null;
  const hasArpu = baseline.arpuCents !== null && baseline.arpuCents > 0;

  const isTrend =
    assumptions.monthlyGrowth === defaults.monthlyGrowth &&
    assumptions.churnRate === defaults.churnRate &&
    assumptions.conversionRate === defaults.conversionRate;

  if (!canForecast || !target) {
    return (
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm font-semibold text-slate-800">
          Forecast for {monthLabel(targetMonth)}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Not enough recent history yet to project this month. Once a few months of
          subscriptions and revenue are in, this will fill in automatically.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
            Forecast for {monthLabel(targetMonth)}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {monthsAhead} {monthsAhead === 1 ? "month" : "months"} out, projected from the last
            few months. A scenario, not secured revenue.
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          Projection
        </span>
      </div>

      {/* Headline: the selected month's projected standing. */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ProjectedTile
          label="Projected active subscribers"
          value={roundCount(target.activeSubs)}
          accent="#4f46e5"
        />
        <ProjectedTile
          label="Projected new subs that month"
          value={roundCount(target.newSubs)}
          accent="#8b5cf6"
        />
        <ProjectedTile
          label="Projected trials that month"
          value={roundCount(target.trials)}
          accent="#6366f1"
        />
        <ProjectedTile
          label="Projected conversions"
          value={roundCount(target.conversions)}
          accent="#10b981"
        />
      </div>

      {/* Revenue: modelled MRR for the target month + cumulative to get there. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-dashed border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-3xl font-extrabold text-emerald-700">
              {hasArpu ? formatUsdFromCents(Math.round(target.revenueCents)) : "n/a"}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Projected monthly revenue
            </p>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {hasArpu ? (
              <>
                {monthLabel(targetMonth)} run-rate at{" "}
                <strong className="text-slate-800">{roundCount(target.activeSubs)}</strong> active
                subscribers.
              </>
            ) : (
              "Needs an average revenue per subscriber to model. Add a month or two of revenue and active subs."
            )}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            Modelled as projected active subscribers times average revenue per subscriber, not the
            lumpy per-month order total.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-sky-300 bg-gradient-to-br from-sky-50 to-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-3xl font-extrabold text-sky-700">
              {hasArpu ? formatUsdFromCents(Math.round(target.cumulativeRevenueCents)) : "n/a"}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
              Cumulative through {monthLabel(targetMonth)}
            </p>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Total modelled revenue over the next{" "}
            <strong className="text-slate-800">{monthsAhead}</strong>{" "}
            {monthsAhead === 1 ? "month" : "months"}.
          </p>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            Sum of each month&apos;s modelled revenue from next month through the one selected.
          </p>
        </div>
      </div>

      {/* Assumptions: the three knobs, seeded from trend, adjustable live. */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">
            Assumptions
          </p>
          <button
            type="button"
            onClick={() => setAssumptions(defaultAssumptions(baseline))}
            disabled={isTrend}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Reset to trend
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Knob
            label="Monthly growth"
            value={assumptions.monthlyGrowth}
            onChange={(v) => setAssumptions((a) => ({ ...a, monthlyGrowth: v }))}
            min={-50}
            max={100}
            signed
            hint="How fast new subs and trials grow each month. Starts from your recent trend."
          />
          <Knob
            label="Monthly churn"
            value={assumptions.churnRate}
            onChange={(v) => setAssumptions((a) => ({ ...a, churnRate: v }))}
            min={0}
            max={30}
            hint="Share of active subscribers who cancel each month. An assumption you can tune."
          />
          <Knob
            label="Trial conversion"
            value={assumptions.conversionRate}
            onChange={(v) => setAssumptions((a) => ({ ...a, conversionRate: v }))}
            min={0}
            max={100}
            hint="Share of trials that become paid. Starts from your recent conversion rate."
          />
        </div>
        {baseline.migrationPending ? (
          <p className="mt-3 text-[11px] text-amber-700">
            Trial conversion history is unavailable until 20260704_trial_conversion_capture.sql is
            applied, so conversion starts from a default. Tune it above.
          </p>
        ) : null}
      </div>

      {/* Month-by-month path so the ramp is visible, not just the endpoint. */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-semibold">Month</th>
              <th className="px-4 py-2 text-right font-semibold">Active subs</th>
              <th className="px-4 py-2 text-right font-semibold">New subs</th>
              <th className="px-4 py-2 text-right font-semibold">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {projections.map((p) => {
              const isTarget = p.month === targetMonth;
              return (
                <tr
                  key={p.month}
                  className={`border-b border-slate-50 last:border-0 ${
                    isTarget ? "bg-indigo-50/50 font-semibold text-slate-900" : "text-slate-600"
                  }`}
                >
                  <td className="px-4 py-2">{monthLabel(p.month)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{roundCount(p.activeSubs)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{roundCount(p.newSubs)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {hasArpu ? formatUsdFromCents(Math.round(p.revenueCents)) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* What the trend was read from, so the projection is not a black box. */}
      <p className="mt-3 text-[11px] leading-snug text-slate-400">
        Baseline from recent history:{" "}
        {baseline.activeNow !== null ? `${roundCount(baseline.activeNow)} active now` : "active n/a"}
        {baseline.newSubsPerMonth !== null
          ? `, ~${roundCount(baseline.newSubsPerMonth)} new subs/mo`
          : ""}
        {baseline.arpuCents !== null
          ? `, ${formatUsdFromCents(baseline.arpuCents)}/sub/mo`
          : ""}
        {`, growth trend ${pct(baseline.monthlyGrowth)}/mo`}
        {baseline.conversionRate !== null
          ? `, ${Math.round(baseline.conversionRate * 100)}% trial conversion`
          : ""}
        .
      </p>
    </section>
  );
}
