"use client";

import { useCallback, useEffect, useState } from "react";

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
};

type LabelOption = { value: string; label: string };

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

function labelFor(options: LabelOption[], value: string | null): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? value;
}

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 flex-none text-sm text-slate-600">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-[#f97316]" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 flex-none text-right text-sm tabular-nums text-slate-500">
        {count} ({pct}%)
      </span>
    </div>
  );
}

export default function AdminCancellationsPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
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

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cancellations</h1>
      <p className="mt-1 text-sm text-slate-600">
        Why subscribers cancel, what they were hoping to accomplish, and whether they might come
        back. Answers come from the in-app cancel flow and the follow-up survey we email people who
        cancel on the payment provider&apos;s side.
      </p>

      {loading ? (
        <p className="mt-8 text-slate-500">Loading...</p>
      ) : fetchError ? (
        <p className="mt-8 text-rose-600">{fetchError}</p>
      ) : (
        <>
          {/* Summary cards */}
          {summary ? (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Answers collected
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{summary.answered}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Awaiting email reply
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{summary.emailPending}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Cancelled, no reason
                </div>
                <div className="mt-1 text-2xl font-bold text-amber-800">
                  {summary.unsurveyedEnded}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total records
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{summary.total}</div>
              </div>
            </div>
          ) : null}

          {/* Breakdowns */}
          {summary && summary.answered > 0 ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
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

          {/* Detail list */}
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-slate-700">
            Recent cancellations
          </h2>
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
