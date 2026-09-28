"use client";

// Taxes tab: quarterly estimated-tax planner. Cash-basis net profit per IRS
// quarter with the recommended set-aside under the configured entity mode,
// plus the merchant-of-record explainer (LS remits sales tax, we owe income
// tax only).

import { useCallback, useEffect, useState } from "react";
import { usd, shortDate, todayIso } from "./format";

type SetAside = {
  seTaxCents: number;
  socialSecurityCents: number;
  medicareCents: number;
  federalCents: number;
  utahCents: number;
  totalCents: number;
};

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
  useTaxOwedYearCents?: number;
  utahUseTaxRatePercent?: number;
  seYear?: { seTaxCents: number; socialSecurityCents: number; medicareCents: number };
  seTaxEducation?: string;
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

      {data?.taxMode === "passthrough" && data.seYear && data.seYear.seTaxCents > 0 ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
          <p className="font-semibold">Self-employment tax (Social Security + Medicare)</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-white/70 px-3 py-2">
              <p className="text-xs text-indigo-700">Social Security (12.4%)</p>
              <p className="text-lg font-semibold">{usd(data.seYear.socialSecurityCents)}</p>
            </div>
            <div className="rounded-lg bg-white/70 px-3 py-2">
              <p className="text-xs text-indigo-700">Medicare (2.9%)</p>
              <p className="text-lg font-semibold">{usd(data.seYear.medicareCents)}</p>
            </div>
            <div className="rounded-lg bg-white/70 px-3 py-2">
              <p className="text-xs text-indigo-700">Total SE tax (15.3%)</p>
              <p className="text-lg font-semibold">{usd(data.seYear.seTaxCents)}</p>
            </div>
          </div>
          <p className="mt-3 text-indigo-800">{data.seTaxEducation}</p>
          <p className="mt-2 text-xs text-indigo-700">
            Where + when: paid together with your federal income tax as one quarterly estimated
            payment at irs.gov/payments (Direct Pay, reason &quot;Estimated Tax&quot;), due Apr 15,
            Jun 15, Sep 15, and Jan 15. Reported on Schedule SE with your Form 1040 at year end. Not
            a separate bill.
          </p>
        </div>
      ) : null}

      {data && (data.useTaxOwedYearCents ?? 0) > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">
            Utah use tax owed for {data.year}: {usd(data.useTaxOwedYearCents ?? 0)}
          </p>
          <p className="mt-1 text-amber-800">
            On purchases where a vendor did not charge Utah sales tax (set per expense on the
            Expenses tab, at {(data.utahUseTaxRatePercent ?? 7.25).toFixed(2)}%). File it on your
            Utah sales/use tax return, separate from income tax. Planning estimate, not tax advice.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        <p className="font-semibold text-slate-900">Where to pay</p>
        <p className="mt-1">
          Federal (income tax AND self-employment tax together, as one payment): IRS Direct Pay
          (choose &quot;Estimated tax&quot;) at irs.gov/payments. Utah: Taxpayer Access Point at
          tap.utah.gov. Utah use tax (if any) goes on your Utah sales/use tax return, not here. Email
          reminders go out 7 days and 1 day before each deadline.
        </p>
      </div>
    </div>
  );
}
