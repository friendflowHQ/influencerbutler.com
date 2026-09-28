"use client";

// Payouts tab: the estimate-vs-recorded Lemon Squeezy payout tracker. LS has
// no payouts API, so the forecast is estimated from order data and the owner
// records each actual bank deposit here ("Record payout").

import { useCallback, useEffect, useState } from "react";
import { usd, parseDollarsToCents, shortDate, todayIso } from "./format";

type PayoutRow = {
  id: string;
  amount_cents: number;
  currency: string | null;
  paid_at: string;
  period_start: string | null;
  period_end: string | null;
  note: string | null;
};

type Forecast = {
  estimatedNetAllTimeCents: number;
  estimatedFeesAllTimeCents: number;
  recordedPayoutsCents: number;
  estimatedUnpaidCents: number;
  nextPayoutDate: string;
  nextPayoutEstimateCents: number;
  driftCents: number | null;
};

type PayoutsResponse = {
  ok?: boolean;
  migrationPending?: boolean;
  error?: string;
  payouts?: PayoutRow[];
  forecast?: Forecast;
};

export default function PayoutsTab() {
  const [data, setData] = useState<PayoutsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayIso());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/payouts", { cache: "no-store" });
      const json = (await res.json()) as PayoutsResponse;
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recordPayout = async () => {
    const cents = parseDollarsToCents(amount);
    if (!cents) {
      setError("Enter the payout amount in dollars, e.g. 974.49");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents, paidAt, note: note || null }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not record the payout.");
        return;
      }
      setAmount("");
      setNote("");
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const removePayout = async (id: string) => {
    if (!window.confirm("Remove this recorded payout?")) return;
    await fetch(`/api/admin/finance/payouts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  };

  const forecast = data?.forecast;
  const payouts = data?.payouts ?? [];

  return (
    <div className="mt-6 space-y-6">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}

      {forecast ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-700">
              Next payout (estimate)
            </p>
            <p className="mt-1 text-2xl font-semibold text-indigo-900">
              {usd(forecast.nextPayoutEstimateCents)}
            </p>
            <p className="mt-1 text-xs text-indigo-700">
              expected around {shortDate(forecast.nextPayoutDate)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Est. balance at LS
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {usd(forecast.estimatedUnpaidCents)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Received to date
            </p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">
              {usd(forecast.recordedPayoutsCents)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Estimate drift
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {forecast.driftCents === null ? "-" : usd(forecast.driftCents)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Recorded vs estimated. Tune the LS fee in Settings if this grows.
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Record a payout</h2>
        <p className="mt-1 text-xs text-slate-500">
          When a Lemon Squeezy payout lands in the bank, enter the exact amount and date so the
          estimates stay calibrated.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-600">
            Amount (USD)
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="974.49"
              className="mt-1 block w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            Date received
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex-1 text-xs text-slate-600">
            Note (optional)
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. August payout"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void recordPayout()}
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Record payout"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
          Recorded payouts
        </h2>
        {payouts.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            None yet. Record the first payout when it hits the bank.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Note</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">{shortDate(p.paid_at)}</td>
                  <td className="px-4 py-2 font-medium text-slate-900">{usd(p.amount_cents)}</td>
                  <td className="px-4 py-2 text-slate-500">{p.note ?? "-"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void removePayout(p.id)}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
