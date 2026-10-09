"use client";

// Live subscriber counts per plan (tier + monthly/yearly), shown under the
// "right now" strip. A point-in-time view, so it ignores the month picker.
// Active subscribers are split into Paid and Comps (free grants that never
// charge), and MRR / average revenue count paid subscribers only.

import { formatUsdFromCents, type PlanBreakdownRow } from "./format";

const fmt = (n: number) => n.toLocaleString("en-US");

// Average monthly revenue per paid subscriber; "-" when there is no one to average.
const avgPerSub = (mrrCents: number | null, paid: number) =>
  mrrCents === null ? "n/a" : paid === 0 ? "-" : formatUsdFromCents(Math.round(mrrCents / paid));

export default function PlanBreakdown({
  rows,
  compsKnown,
  loading,
}: {
  rows: PlanBreakdownRow[] | null;
  compsKnown: boolean;
  loading: boolean;
}) {
  if (loading) {
    return <div className="mt-3 h-56 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />;
  }
  if (!rows) return null;

  const totalPaid = rows.reduce((sum, r) => sum + (r.active - r.comped), 0);
  const totalComped = rows.reduce((sum, r) => sum + r.comped, 0);
  const totalTrial = rows.reduce((sum, r) => sum + r.onTrial, 0);
  const totalMrr = rows.reduce((sum, r) => sum + (r.mrrCents ?? 0), 0);
  // The unmapped row has no known price, so leave its subscribers out of the overall average too.
  const pricedPaid = rows.reduce((sum, r) => sum + (r.mrrCents === null ? 0 : r.active - r.comped), 0);

  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
        Subscribers by plan
      </h2>
      <p className="mt-1 text-xs text-slate-600">
        Live right now, whatever month is selected. Add-on subscriptions are not counted. Paid plus
        Comps equals the Active subscribers tile. Comps are free grants that never charge, so MRR
        (list price, yearly plans divided by 12) and Avg / sub (MRR per paid subscriber, per month)
        count paid subscribers only. Other discounts are not reflected.
      </p>
      {!compsKnown ? (
        <p className="mt-1 text-xs font-medium text-amber-700">
          The comp list could not be read, so every active subscriber is shown as paid. Treat the
          Comps, MRR and Avg / sub figures as unreliable until this clears.
        </p>
      ) : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
              <th scope="col" className="py-1.5 pr-3">Plan</th>
              <th scope="col" className="px-3 py-1.5 text-right">Paid</th>
              <th scope="col" className="px-3 py-1.5 text-right">Comps</th>
              <th scope="col" className="px-3 py-1.5 text-right">On trial</th>
              <th scope="col" className="px-3 py-1.5 text-right">Total</th>
              <th scope="col" className="px-3 py-1.5 text-right">MRR</th>
              <th scope="col" className="py-1.5 pl-3 text-right">Avg / sub</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const paid = r.active - r.comped;
              const total = r.active + r.onTrial;
              return (
                <tr
                  key={r.plan}
                  className={`border-b border-slate-100 ${total === 0 ? "text-slate-500" : "text-slate-800"}`}
                >
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium">{r.label}</th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(paid)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.comped)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.onTrial)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmt(total)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {r.mrrCents === null ? "n/a" : formatUsdFromCents(r.mrrCents)}
                  </td>
                  <td className="py-1.5 pl-3 text-right tabular-nums">{avgPerSub(r.mrrCents, paid)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-bold text-slate-900">
              <th scope="row" className="py-2 pr-3 text-left">All plans</th>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(totalPaid)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(totalComped)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(totalTrial)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(totalPaid + totalComped + totalTrial)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatUsdFromCents(totalMrr)}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{avgPerSub(totalMrr, pricedPaid)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
