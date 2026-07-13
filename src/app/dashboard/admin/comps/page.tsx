"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CompState =
  | "unknown-months"
  | "forever"
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
  source: "in_house" | "lemonsqueezy";
  licenseKey: string | null;
  activatedAt: string | null;
  lastSeenAt: string | null;
  seats: number | null;
  issuedByAffiliateId: string | null;
  issuedByAffiliateName: string | null;
  issuedByAffiliateEmail: string | null;
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

// Default seat count per plan (Solo 1 / Team 10 / Agency 25, Daily Deals 1).
// Mirrors SEAT_LIMIT server-side; used only to prefill the editable Seats field.
const PLAN_DEFAULT_SEATS: Record<string, number> = {
  monthly: 1,
  "team-monthly": 10,
  "agency-monthly": 25,
  "daily-deals-addon": 1,
};

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

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// The "Activated" cell: has the comped user actually turned on their license?
// Only in-house comps report this (they validate through our endpoint).
function ActivationCell({ row }: { row: CompRow }) {
  if (row.source !== "in_house") return <span className="text-slate-400">-</span>;
  if (!row.activatedAt && !row.lastSeenAt) {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
        Not activated
      </span>
    );
  }
  return (
    <div>
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        Active
      </span>
      {row.lastSeenAt ? (
        <div className="mt-0.5 text-xs text-slate-400">seen {relativeTime(row.lastSeenAt)}</div>
      ) : null}
    </div>
  );
}

function daysChip(row: CompRow): string {
  if (row.state === "cancelled") return "bg-slate-100 text-slate-500";
  if (row.state === "forever") return "bg-indigo-100 text-indigo-700";
  if (row.state === "unknown-months") return "bg-amber-100 text-amber-700";
  const d = row.daysRemaining ?? 0;
  if (d <= 0) return "bg-rose-100 text-rose-700";
  if (d <= 7) return "bg-orange-100 text-orange-700";
  if (d <= 30) return "bg-yellow-100 text-yellow-800";
  return "bg-emerald-100 text-emerald-700";
}

function daysLabel(row: CompRow): string {
  if (row.state === "cancelled") return "cancelled";
  if (row.state === "forever") return "forever";
  if (row.state === "unknown-months") return "set months";
  const d = row.daysRemaining;
  if (d == null) return "-";
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "today";
  return `${d}d left`;
}

// A compact, click-to-copy license key cell. Shows a shortened form; the full
// key is in the title and copied on click.
function KeyCell({ value }: { value: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-slate-400">-</span>;
  const short = value.length > 13 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
  return (
    <button
      type="button"
      title={`${value} (click to copy)`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="font-mono text-xs text-slate-600 hover:text-indigo-600"
    >
      {copied ? "Copied" : short}
    </button>
  );
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
  const [grantForever, setGrantForever] = useState(false);
  const [grantSeats, setGrantSeats] = useState("1");
  const [grantAllowExisting, setGrantAllowExisting] = useState(false);
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantResult, setGrantResult] = useState<{
    key: string;
    email: string | null;
    expiresAt: string | null;
    forever: boolean;
    seats: number | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // "Backfill from Lemon Squeezy" one-off maintenance action.
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

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
    const seats = Number(grantSeats.trim());
    if (!grantForever && (!Number.isInteger(months) || months < 1 || months > 36)) {
      setGrantError("Free months must be a whole number between 1 and 36, or mark it forever.");
      return;
    }
    if (!Number.isInteger(seats) || seats < 1 || seats > 100) {
      setGrantError("Seats must be a whole number between 1 and 100.");
      return;
    }
    setGranting(true);
    try {
      const res = await fetch("/api/admin/comps/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: grantEmail.trim() || undefined,
          name: grantName.trim() || undefined,
          months: grantForever ? null : months,
          forever: grantForever,
          seats,
          plan: grantPlan,
          allowExisting: grantAllowExisting,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        key?: string;
        email?: string | null;
        expiresAt?: string;
        forever?: boolean;
        activationLimit?: number;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.key) {
        setGrantError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setGrantResult({
        key: json.key,
        email: json.email ?? (grantEmail.trim() || null),
        expiresAt: json.expiresAt ?? null,
        forever: json.forever === true,
        seats: typeof json.activationLimit === "number" ? json.activationLimit : seats,
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

  // Changing the plan resets Seats to that plan's default (admin can re-edit).
  const changePlan = (plan: string) => {
    setGrantPlan(plan);
    const def = PLAN_DEFAULT_SEATS[plan];
    if (typeof def === "number") setGrantSeats(String(def));
  };

  const copyKey = async () => {
    if (!grantResult) return;
    try {
      await navigator.clipboard.writeText(grantResult.key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const runBackfill = async () => {
    setBackfillMsg(null);
    setBackfilling(true);
    try {
      const res = await fetch("/api/admin/comps/backfill", { method: "POST" });
      const json = (await res.json()) as {
        ok?: boolean;
        created?: number;
        toCreate?: number;
        redemptionsScanned?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setBackfillMsg(json.error ?? `Backfill failed (${res.status})`);
        return;
      }
      setBackfillMsg(
        `Backfill complete: added ${json.created ?? 0} comp${(json.created ?? 0) === 1 ? "" : "s"} (scanned ${json.redemptionsScanned ?? 0} redemptions).`,
      );
      await load();
    } catch {
      setBackfillMsg("Network error running backfill. Please retry.");
    } finally {
      setBackfilling(false);
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
          Mints a license key and Pro access for the recipient right here, entirely in Supabase (no
          Lemon Squeezy). The key is emailed to them with a download and sign-in link, and shown
          below for you to copy. It auto-cancels at the end of the free window, unless you mark it
          forever. Seats set how many devices can use the key at once.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Recipient email (optional)</span>
            <input
              type="email"
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              placeholder="kay@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <span className="mt-1.5 block text-xs font-normal text-slate-500">
              Leave blank to mint an unassigned key you copy and hand out. It is not emailed.
            </span>
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
              value={grantForever ? "" : grantMonths}
              disabled={grantForever}
              placeholder={grantForever ? "Forever" : undefined}
              onChange={(e) => setGrantMonths(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            />
            <span className="mt-1.5 flex items-center gap-2 text-xs font-normal text-slate-600">
              <input
                type="checkbox"
                checked={grantForever}
                onChange={(e) => setGrantForever(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              Never expires (forever free)
            </span>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Plan</span>
            <select
              value={grantPlan}
              onChange={(e) => changePlan(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="monthly">Solo Monthly</option>
              <option value="team-monthly">Team Monthly</option>
              <option value="agency-monthly">Agency Monthly</option>
              <option value="daily-deals-addon">Daily Deals Workspace (add-on)</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Seats (devices at once)</span>
            <input
              type="number"
              min={1}
              max={100}
              value={grantSeats}
              onChange={(e) => setGrantSeats(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <span className="mt-1.5 block text-xs font-normal text-slate-500">
              Defaults to the plan&rsquo;s seat count; lower it to restrict the key.
            </span>
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-xs font-normal text-slate-600">
          <input
            type="checkbox"
            checked={grantAllowExisting}
            onChange={(e) => setGrantAllowExisting(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          Grant even if this account already has a subscription (stacks a second comp)
        </label>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => void grantComp()}
            disabled={granting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {granting ? "Minting..." : "Mint comp"}
          </button>
          {grantError ? <span className="text-sm text-rose-600">{grantError}</span> : null}
        </div>

        {grantResult ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
            <p className="font-medium text-emerald-800">
              {grantResult.email
                ? `Comp minted for ${grantResult.email} and emailed to them. Their license key:`
                : "Unassigned comp minted. Copy the key and hand it out:"}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={grantResult.key}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-md border border-emerald-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-700"
              />
              <button
                onClick={() => void copyKey()}
                className="shrink-0 rounded-md border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-xs text-emerald-700">
              {grantResult.forever
                ? "Never expires (forever free)."
                : grantResult.expiresAt
                  ? `Free window ends ${shortDate(grantResult.expiresAt)}.`
                  : ""}
              {grantResult.seats != null
                ? ` ${grantResult.seats} device${grantResult.seats === 1 ? "" : "s"} allowed at once.`
                : ""}
            </p>
          </div>
        ) : null}
      </section>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        <p className="font-semibold text-slate-700">Older comps missing from the list?</p>
        <p className="mt-1">
          Comps issued in Lemon Squeezy before we started capturing discount data do not show up
          automatically. Run the backfill once to reconstruct them from Lemon Squeezy. New comps
          minted with &ldquo;Grant a comp&rdquo; above appear immediately.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => void runBackfill()}
            disabled={backfilling}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {backfilling ? "Backfilling..." : "Backfill from Lemon Squeezy"}
          </button>
          {backfillMsg ? <span className="text-slate-600">{backfillMsg}</span> : null}
        </div>
      </div>

      {migrationPending ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Some data is unavailable until the <code>20260711_comp_grants.sql</code> and{" "}
          <code>20260712_comp_grants_inhouse.sql</code> migrations (and the discount-capture
          columns) are applied in Supabase. Overrides, in-house comps, and expiry automation need
          those; the list still shows what it can.
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
          <table className="w-full min-w-[1250px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Months</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Remaining</th>
                <th className="px-4 py-3">Subscription</th>
                <th className="px-4 py-3">Activated</th>
                <th className="px-4 py-3">License key</th>
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
                      {row.issuedByAffiliateId ? (
                        <div className="mt-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          Issued by{" "}
                          {row.issuedByAffiliateName ?? row.issuedByAffiliateEmail ?? "an affiliate"}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.source === "in_house"
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.source === "in_house" ? "In-house" : "Lemon Squeezy"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {row.discountCode ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      {row.state === "forever" ? (
                        <span className="font-medium text-indigo-600">Forever</span>
                      ) : row.months != null ? (
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
                    <td className="px-4 py-3">
                      <ActivationCell row={row} />
                    </td>
                    <td className="px-4 py-3">
                      <KeyCell value={row.licenseKey} />
                      {row.seats != null ? (
                        <div className="mt-0.5 text-xs text-slate-400">
                          {row.seats} seat{row.seats === 1 ? "" : "s"}
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
