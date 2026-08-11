"use client";

import { useCallback, useEffect, useState } from "react";

type WinbackStatus = {
  tiersSent: number;
  lastTier: number | null;
  claimed: boolean;
  discountCode: string | null;
};

type Row = {
  id: string;
  createdAt: string;
  reason: string;
  reasonLabel: string;
  feedback: string | null;
  intendedOutcome: string | null;
  wouldReturn: string | null;
  source: string;
  planName: string | null;
  emailMasked: string | null;
  completed: boolean;
  winback: WinbackStatus | null;
};

type LabelOption = { value: string; label: string };

type CompState =
  | "unknown-months"
  | "forever"
  | "expired"
  | "expiring-7"
  | "expiring-30"
  | "active"
  | "cancelled";

type CompTracking = {
  code: string | null;
  months: number | null;
  issuedAt: string | null;
  expiresAt: string | null;
  daysIn: number | null;
  daysLeft: number | null;
  state: CompState;
  activated: boolean;
  activatedAt: string | null;
  lastSeenAt: string | null;
};

type CancelledCustomerRow = {
  lsSubscriptionId: string;
  emailMasked: string | null;
  planName: string | null;
  cancelledAt: string;
  reason: string | null;
  reasonLabel: string | null;
  wouldReturn: string | null;
  comp: CompTracking | null;
  reactivated: boolean;
  wonBackViaComp: boolean;
};

type CancellationMetrics = {
  totalCancelled: number;
  distinctCustomers: number;
  compsGranted: number;
  compsPending: number;
  compsActivated: number;
  compActivationRate: number;
  reactivations: number;
  reactivationRate: number;
  wonBackViaComp: number;
  winBackConversionRate: number;
  expiring7: number;
  expiring30: number;
  expiredNoReturn: number;
  avgDaysIn: number | null;
  avgDaysLeft: number | null;
  funnel: { cancelled: number; compSent: number; compActivated: number; wonBack: number };
};

type Dashboard = { rows: CancelledCustomerRow[]; metrics: CancellationMetrics };

type Summary = {
  total: number;
  answered: number;
  emailPending: number;
  unsurveyedEnded: number;
  reasonCounts: Record<string, number>;
  wouldReturnCounts: Record<string, number>;
};

type Response = {
  admin?: { email: string };
  rows?: Row[];
  dashboard?: Dashboard;
  summary?: Summary;
  labels?: { reasons: LabelOption[]; wouldReturn: LabelOption[] };
  error?: string;
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function formatDay(iso: string): string {
  if (!iso) return "unknown";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function labelFor(options: LabelOption[], value: string | null): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? value;
}

function WinbackBadge({ winback }: { winback: WinbackStatus | null }) {
  if (!winback) return null;
  if (winback.claimed) {
    return (
      <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
        won back
      </span>
    );
  }
  if (winback.tiersSent > 0) {
    return (
      <span className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
        win-back sent{winback.lastTier ? ` (t${winback.lastTier})` : ""}
        {winback.discountCode ? ` · ${winback.discountCode}` : ""}
      </span>
    );
  }
  return null;
}

const STATE_STYLE: Record<CompState, { label: string; cls: string }> = {
  active: { label: "active", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  "expiring-7": { label: "expires <7d", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  "expiring-30": { label: "expiring", cls: "border-sky-200 bg-sky-50 text-sky-700" },
  expired: { label: "expired", cls: "border-rose-200 bg-rose-50 text-rose-700" },
  cancelled: { label: "ended", cls: "border-slate-200 bg-slate-50 text-slate-500" },
  forever: { label: "forever", cls: "border-violet-200 bg-violet-50 text-violet-700" },
  "unknown-months": { label: "unknown", cls: "border-slate-200 bg-slate-50 text-slate-500" },
};

function CompStateBadge({ comp }: { comp: CompTracking | null }) {
  if (!comp) {
    return (
      <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
        no comp yet
      </span>
    );
  }
  const s = STATE_STYLE[comp.state];
  return (
    <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
  );
}

function WinBadge({ row }: { row: CancelledCustomerRow }) {
  if (row.wonBackViaComp) {
    return (
      <span className="rounded border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
        won back ✓
      </span>
    );
  }
  if (row.reactivated) {
    return (
      <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
        reactivated
      </span>
    );
  }
  return <span className="text-slate-300">-</span>;
}

function MetricCard({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "slate" | "emerald" | "amber" | "indigo";
}) {
  const toneCls: Record<string, string> = {
    slate: "border-slate-200 bg-white text-slate-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
  };
  const labelCls: Record<string, string> = {
    slate: "text-slate-500",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    indigo: "text-indigo-700",
  };
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneCls[tone]}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${labelCls[tone]}`}>{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function FunnelRow({ label, count, total, tone }: { label: string; count: number; total: number; tone: string }) {
  const width = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 flex-none text-sm text-slate-600">{label}</span>
      <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100">
        <div
          className={`flex h-6 items-center rounded px-2 text-xs font-semibold text-white ${tone}`}
          style={{ width: `${Math.max(width, count > 0 ? 8 : 0)}%` }}
        >
          {count > 0 ? count : ""}
        </div>
      </div>
      <span className="w-16 flex-none text-right text-sm tabular-nums text-slate-500">{width}%</span>
    </div>
  );
}

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const p = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 flex-none text-sm text-slate-600">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-[#f97316]" style={{ width: `${p}%` }} />
      </div>
      <span className="w-16 flex-none text-right text-sm tabular-nums text-slate-500">
        {count} ({p}%)
      </span>
    </div>
  );
}

export default function AdminCancellationsPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [labels, setLabels] = useState<{ reasons: LabelOption[]; wouldReturn: LabelOption[] }>({
    reasons: [],
    wouldReturn: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/cancellations", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as Response;
      if (!res.ok) {
        setFetchError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setRows(json.rows ?? []);
      setDashboard(json.dashboard ?? null);
      setSummary(json.summary ?? null);
      if (json.labels) setLabels(json.labels);
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

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Admin only</h1>
        <p className="mt-2 text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }

  const m = dashboard?.metrics ?? null;
  const custRows = dashboard?.rows ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cancellations</h1>
      <p className="mt-1 text-sm text-slate-600">
        Who cancelled, whether the automatic 3-month win-back comp went out, how far into it they
        are, and whether we won them back to a paying plan. Every cancelled customer is auto-sent a
        free 3-month Pro comp a few days after they cancel: no action needed.
      </p>

      {loading ? (
        <p className="mt-8 text-slate-500">Loading...</p>
      ) : fetchError ? (
        <p className="mt-8 text-rose-600">{fetchError}</p>
      ) : (
        <>
          {/* Win-back metrics: the dashboard */}
          {m ? (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <MetricCard label="Cancelled" value={m.totalCancelled} sub={`${m.distinctCustomers} customers`} />
              <MetricCard
                label="Comps sent"
                value={m.compsGranted}
                sub={`${m.compsPending} pending`}
                tone="indigo"
              />
              <MetricCard
                label="Comp activation"
                value={pct(m.compActivationRate)}
                sub={`${m.compsActivated} activated`}
                tone="indigo"
              />
              <MetricCard
                label="Won back"
                value={m.wonBackViaComp}
                sub={`${m.reactivations} total reactivated`}
                tone="emerald"
              />
              <MetricCard
                label="Win-back rate"
                value={pct(m.winBackConversionRate)}
                sub="of comps sent"
                tone="emerald"
              />
              <MetricCard
                label="Expiring soon"
                value={m.expiring7 + m.expiring30}
                sub={`${m.expiring7} within 7d`}
                tone="amber"
              />
            </div>
          ) : null}

          {/* Win-back funnel */}
          {m && m.funnel.cancelled > 0 ? (
            <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
                Win-back funnel
              </h2>
              <div className="mt-4 space-y-2">
                <FunnelRow label="Cancelled" count={m.funnel.cancelled} total={m.funnel.cancelled} tone="bg-slate-400" />
                <FunnelRow label="Comp sent" count={m.funnel.compSent} total={m.funnel.cancelled} tone="bg-indigo-500" />
                <FunnelRow label="Comp activated" count={m.funnel.compActivated} total={m.funnel.cancelled} tone="bg-indigo-600" />
                <FunnelRow label="Won back (paid)" count={m.funnel.wonBack} total={m.funnel.cancelled} tone="bg-emerald-600" />
              </div>
              {m.avgDaysIn != null || m.avgDaysLeft != null ? (
                <p className="mt-3 text-xs text-slate-500">
                  Active comps average{" "}
                  {m.avgDaysIn != null ? <span className="font-medium">{m.avgDaysIn} days in</span> : null}
                  {m.avgDaysIn != null && m.avgDaysLeft != null ? ", " : ""}
                  {m.avgDaysLeft != null ? <span className="font-medium">{m.avgDaysLeft} days left</span> : null}
                  {". "}
                  {m.expiredNoReturn > 0 ? `${m.expiredNoReturn} comps lapsed without a return.` : ""}
                </p>
              ) : null}
            </section>
          ) : null}

          {/* Per-customer tracking table */}
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
              Cancelled customers{m ? ` (${m.totalCancelled})` : ""}
            </h2>
            {custRows.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No cancelled subscriptions.</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Plan</th>
                      <th className="px-3 py-2">Cancelled</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2">Comp</th>
                      <th className="px-3 py-2 text-right">Days in</th>
                      <th className="px-3 py-2 text-right">Days left</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Activated</th>
                      <th className="px-3 py-2">Win</th>
                    </tr>
                  </thead>
                  <tbody>
                    {custRows.map((r) => {
                      const atRisk = r.comp?.state === "expiring-7" && !r.reactivated;
                      return (
                        <tr
                          key={r.lsSubscriptionId}
                          className={`border-b border-slate-50 last:border-0 ${
                            r.wonBackViaComp ? "bg-emerald-50/40" : atRisk ? "bg-amber-50/50" : ""
                          }`}
                        >
                          <td className="px-3 py-2 text-slate-700">{r.emailMasked ?? "unknown"}</td>
                          <td className="px-3 py-2 text-slate-500">{r.planName ?? "-"}</td>
                          <td className="px-3 py-2 text-slate-500">{formatDay(r.cancelledAt)}</td>
                          <td className="px-3 py-2 text-slate-500">{r.reasonLabel ?? "-"}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {r.comp ? (
                              <span className="font-mono text-[11px] text-slate-600">
                                {r.comp.code ?? "comp"}
                                {r.comp.months != null ? ` · ${r.comp.months}mo` : ""}
                              </span>
                            ) : (
                              <span className="text-slate-400">pending</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                            {r.comp?.daysIn ?? "-"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                            {r.comp?.daysLeft == null
                              ? "-"
                              : r.comp.daysLeft < 0
                                ? "expired"
                                : r.comp.daysLeft}
                          </td>
                          <td className="px-3 py-2">
                            <CompStateBadge comp={r.comp} />
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {r.comp ? (r.comp.activated ? "yes" : "no") : "-"}
                          </td>
                          <td className="px-3 py-2">
                            <WinBadge row={r} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Survey breakdowns */}
          {summary && summary.answered > 0 ? (
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
                  Reasons
                </h2>
                <div className="mt-4 space-y-2">
                  {labels.reasons.map((r) => (
                    <Bar
                      key={r.value}
                      label={r.label}
                      count={summary.reasonCounts[r.value] ?? 0}
                      total={summary.answered}
                    />
                  ))}
                </div>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
                  Likely to come back
                </h2>
                <div className="mt-4 space-y-2">
                  {labels.wouldReturn.map((o) => (
                    <Bar
                      key={o.value}
                      label={o.label}
                      count={summary.wouldReturnCounts[o.value] ?? 0}
                      total={summary.answered}
                    />
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {/* Survey detail list */}
          <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
              Survey answers
            </h2>
            {summary ? (
              <span className="text-xs text-slate-500">
                {summary.answered} answered
                {summary.emailPending > 0 ? `, ${summary.emailPending} awaiting reply` : ""}
                {summary.unsurveyedEnded > 0 ? `, ${summary.unsurveyedEnded} cancelled with no reason` : ""}
              </span>
            ) : null}
          </div>
          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No cancellation answers yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {rows.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <strong className="text-sm text-slate-900">{r.reasonLabel}</strong>
                      {r.wouldReturn ? (
                        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          Return: {labelFor(labels.wouldReturn, r.wouldReturn)}
                        </span>
                      ) : null}
                      <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                        {r.source === "email" ? "emailed" : "in-app"}
                      </span>
                      {r.source === "email" && !r.completed ? (
                        <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          awaiting reply
                        </span>
                      ) : null}
                      <WinbackBadge winback={r.winback} />
                    </div>
                    <span className="text-xs text-slate-400">{formatDate(r.createdAt)}</span>
                  </div>

                  {r.intendedOutcome ? (
                    <p className="mt-2 text-sm text-slate-700">
                      <span className="font-medium text-slate-500">Wanted to: </span>
                      {r.intendedOutcome}
                    </p>
                  ) : null}
                  {r.feedback ? (
                    <p className="mt-1 text-sm text-slate-700">&ldquo;{r.feedback}&rdquo;</p>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-400">
                    {[r.emailMasked, r.planName].filter(Boolean).join(" · ") || "no account details"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
