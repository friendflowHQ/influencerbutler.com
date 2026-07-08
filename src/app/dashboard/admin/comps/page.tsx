"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CompState =
  | "unknown-months"
  | "expired"
  | "expiring-7"
  | "expiring-30"
  | "active"
  | "cancelled";

type CompRow = {
  lsSubscriptionId: string;
  userId: string | null;
  email: string | null;
  name: string | null;
  discountCode: string | null;
  months: number | null;
  monthsSource: "parsed" | "manual" | null;
  issuedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  subscriptionStatus: string | null;
  renewsAt: string | null;
  licenseStatus: string | null;
  state: CompState;
  cancelledAt: string | null;
  warn7SentAt: string | null;
  warn1SentAt: string | null;
};

type ListResponse = {
  rows?: CompRow[];
  migrationPending?: boolean;
  error?: string;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "needs-months", label: "Needs months" },
  { key: "expiring-7", label: "Expiring ≤ 7d" },
  { key: "expiring-30", label: "Expiring ≤ 30d" },
  { key: "expired", label: "Expired, still live" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function shortDate(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function daysChip(row: CompRow): string {
  if (row.state === "cancelled") return "bg-slate-100 text-slate-500";
  if (row.state === "unknown-months") return "bg-amber-100 text-amber-700";
  const d = row.daysRemaining ?? 0;
  if (d <= 0) return "bg-rose-100 text-rose-700";
  if (d <= 7) return "bg-orange-100 text-orange-700";
  if (d <= 30) return "bg-yellow-100 text-yellow-800";
  return "bg-emerald-100 text-emerald-700";
}

function daysLabel(row: CompRow): string {
  if (row.state === "cancelled") return "cancelled";
  if (row.state === "unknown-months") return "set months";
  const d = row.daysRemaining;
  if (d == null) return "-";
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "today";
  return `${d}d left`;
}

export default function AdminCompsPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [rows, setRows] = useState<CompRow[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/comps", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as ListResponse;
      if (!res.ok) {
        setFetchError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setRows(json.rows ?? []);
      setMigrationPending(json.migrationPending === true);
    } catch (err) {
      console.error(err);
      setFetchError("Network error. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "needs-months":
        return rows.filter((r) => r.state === "unknown-months");
      case "expiring-7":
        return rows.filter((r) => r.state === "expiring-7");
      case "expiring-30":
        return rows.filter((r) => r.state === "expiring-7" || r.state === "expiring-30");
      case "expired":
        return rows.filter((r) => r.state === "expired");
      default:
        return rows;
    }
  }, [rows, filter]);

  const cancelNow = async (row: CompRow) => {
    const who = row.email ?? row.name ?? row.lsSubscriptionId;
    if (
      !window.confirm(
        `Cancel the subscription for ${who}? It ends at the current period, they drop to Free, and your card is not charged again.`,
      )
    ) {
      return;
    }
    setBusyId(row.lsSubscriptionId);
    try {
      const res = await fetch("/api/admin/comps/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lsSubscriptionId: row.lsSubscriptionId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        window.alert(json.error ?? "Cancel failed.");
        return;
      }
      await load();
    } catch {
      window.alert("Network error cancelling. Please retry.");
    } finally {
      setBusyId(null);
    }
  };

  const setMonths = async (row: CompRow) => {
    const raw = window.prompt(
      `Free months for ${row.email ?? row.name ?? "this comp"} (code ${row.discountCode ?? "?"})?`,
      row.months != null ? String(row.months) : "",
    );
    if (raw == null) return;
    const months = Number(raw.trim());
    if (!Number.isInteger(months) || months < 1 || months > 36) {
      window.alert("Enter a whole number of months between 1 and 36.");
      return;
    }
    setBusyId(row.lsSubscriptionId);
    try {
      const res = await fetch("/api/admin/comps/set-months", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lsSubscriptionId: row.lsSubscriptionId, months }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        window.alert(json.error ?? "Could not save.");
        return;
      }
      await load();
    } catch {
      window.alert("Network error saving. Please retry.");
    } finally {
      setBusyId(null);
    }
  };

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Admin only</h1>
        <p className="mt-2 text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Comps</h1>
      <p className="mt-1 text-sm text-slate-600">
        Subscriptions started with a free-comp discount code, with the code used and when the free
        window ends. The daily job emails you before each one expires and cancels it at expiry so
        your card is not charged. Cancelling drops the user to Free; the license is not revoked.
      </p>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        <p className="font-semibold text-slate-700">For accurate tracking, going forward:</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            Name codes <code className="rounded bg-white px-1 py-0.5">NAMEFREE#M</code> - e.g.{" "}
            <code className="rounded bg-white px-1 py-0.5">CAREESEFREE3M</code>,{" "}
            <code className="rounded bg-white px-1 py-0.5">BRANDONFREE12M</code>. Uppercase, no
            hyphens (Lemon Squeezy rejects them). Codes that do not encode a duration show
            &ldquo;set months&rdquo; for you to fill in.
          </li>
          <li>
            Create each discount as <strong>100% off, Duration = Repeating for N months</strong> (or
            use an annual plan for a year). A one-time 100% code on a monthly plan still bills your
            card from month 2.
          </li>
        </ul>
      </div>

      {migrationPending ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Some data is unavailable until the <code>20260711_comp_grants.sql</code> migration (and
          the discount-capture columns) are applied in Supabase. Manual overrides and expiry
          automation need that table; the list still shows what it can.
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={[
              "rounded-full px-3 py-1.5 text-sm font-medium transition",
              filter === f.key
                ? "bg-indigo-600 text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-slate-500">
          {filtered.length} {filtered.length === 1 ? "comp" : "comps"}
        </span>
      </div>

      {loading ? (
        <p className="mt-8 text-slate-500">Loading...</p>
      ) : fetchError ? (
        <p className="mt-8 text-rose-600">{fetchError}</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-slate-500">No comps in this view.</p>
      ) : (
        <section className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Months</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Remaining</th>
                <th className="px-4 py-3">Subscription</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => {
                const busy = busyId === row.lsSubscriptionId;
                const done = row.state === "cancelled";
                return (
                  <tr key={row.lsSubscriptionId} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.email ?? "(no email)"}</div>
                      {row.name ? <div className="text-xs text-slate-500">{row.name}</div> : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {row.discountCode ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      {row.months != null ? (
                        <span className="text-slate-700">
                          {row.months}
                          {row.monthsSource === "manual" ? (
                            <span className="ml-1 text-xs text-indigo-500">(manual)</span>
                          ) : null}
                        </span>
                      ) : (
                        <button
                          onClick={() => void setMonths(row)}
                          disabled={busy}
                          className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-200 disabled:opacity-50"
                        >
                          set
                        </button>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {shortDate(row.issuedAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {shortDate(row.expiresAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${daysChip(row)}`}
                      >
                        {daysLabel(row)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700">{row.subscriptionStatus ?? "-"}</div>
                      {row.renewsAt ? (
                        <div className="text-xs text-slate-400">
                          renews {shortDate(row.renewsAt)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {done ? (
                        <span className="text-xs text-slate-400">done</span>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          {row.months != null ? (
                            <button
                              onClick={() => void setMonths(row)}
                              disabled={busy}
                              className="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50"
                            >
                              edit months
                            </button>
                          ) : null}
                          <button
                            onClick={() => void cancelNow(row)}
                            disabled={busy}
                            className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            {busy ? "..." : "Cancel now"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
