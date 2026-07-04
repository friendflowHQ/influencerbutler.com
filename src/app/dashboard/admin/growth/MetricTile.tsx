"use client";

// One glanceable metric: big number, month-over-month delta arrow, sparkline.

import Sparkline from "./Sparkline";
import { formatMetricValue, type MetricUnit } from "./format";

function deltaBits(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  if (previous === 0 && current === 0) return { arrow: "-", tone: "text-slate-400", label: "flat" };
  if (previous === 0) return { arrow: "↑", tone: "text-emerald-600", label: "new" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { arrow: "-", tone: "text-slate-400", label: "flat" };
  return pct > 0
    ? { arrow: "↑", tone: "text-emerald-600", label: `${pct.toFixed(0)}%` }
    : { arrow: "↓", tone: "text-rose-600", label: `${Math.abs(pct).toFixed(0)}%` };
}

export default function MetricTile({
  label,
  unit,
  current,
  previous,
  series,
  accent = "#6366f1",
}: {
  label: string;
  unit: MetricUnit;
  current: number | null;
  previous: number | null;
  series: number[] | null;
  accent?: string;
}) {
  const delta = deltaBits(current, previous);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-2xl font-bold text-slate-900">{formatMetricValue(unit, current)}</p>
        {delta ? (
          <p className={`text-xs font-semibold ${delta.tone}`} title="vs last month">
            {delta.arrow} {delta.label}
          </p>
        ) : null}
      </div>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
      {series && series.some((v) => v > 0) ? (
        <div className="mt-2">
          <Sparkline data={series} stroke={accent} />
        </div>
      ) : null}
    </div>
  );
}
