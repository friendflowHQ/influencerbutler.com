"use client";

// Report tab: on-screen P&L for a date range + one-click CSV export.

import { useCallback, useEffect, useState } from "react";
import { usd, todayIso } from "./format";

type Pnl = {
  from: string;
  to: string;
  revenue: {
    grossCents: number;
    taxRemittedByLsCents: number;
    refundsCents: number;
    estimatedLsFeesCents: number;
    netCents: number;
  };
  expensesByCategory: { category: string; label: string; line: string; amountCents: number }[];
  totalExpensesCents: number;
  netProfitCents: number;
  taxSetAside: { seTaxCents: number; federalCents: number; utahCents: number; totalCents: number };
  useTaxOwedCents: number;
};

type ReportResponse = {
  ok?: boolean;
  migrationPending?: boolean;
  error?: string;
  pnl?: Pnl;
};

export default function ReportTab() {
  const year = todayIso().slice(0, 4);
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(todayIso());
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/finance/report?from=${from}&to=${to}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as ReportResponse;
      if (!res.ok || json.migrationPending) {
        setError(json.error ?? (json.migrationPending ? "Migration pending." : `Failed (${res.status})`));
        return;
      }
      setPnl(json.pnl ?? null);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const Row = ({
    label,
    value,
    negative,
    bold,
  }: {
    label: string;
    value: number;
    negative?: boolean;
    bold?: boolean;
  }) => (
    <div
      className={`flex items-center justify-between px-4 py-2 ${
        bold ? "font-semibold text-slate-900" : "text-slate-700"
      }`}
    >
      <span>{label}</span>
      <span>{negative && value > 0 ? `(${usd(value)})` : usd(value)}</span>
    </div>
  );

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <a
          href={`/api/admin/finance/report?from=${from}&to=${to}&format=csv`}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Download CSV
        </a>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}

      {pnl ? (
        <div className="max-w-2xl divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white py-2 shadow-sm">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Revenue
          </div>
          <Row label="Gross sales (incl. LS-remitted tax)" value={pnl.revenue.grossCents} />
          <Row
            label="Sales tax remitted by Lemon Squeezy"
            value={pnl.revenue.taxRemittedByLsCents}
            negative
          />
          <Row label="Refunds" value={pnl.revenue.refundsCents} negative />
          <Row label="Estimated Lemon Squeezy fees" value={pnl.revenue.estimatedLsFeesCents} negative />
          <Row label="Net revenue" value={pnl.revenue.netCents} bold />
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Expenses
          </div>
          {pnl.expensesByCategory.map((c) => (
            <Row key={c.category} label={`${c.label} (${c.line})`} value={c.amountCents} negative />
          ))}
          <Row label="Total expenses" value={pnl.totalExpensesCents} negative bold />
          <Row label="Net profit" value={pnl.netProfitCents} bold />
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tax planning
          </div>
          <Row label="Recommended income-tax set-aside" value={pnl.taxSetAside.totalCents} bold />
          <Row label="Utah use tax owed (estimate)" value={pnl.useTaxOwedCents} />
        </div>
      ) : null}
    </div>
  );
}
