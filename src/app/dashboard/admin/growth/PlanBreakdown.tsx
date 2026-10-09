"use client";

// Live subscriber counts per plan (tier + monthly/yearly), shown under the
// "right now" strip. A point-in-time view, so it ignores the month picker.

import type { PlanBreakdownRow } from "./format";

const fmt = (n: number) => n.toLocaleString("en-US");

export default function PlanBreakdown({
  rows,
  loading,
}: {
  rows: PlanBreakdownRow[] | null;
  loading: boolean;
}) {
  if (loading) {
    return <div className="mt-3 h-56 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />;
  }
  if (!rows) return null;

  const totalActive = rows.reduce((sum, r) => sum + r.active, 0);
  const totalTrial = rows.reduce((sum, r) => sum + r.onTrial, 0);

  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
        Subscribers by plan
      </h2>
      <p className="mt-1 text-xs text-slate-600">
        Live right now, whatever month is selected. Add-on subscriptions are not counted.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
              <th scope="col" className="py-1.5 pr-3">Plan</th>
              <th scope="col" className="px-3 py-1.5 text-right">Active</th>
              <th scope="col" className="px-3 py-1.5 text-right">On trial</th>
              <th scope="col" className="py-1.5 pl-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = r.active + r.onTrial;
              return (
                <tr
                  key={r.plan}
                  className={`border-b border-slate-100 ${total === 0 ? "text-slate-500" : "text-slate-800"}`}
                >
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium">{r.label}</th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.active)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.onTrial)}</td>
                  <td className="py-1.5 pl-3 text-right font-semibold tabular-nums">{fmt(total)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-bold text-slate-900">
              <th scope="row" className="py-2 pr-3 text-left">All plans</th>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(totalActive)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(totalTrial)}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{fmt(totalActive + totalTrial)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
