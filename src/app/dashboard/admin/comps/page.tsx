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

  // "Grant a comp" form: mints a recipient-bound checkout link.
  const [grantEmail, setGrantEmail] = useState("");
  const [grantName, setGrantName] = useState("");
  const [grantMonths, setGrantMonths] = useState("3");
  const [grantPlan, setGrantPlan] = useState("monthly");
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantResult, setGrantResult] = useState<{ checkoutUrl: string; code: string; email: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

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

  const grantComp = async () => {
    setGrantError(null);
    setGrantResult(null);
    setCopied(false);
    const months = Number(grantMonths.trim());
    if (!grantEmail.trim()) {
      setGrantError("Enter the recipient's email.");
      return;
    }
    if (!Number.isInteger(months) || months < 1 || months > 36) {
      setGrantError("Free months must be a whole number between 1 and 36.");
      return;
    }
    setGranting(true);
    try {
      const res = await fetch("/api/admin/comps/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: grantEmail.trim(),
          name: grantName.trim() || undefined,
          months,
          plan: grantPlan,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        checkoutUrl?: string;
        code?: string;
        email?: string;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.checkoutUrl) {
        setGrantError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setGrantResult({
        checkoutUrl: json.checkoutUrl,
        code: json.code ?? "",
        email: json.email ?? grantEmail.trim(),
      });
      setGrantEmail("");
      setGrantName("");
      await load();
    } catch {
      setGrantError("Network error. Please retry.");
    } finally {
      setGranting(false);
    }
  };

  const copyLink = async () => {
    if (!grantResult) return;
    try {
      await navigator.clipboard.writeText(grantResult.checkoutUrl);
      setCopied(true);
    } catch {
      setCopied(false);
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

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">Grant a comp</h2>
        <p className="mt-1 text-sm text-slate-600">
          Creates a 100%-off checkout link tied to the recipient&rsquo;s own email. Send them the
          link: when they complete the free checkout, the subscription and license land on THEIR
          account. Do not check out yourself and forward the key - that binds the account to you.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Recipient email</span>
            <input
              type="email"
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              placeholder="kay@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Name (optional)</span>
            <input
              type="text"
              value={grantName}
              onChange={(e) => setGrantName(e.target.value)}
              placeholder="Kay"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Free months</span>
            <input
              type="number"
              min={1}
              max={36}
              value={grantMonths}
              onChange={(e) => setGrantMonths(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Plan</span>
            <select
              value={grantPlan}
              onChange={(e) => setGrantPlan(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="monthly">Solo Monthly</option>
              <option value="team-monthly">Team Monthly</option>
              <option value="agency-monthly">Agency Monthly</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => void grantComp()}
            disabled={granting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {granting ? "Creating..." : "Create comp link"}
          </button>
          {grantError ? <span className="text-sm text-rose-600">{grantError}</span> : null}
        </div>

        {grantResult ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
            <p className="font-medium text-emerald-800">
              Comp link ready for {grantResult.email} (code {grantResult.code}). Send this link to
              them:
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={grantResult.checkoutUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-md border border-emerald-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-700"
              />
              <button
                onClick={() => void copyLink()}
                className="shrink-0 rounded-md border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        <p className="font-semibold text-slate-700">Issuing comps by hand in Lemon Squeezy?</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            Prefer &ldquo;Grant a comp&rdquo; above - it binds the comp to the recipient&rsquo;s
            account automatically. Only do it by hand when you need an annual plan for a full year.
          </li>
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
          <li>
            Have the RECIPIENT complete the checkout with their own email (or send them the code) -
            never check out yourself and forward the key.
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
