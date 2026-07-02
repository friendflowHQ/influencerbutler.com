"use client";

import { useCallback, useEffect, useState } from "react";

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: unknown;
  created_at: string;
};

type ListResponse = {
  rows?: AuditRow[];
  total?: number;
  page?: number;
  pageSize?: number;
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

function detailsText(details: unknown): string | null {
  if (details === null || details === undefined) return null;
  try {
    const s = JSON.stringify(details, null, 2);
    return s === "{}" ? null : s;
  } catch {
    return String(details);
  }
}

export default function AdminAuditPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  // Filter inputs (applied on submit so typing doesn't spam the API).
  const [actorInput, setActorInput] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [targetInput, setTargetInput] = useState("");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [applied, setApplied] = useState({ actor: "", action: "", target: "", from: "", to: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (applied.actor) params.set("actor", applied.actor);
      if (applied.action) params.set("action", applied.action);
      if (applied.target) params.set("target", applied.target);
      if (applied.from) params.set("from", applied.from);
      if (applied.to) params.set("to", applied.to);
      const res = await fetch(`/api/admin/audit/list?${params.toString()}`, { cache: "no-store" });
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
      setTotal(json.total ?? 0);
    } catch (err) {
      console.error(err);
      setFetchError("Network error. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, applied]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = () => {
    setPage(1);
    setApplied({
      actor: actorInput.trim(),
      action: actionInput.trim(),
      target: targetInput.trim(),
      from: fromInput,
      to: toInput,
    });
  };

  const clearFilters = () => {
    setActorInput("");
    setActionInput("");
    setTargetInput("");
    setFromInput("");
    setToInput("");
    setPage(1);
    setApplied({ actor: "", action: "", target: "", from: "", to: "" });
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
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit log</h1>
      <p className="mt-1 text-sm text-slate-600">
        Append-only record of admin and assistant actions: approvals, billing changes, license
        operations, impersonations, and more. Read-only.
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm text-slate-700">
            <span className="block text-xs font-medium text-slate-500">Actor email</span>
            <input
              type="text"
              value={actorInput}
              onChange={(e) => setActorInput(e.target.value)}
              placeholder="jane@"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm text-slate-700">
            <span className="block text-xs font-medium text-slate-500">Action</span>
            <input
              type="text"
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              placeholder="billing."
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm text-slate-700">
            <span className="block text-xs font-medium text-slate-500">Target type</span>
            <input
              type="text"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="user"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm text-slate-700">
            <span className="block text-xs font-medium text-slate-500">From</span>
            <input
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm text-slate-700">
            <span className="block text-xs font-medium text-slate-500">To</span>
            <input
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={applyFilters}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Apply filters
          </button>
          <button
            onClick={clearFilters}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
          <span className="text-sm text-slate-500">
            {total} {total === 1 ? "entry" : "entries"}
          </span>
        </div>
      </section>

      {loading ? (
        <p className="mt-8 text-slate-500">Loading...</p>
      ) : fetchError ? (
        <p className="mt-8 text-rose-600">{fetchError}</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-slate-500">No audit entries match these filters.</p>
      ) : (
        <>
          <section className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const detail = detailsText(row.details);
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-900">{row.actor_email ?? "unknown"}</span>
                        {row.actor_role ? (
                          <span
                            className={[
                              "ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              row.actor_role === "admin"
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-slate-100 text-slate-600",
                            ].join(" ")}
                          >
                            {row.actor_role}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.action}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.target_type ? (
                          <>
                            {row.target_type}
                            {row.target_id ? (
                              <span className="ml-1 break-all text-xs text-slate-400">
                                {row.target_id}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {detail ? (
                          <details>
                            <summary className="cursor-pointer text-xs text-indigo-600 hover:text-indigo-800">
                              View
                            </summary>
                            <pre className="mt-2 max-w-md overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                              {detail}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
    </div>
  );
}
