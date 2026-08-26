"use client";

// Expenses tab: the merged ledger (manual + seed + recurring + affiliate
// payouts), manual CRUD, recurring subscription templates with cancel, and
// the one-time cost-sheet seed import (dry-run preview first).

import { useCallback, useEffect, useMemo, useState } from "react";
import { usd, parseDollarsToCents, shortDate, todayIso } from "./format";

type Category = { key: string; label: string; line: string };

type ExpenseItem = {
  id: string;
  vendor: string;
  description: string | null;
  category: string;
  amountCents: number;
  date: string;
  source: "manual" | "seed" | "recurring" | "affiliate_payout";
  editable: boolean;
};

type RecurringTemplate = {
  id: string;
  vendor: string;
  category: string;
  amountCents: number;
  dayOfMonth: number;
  startsOn: string;
  cancelledOn: string | null;
  note: string | null;
};

type ExpensesResponse = {
  ok?: boolean;
  migrationPending?: boolean;
  error?: string;
  from?: string;
  to?: string;
  items?: ExpenseItem[];
  recurringTemplates?: RecurringTemplate[];
  totalCents?: number;
  categories?: Category[];
};

const SOURCE_BADGE: Record<ExpenseItem["source"], { label: string; cls: string }> = {
  manual: { label: "Manual", cls: "bg-slate-100 text-slate-700" },
  seed: { label: "Imported", cls: "bg-sky-100 text-sky-700" },
  recurring: { label: "Recurring", cls: "bg-violet-100 text-violet-700" },
  affiliate_payout: { label: "Affiliate payout", cls: "bg-emerald-100 text-emerald-700" },
};

export default function ExpensesTab() {
  const year = todayIso().slice(0, 4);
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [data, setData] = useState<ExpensesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-expense form.
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("software_hosting");
  const [amount, setAmount] = useState("");
  const [incurredOn, setIncurredOn] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [asRecurring, setAsRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  const [seedBusy, setSeedBusy] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/finance/expenses?from=${from}&to=${to}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as ExpensesResponse;
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
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const addExpense = async () => {
    const cents = parseDollarsToCents(amount);
    if (!vendor.trim() || !cents) {
      setError("Enter a vendor and a positive dollar amount.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        asRecurring ? "/api/admin/finance/recurring" : "/api/admin/finance/expenses",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            asRecurring
              ? {
                  vendor,
                  category,
                  amountCents: cents,
                  dayOfMonth: Number(incurredOn.slice(8, 10)) <= 28 ? Number(incurredOn.slice(8, 10)) : 28,
                  startsOn: incurredOn,
                  note: description || null,
                }
              : { vendor, category, amountCents: cents, incurredOn, description: description || null },
          ),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not save.");
        return;
      }
      setVendor("");
      setAmount("");
      setDescription("");
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const deleteExpense = async (id: string) => {
    if (!window.confirm("Delete this expense?")) return;
    await fetch(`/api/admin/finance/expenses?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  };

  const cancelTemplate = async (t: RecurringTemplate) => {
    const date = window.prompt(
      "Stop this subscription from which date? (YYYY-MM-DD)",
      todayIso(),
    );
    if (!date) return;
    await fetch("/api/admin/finance/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, cancelledOn: date }),
    });
    await load();
  };

  const reactivateTemplate = async (t: RecurringTemplate) => {
    await fetch("/api/admin/finance/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, cancelledOn: null }),
    });
    await load();
  };

  const runSeed = async () => {
    setSeedBusy(true);
    setSeedMessage(null);
    try {
      const dryRes = await fetch("/api/admin/finance/expenses/seed?dry=1", { method: "POST" });
      const dry = (await dryRes.json()) as {
        wouldInsertExpenses?: unknown[];
        wouldInsertRecurring?: unknown[];
        error?: string;
      };
      if (!dryRes.ok) {
        setSeedMessage(dry.error ?? "Preview failed.");
        return;
      }
      const nExp = dry.wouldInsertExpenses?.length ?? 0;
      const nRec = dry.wouldInsertRecurring?.length ?? 0;
      if (nExp === 0 && nRec === 0) {
        setSeedMessage("Already imported: nothing new to add.");
        return;
      }
      if (
        !window.confirm(
          `Import ${nExp} recorded expenses and ${nRec} recurring subscriptions from the cost sheet?`,
        )
      ) {
        return;
      }
      const res = await fetch("/api/admin/finance/expenses/seed", { method: "POST" });
      const json = (await res.json()) as {
        insertedExpenses?: number;
        insertedRecurring?: number;
        error?: string;
      };
      if (!res.ok) {
        setSeedMessage(json.error ?? "Import failed.");
        return;
      }
      setSeedMessage(
        `Imported ${json.insertedExpenses ?? 0} expenses and ${json.insertedRecurring ?? 0} recurring subscriptions.`,
      );
      await load();
    } catch {
      setSeedMessage("Network error.");
    } finally {
      setSeedBusy(false);
    }
  };

  const templates = data?.recurringTemplates ?? [];
  const categories = data?.categories ?? [];

  const byMonth = useMemo(() => {
    const items = data?.items ?? [];
    const map = new Map<string, ExpenseItem[]>();
    for (const item of items) {
      const key = item.date.slice(0, 7);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [data]);

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
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
          <p className="pb-2 text-sm text-slate-600">
            Total: <span className="font-semibold text-slate-900">{usd(data?.totalCents ?? 0)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {seedMessage ? <p className="text-xs text-slate-600">{seedMessage}</p> : null}
          <button
            type="button"
            onClick={() => void runSeed()}
            disabled={seedBusy}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {seedBusy ? "Importing..." : "Import cost-sheet seed"}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Add expense</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-600">
            Vendor
            <input
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. Canva"
              className="mt-1 block w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Amount (USD)
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="20.00"
              className="mt-1 block w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            Date
            <input
              type="date"
              value={incurredOn}
              onChange={(e) => setIncurredOn(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex-1 text-xs text-slate-600">
            Note
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={asRecurring}
              onChange={(e) => setAsRecurring(e.target.checked)}
            />
            Repeats monthly
          </label>
          <button
            type="button"
            onClick={() => void addExpense()}
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Add"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
          Recurring subscriptions
        </h2>
        {templates.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">
            None yet. Add one with &quot;Repeats monthly&quot;, or run the cost-sheet import.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Vendor</th>
                <th className="px-4 py-2">Amount / mo</th>
                <th className="px-4 py-2">Since</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-900">{t.vendor}</td>
                  <td className="px-4 py-2 text-slate-700">{usd(t.amountCents)}</td>
                  <td className="px-4 py-2 text-slate-500">{shortDate(t.startsOn)}</td>
                  <td className="px-4 py-2">
                    {t.cancelledOn ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                        Cancelled {shortDate(t.cancelledOn)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {t.cancelledOn ? (
                      <button
                        type="button"
                        onClick={() => void reactivateTemplate(t)}
                        className="text-xs text-slate-600 hover:underline"
                      >
                        Reactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void cancelTemplate(t)}
                        className="text-xs text-rose-600 hover:underline"
                      >
                        Mark cancelled
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}

      {byMonth.map(([month, monthItems]) => (
        <div key={month} className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">{month}</h3>
            <p className="text-sm text-slate-600">
              {usd(monthItems.reduce((s, i) => s + i.amountCents, 0))}
            </p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {monthItems.map((item) => (
                <tr key={`${item.source}:${item.id}`} className="border-t border-slate-50">
                  <td className="px-4 py-2 text-slate-500">{shortDate(item.date)}</td>
                  <td className="px-4 py-2 text-slate-900">
                    {item.vendor}
                    {item.description ? (
                      <span className="ml-2 text-xs text-slate-400">{item.description}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${SOURCE_BADGE[item.source].cls}`}
                    >
                      {SOURCE_BADGE[item.source].label}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-slate-900">
                    {usd(item.amountCents)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {item.editable ? (
                      <button
                        type="button"
                        onClick={() => void deleteExpense(item.id)}
                        className="text-xs text-rose-600 hover:underline"
                      >
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
