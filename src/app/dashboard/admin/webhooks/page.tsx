"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

type EventRow = {
  id: string;
  source: string;
  event_name: string | null;
  record_id: string | null;
  user_hint: string | null;
  status: "processed" | "error" | "skipped" | string;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
};

type ListResponse = {
  rows?: EventRow[];
  total?: number;
  page?: number;
  pageSize?: number;
  errorCount7d?: number;
  tableMissing?: boolean;
  error?: string;
};

type DetailResponse = {
  row?: (EventRow & { payload?: unknown }) | null;
  error?: string;
};

const STATUS_FILTERS = ["all", "processed", "error", "skipped"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function statusChip(status: string): string {
  switch (status) {
    case "processed":
      return "bg-emerald-100 text-emerald-700";
    case "error":
      return "bg-rose-100 text-rose-700";
    case "skipped":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function AdminWebhooksPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [errorCount7d, setErrorCount7d] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payloads, setPayloads] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      params.set("page", String(page));
      const res = await fetch(`/api/admin/webhooks/list?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as ListResponse;
      if (!res.ok) {
        setFetchError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setTableMissing(json.tableMissing === true);
      setRows(json.rows ?? []);
      setTotal(json.total ?? 0);
      setErrorCount7d(json.errorCount7d ?? 0);
      if (json.pageSize) setPageSize(json.pageSize);
    } catch (err) {
      console.error(err);
      setFetchError("Network error. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!payloads[id]) {
      try {
        const res = await fetch(`/api/admin/webhooks/list?id=${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as DetailResponse;
        const text = json.row?.payload
          ? JSON.stringify(json.row.payload, null, 2)
          : "No payload stored.";
        setPayloads((p) => ({ ...p, [id]: text }));
      } catch {
        setPayloads((p) => ({ ...p, [id]: "Could not load payload." }));
      }
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Admin only</h1>
        <p className="mt-2 text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Webhook deliveries</h1>
        {errorCount7d > 0 ? (
          <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
            {errorCount7d} {errorCount7d === 1 ? "error" : "errors"} this week
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Every verified Lemon Squeezy delivery, with processing outcome. Multiple rows per record are
        normal: Lemon Squeezy re-sends are logged individually.
      </p>

      {tableMissing ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          The webhook_events table does not exist yet. Run the
          20260704_webhook_events.sql migration in the Supabase SQL editor; deliveries start being
          logged as soon as it is applied (no deploy needed beyond this one).
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                className={[
                  "rounded-full px-3 py-1.5 text-sm font-medium capitalize transition",
                  status === s
                    ? s === "error"
                      ? "bg-rose-600 text-white"
                      : "bg-indigo-600 text-white"
                    : "border border-slate-300 text-slate-600 hover:bg-slate-50",
                ].join(" ")}
              >
                {s}
              </button>
            ))}
            <span className="ml-auto text-sm text-slate-500">
              {total} {total === 1 ? "delivery" : "deliveries"}
            </span>
          </div>

          {loading ? (
            <p className="mt-8 text-slate-500">Loading...</p>
          ) : fetchError ? (
            <p className="mt-8 text-rose-600">{fetchError}</p>
          ) : rows.length === 0 ? (
            <p className="mt-8 text-slate-500">No deliveries logged yet.</p>
          ) : (
            <>
              <section className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">When</th>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Record</th>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <Fragment key={row.id}>
                        <tr
                          onClick={() => void toggleExpand(row.id)}
                          className="cursor-pointer align-top hover:bg-slate-50"
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            {formatDate(row.created_at)}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {row.event_name ?? "(unknown)"}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            {row.record_id ?? "-"}
                          </td>
                          <td className="max-w-[180px] truncate px-4 py-3 text-xs text-slate-500">
                            {row.user_hint ?? "-"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusChip(row.status)}`}
                            >
                              {row.status}
                            </span>
                            {row.error_message ? (
                              <p className="mt-1 max-w-xs truncate text-xs text-rose-600">
                                {row.error_message}
                              </p>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                            {row.duration_ms !== null ? `${row.duration_ms} ms` : "-"}
                          </td>
                        </tr>
                        {expandedId === row.id ? (
                          <tr>
                            <td colSpan={6} className="bg-slate-50 px-4 py-3">
                              {row.error_message ? (
                                <p className="mb-2 whitespace-pre-wrap text-xs text-rose-700">
                                  {row.error_message}
                                </p>
                              ) : null}
                              <pre className="max-h-96 overflow-auto rounded bg-white p-3 text-xs text-slate-700">
                                {payloads[row.id] ?? "Loading payload..."}
                              </pre>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </section>

              <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
