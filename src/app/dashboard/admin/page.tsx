"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type SubscriptionsBlock = {
  byStatus: Record<string, number | null>;
  other: number | null;
  total: number | null;
  newThisMonth: number | null;
  trialCohort90d: number | null;
  trialConverted90d: number | null;
  conversionRate: number | null;
};

type OverviewResponse = {
  subscriptions?: SubscriptionsBlock;
  pendingAffiliates?: number | null;
  pendingTestimonials?: number | null;
  pendingCommunity?: number | null;
  webhookErrors24h?: number | null;
  error?: string;
};

type FunnelWeek = {
  weekStart: string;
  trialsStarted: number;
  trialsConverted: number | null;
  conversionRate: number | null;
  convertedThisWeek: number | null;
  codesMinted: number;
  codesRedeemed: number | null;
};

type FunnelResponse = {
  weeks?: FunnelWeek[];
  currentWeekStart?: string | null;
  migrationPending?: boolean;
  error?: string;
};

const STATUS_LABELS: { key: string; label: string; tone: string }[] = [
  { key: "active", label: "Active", tone: "text-emerald-600" },
  { key: "on_trial", label: "On trial", tone: "text-sky-600" },
  { key: "past_due", label: "Past due", tone: "text-amber-600" },
  { key: "paused", label: "Paused", tone: "text-slate-500" },
  { key: "cancelled", label: "Cancelled", tone: "text-rose-600" },
];

function num(n: number | null | undefined): string {
  return n === null || n === undefined ? "n/a" : n.toLocaleString("en-US");
}

function TrialFunnelSection() {
  const [loading, setLoading] = useState(true);
  const [funnel, setFunnel] = useState<FunnelResponse | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/reports/trial-funnel?weeks=12", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as FunnelResponse;
        if (alive) setFunnel(json);
      } catch {
        // section simply doesn't render on failure
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <p className="mt-8 text-sm text-slate-400">Loading trial funnel...</p>;
  if (!funnel?.weeks || funnel.weeks.length === 0) return null;

  // Newest week first reads better in a table.
  const weeks = [...funnel.weeks].reverse();
  const maxStarted = Math.max(1, ...weeks.map((w) => w.trialsStarted));

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
        Trial funnel, last 12 weeks
      </h2>
      {funnel.migrationPending ? (
        <p className="mt-1 text-xs text-amber-700">
          Conversion and redemption columns are not in prod yet: run
          20260704_trial_conversion_capture.sql in the Supabase SQL editor to light these up.
        </p>
      ) : null}
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Week of</th>
              <th className="px-4 py-3">Trials started</th>
              <th className="px-4 py-3">Converted (cohort)</th>
              <th className="px-4 py-3">Conversion</th>
              <th className="px-4 py-3">Codes minted</th>
              <th className="px-4 py-3">Codes redeemed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {weeks.map((w) => {
              const isCurrent = w.weekStart === funnel.currentWeekStart;
              return (
                <tr key={w.weekStart}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                    {w.weekStart}
                    {isCurrent ? <span className="ml-1 text-xs text-slate-400">(now)</span> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-8 font-medium text-slate-900">{w.trialsStarted}</span>
                      <span
                        className="h-2 rounded bg-sky-200"
                        style={{ width: `${Math.round((w.trialsStarted / maxStarted) * 120)}px` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{num(w.trialsConverted)}</td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {w.conversionRate === null
                      ? isCurrent
                        ? "in progress"
                        : "n/a"
                      : `${(w.conversionRate * 100).toFixed(0)}%`}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{w.codesMinted}</td>
                  <td className="px-4 py-2.5 text-slate-700">{num(w.codesRedeemed)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Cohort conversion counts a conversion in the week the trial STARTED; the current week&apos;s
        trials are still in progress.
      </p>
    </section>
  );
}

export default function AdminOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as OverviewResponse;
      if (!res.ok) {
        setFetchError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setData(json);
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

  const hasAnyBlock =
    data &&
    (data.subscriptions !== undefined ||
      data.pendingAffiliates !== undefined ||
      data.pendingTestimonials !== undefined ||
      data.pendingCommunity !== undefined ||
      data.webhookErrors24h !== undefined);

  if (forbidden || (data && !hasAnyBlock)) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Admin only</h1>
        <p className="mt-2 text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }

  const subs = data?.subscriptions;

  const queueTiles: { label: string; count: number | null | undefined; href: string }[] = [
    { label: "Affiliate applications", count: data?.pendingAffiliates, href: "/dashboard/admin/affiliates" },
    { label: "Testimonials to review", count: data?.pendingTestimonials, href: "/dashboard/admin/testimonials" },
    { label: "Community posts to review", count: data?.pendingCommunity, href: "/dashboard/admin/community" },
    { label: "Webhook errors (24h)", count: data?.webhookErrors24h, href: "/dashboard/admin/webhooks" },
  ].filter((t) => t.count !== undefined);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Overview</h1>
      <p className="mt-1 text-sm text-slate-600">
        A quick read on subscriptions and everything waiting on a decision.
      </p>

      {loading ? (
        <p className="mt-8 text-slate-500">Loading...</p>
      ) : fetchError ? (
        <p className="mt-8 text-rose-600">{fetchError}</p>
      ) : (
        <>
          {subs ? (
            <>
              <section className="mt-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
                  Subscriptions
                </h2>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {STATUS_LABELS.map((s) => {
                    const body = (
                      <>
                        <p className={`text-2xl font-bold ${s.tone}`}>{num(subs.byStatus[s.key])}</p>
                        <p className="mt-1 text-xs font-medium text-slate-500">{s.label}</p>
                      </>
                    );
                    // The Cancelled tile links to the full cancellations list, where
                    // each churned customer's automatic 3-month win-back comp shows.
                    if (s.key === "cancelled") {
                      return (
                        <Link
                          key={s.key}
                          href="/dashboard/admin/cancellations"
                          className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-rose-300 hover:shadow-sm"
                        >
                          {body}
                        </Link>
                      );
                    }
                    return (
                      <div key={s.key} className="rounded-xl border border-slate-200 bg-white p-4">
                        {body}
                      </div>
                    );
                  })}
                </div>
                {subs.other !== null && subs.other > 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Plus {num(subs.other)} in other states (e.g. expired).
                  </p>
                ) : null}
              </section>

              <section className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-2xl font-bold text-slate-900">{num(subs.newThisMonth)}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    New subscriptions this month (UTC)
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-2xl font-bold text-slate-900">
                    {subs.conversionRate === null
                      ? "n/a"
                      : `${(subs.conversionRate * 100).toFixed(1)}%`}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Trial-to-paid conversion, last 90 days
                    {subs.conversionRate === null ? " (needs the trial-conversion migration)" : ""}
                  </p>
                  {subs.conversionRate !== null ? (
                    <p className="mt-1 text-xs text-slate-400">
                      {num(subs.trialConverted90d)} of {num(subs.trialCohort90d)} completed trials
                    </p>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}

          {subs ? <TrialFunnelSection /> : null}

          {queueTiles.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
                Waiting on you
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {queueTiles.map((tile) => {
                  const urgent = typeof tile.count === "number" && tile.count > 0;
                  return (
                    <Link
                      key={tile.href + tile.label}
                      href={tile.href}
                      className={[
                        "rounded-xl border p-4 transition hover:shadow-sm",
                        urgent
                          ? "border-amber-300 bg-amber-50 hover:bg-amber-100"
                          : "border-slate-200 bg-white hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <p
                        className={[
                          "text-2xl font-bold",
                          urgent ? "text-amber-700" : "text-slate-900",
                        ].join(" ")}
                      >
                        {num(tile.count ?? null)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-500">{tile.label}</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
