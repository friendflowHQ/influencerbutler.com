"use client";

// Live subscriber counts per plan (tier + monthly/yearly), shown under the
// "right now" strip. A point-in-time view, so it ignores the month picker.
// Active subscribers are split into Paid and Comps (free grants that never
// charge), and MRR / average revenue count paid subscribers only.

import React, { useState } from "react";
import Link from "next/link";
import { downloadCsv } from "@/lib/csv-download";
import { formatUsdFromCents, type PlanBreakdownRow } from "./format";

const fmt = (n: number) => n.toLocaleString("en-US");

// Average monthly revenue per paid subscriber; "-" when there is no one to average.
const avgPerSub = (mrrCents: number | null, paid: number) =>
  mrrCents === null ? "n/a" : paid === 0 ? "-" : formatUsdFromCents(Math.round(mrrCents / paid));

const SECTION_LABEL: Record<PlanBreakdownRow["section"], string> = {
  legacy: "Legacy Pro plans",
  beginner: "Beginner",
  power: "Power User",
  other: "",
};

export default function PlanBreakdown({
  rows,
  compsKnown,
  loading,
}: {
  rows: PlanBreakdownRow[] | null;
  compsKnown: boolean;
  loading: boolean;
}) {
  const [showEmpty, setShowEmpty] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (loading) {
    return <div className="mt-3 h-56 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />;
  }
  if (!rows) return null;

  const isEmpty = (r: PlanBreakdownRow) => r.active + r.onTrial === 0;
  const emptyCount = rows.filter(isEmpty).length;
  const visibleRows = showEmpty ? rows : rows.filter((r) => !isEmpty(r));
  const toggleSection = (section: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });

  const totalPaid = rows.reduce((sum, r) => sum + (r.active - r.comped), 0);
  const totalComped = rows.reduce((sum, r) => sum + r.comped, 0);
  const totalTrial = rows.reduce((sum, r) => sum + r.onTrial, 0);
  const totalMrr = rows.reduce((sum, r) => sum + (r.mrrCents ?? 0), 0);
  // The unmapped row has no known price, so leave its subscribers out of the overall average too.
  const pricedPaid = rows.reduce((sum, r) => sum + (r.mrrCents === null ? 0 : r.active - r.comped), 0);

  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
          Subscribers by plan
        </h2>
        <button
          type="button"
          onClick={() =>
            downloadCsv(
              `subscribers-by-plan-${new Date().toISOString().slice(0, 10)}.csv`,
              ["Plan", "Paid", "Comps", "On trial", "Total", "MRR (USD)", "Avg / sub (USD)"],
              rows.map((r) => {
                const paid = r.active - r.comped;
                return [
                  r.label,
                  paid,
                  r.comped,
                  r.onTrial,
                  r.active + r.onTrial,
                  r.mrrCents === null ? "" : (r.mrrCents / 100).toFixed(2),
                  r.mrrCents === null || paid === 0 ? "" : (r.mrrCents / paid / 100).toFixed(2),
                ];
              }),
            )
          }
          className="min-h-9 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-700"
        >
          Export CSV
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Live right now, whatever month is selected. Comps and add-ons are not counted as paid.
      </p>
      <details className="group mt-1 text-xs text-slate-600">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-semibold text-indigo-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-700 [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">▸</span>
          How these numbers are counted
        </summary>
        <dl className="mt-1.5 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div>
            <dt className="inline font-semibold text-slate-800">Comps: </dt>
            <dd className="inline">
              free grants that never charge. They are left out of the Active subscribers tile (which
              equals Paid here), the goals and the projections.
            </dd>
          </div>
          <div>
            <dt className="inline font-semibold text-slate-800">MRR: </dt>
            <dd className="inline">list price, with yearly plans divided by 12. Paid subscribers only.</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-slate-800">Avg / sub: </dt>
            <dd className="inline">MRR per paid subscriber, per month.</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-slate-800">Not reflected: </dt>
            <dd className="inline">add-on subscriptions and other discounts.</dd>
          </div>
        </dl>
      </details>
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
              <th scope="col" className="px-3 py-1.5 text-right">% of MRR</th>
              <th scope="col" className="py-1.5 pl-3 text-right">Avg / sub</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r, i) => {
              const paid = r.active - r.comped;
              const total = r.active + r.onTrial;
              const prevSection = i > 0 ? visibleRows[i - 1].section : null;
              const showDivider = r.section !== "other" && r.section !== prevSection;
              const isCollapsed = r.section !== "other" && collapsed.has(r.section);
              const mrrShare = r.mrrCents === null || totalMrr <= 0 ? null : (r.mrrCents / totalMrr) * 100;
              return (
                <React.Fragment key={r.plan}>
                  {showDivider ? (
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th scope="colgroup" colSpan={8} className="py-0 pr-3 text-left">
                        <button
                          type="button"
                          onClick={() => toggleSection(r.section)}
                          aria-expanded={!isCollapsed}
                          className="flex w-full items-center gap-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-700"
                        >
                          <span aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span>
                          {SECTION_LABEL[r.section]}
                        </button>
                      </th>
                    </tr>
                  ) : null}
                  {isCollapsed ? null : (
                  <tr className={`border-b border-slate-100 ${total === 0 ? "text-slate-500" : "text-slate-800"}`}>
                    <th scope="row" className="py-1.5 pr-3 text-left font-medium">{r.label}</th>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(paid)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.comped > 0 ? (
                        <Link
                          href="/dashboard/admin/comps"
                          title="See who has a comp"
                          className="text-indigo-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-700"
                        >
                          {fmt(r.comped)}
                        </Link>
                      ) : (
                        fmt(r.comped)
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.onTrial)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmt(total)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.mrrCents === null ? "n/a" : formatUsdFromCents(r.mrrCents)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {mrrShare === null ? (
                        "-"
                      ) : (
                        <span className="inline-flex items-center justify-end gap-2">
                          <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                            <span
                              className="block h-full rounded-full bg-indigo-600"
                              style={{ width: `${Math.min(100, mrrShare)}%` }}
                            />
                          </span>
                          <span className="w-10">{mrrShare.toFixed(mrrShare > 0 && mrrShare < 1 ? 1 : 0)}%</span>
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pl-3 text-right tabular-nums">{avgPerSub(r.mrrCents, paid)}</td>
                  </tr>
                  )}
                </React.Fragment>
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
              <td className="px-3 py-2 text-right tabular-nums">{totalMrr > 0 ? "100%" : "-"}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{avgPerSub(totalMrr, pricedPaid)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {emptyCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowEmpty((v) => !v)}
          aria-expanded={showEmpty}
          className="mt-2 text-xs font-semibold text-indigo-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-700"
        >
          {showEmpty ? "Hide empty plans" : `Show ${emptyCount} empty ${emptyCount === 1 ? "plan" : "plans"}`}
        </button>
      ) : null}
    </section>
  );
}
