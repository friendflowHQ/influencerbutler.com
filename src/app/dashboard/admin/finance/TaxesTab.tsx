"use client";

// Taxes tab: quarterly estimated-tax planner. Cash-basis net profit per IRS
// quarter with the recommended set-aside under the configured entity mode,
// plus the merchant-of-record explainer (LS remits sales tax, we owe income
// tax only).

import { useCallback, useEffect, useState } from "react";
import { usd, shortDate, todayIso } from "./format";

type SetAside = { seTaxCents: number; federalCents: number; utahCents: number; totalCents: number };

type QuarterRow = {
  quarter: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  netProfitCents: number;
  revenueNetCents: number;
  expensesCents: number;
  setAside: SetAside;
  isPast: boolean;
  daysUntilDue: number;
};

type TaxResponse = {
  ok?: boolean;
  migrationPending?: boolean;
  error?: string;
  year?: number;
  taxMode?: "passthrough" | "scorp";
  quarters?: QuarterRow[];
  morEducation?: string;
};

export default function TaxesTab() {
  const [year, setYear] = useState(Number(todayIso().slice(0, 4)));
  const [data, setData] = useState<TaxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/finance/tax?year=${year}`, { cache: "no-store" });
      const json = (await res.json()) as TaxResponse;
      if (!res.ok || json.migrationPending) {
        setError(json.error ?? (json.migrationPending ? "Migration pending." : `Failed (${res.status})`));
        return;
      }
      setData(json);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const quarters = data?.quarters ?? [];
  const showSe = data?.taxMode === "passthrough";

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Entity mode:{" "}
          <span className="font-semibold text-slate-900">
            {data?.taxMode === "scorp" ? "S-corp election" : "Pass-through (sole proprietor LLC)"}
          </span>{" "}
          (change it in Settings)
        </p>
        <label className="text-xs text-slate-600">
          Year{" "}
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {[year + 1, year, year - 1, year - 2]
              .filter((y, i, arr) => arr.indexOf(y) === i)
              .sort((a, b) => b - a)
              .map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
          </select>
        </label>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}

      {data?.morEducation ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {data.morEducation}
        </div>
      ) : null}

      {quarters.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Quarter</th>
                <th className="px-4 py-3">Net revenue</th>
                <th className="px-4 py-3">Expenses</th>
                <th className="px-4 py-3">Net profit</th>
                {showSe ? <th className="px-4 py-3">SE tax</th> : null}
                <th className="px-4 py-3">Federal</th>
                <th className="px-4 py-3">Utah</th>
                <th className="px-4 py-3">Set aside</th>
                <th className="px-4 py-3">Due</th>
              </tr>
            </thead>
            <tbody>
              {quarters.map((q) => (
                <tr
                  key={q.quarter}
                  className={`border-t border-slate-100 ${
                    !q.isPast && q.daysUntilDue <= 30 ? "bg-amber-50/60" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    Q{q.quarter}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {q.periodStart.slice(5)} to {q.periodEnd.slice(5)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{usd(q.revenueNetCents)}</td>
                  <td className="px-4 py-3 text-slate-700">{usd(q.expensesCents)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{usd(q.netProfitCents)}</td>
                  {showSe ? (
                    <td className="px-4 py-3 text-slate-700">{usd(q.setAside.seTaxCents)}</td>
                  ) : null}
                  <td className="px-4 py-3 text-slate-700">{usd(q.setAside.federalCents)}</td>
                  <td className="px-4 py-3 text-slate-700">{usd(q.setAside.utahCents)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {usd(q.setAside.totalCents)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {shortDate(q.dueDate)}
                    {!q.isPast && q.daysUntilDue >= 0 ? (
                      <span className="ml-1 text-xs text-amber-700">
                        ({q.daysUntilDue}d)
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        <p className="font-semibold text-slate-900">Where to pay</p>
        <p className="mt-1">
          Federal: IRS Direct Pay (choose &quot;Estimated tax&quot;) at irs.gov/payments. Utah:
          Taxpayer Access Point at tap.utah.gov. Email reminders go out 7 days and 1 day before each
          deadline.
        </p>
      </div>
    </div>
  );
}
