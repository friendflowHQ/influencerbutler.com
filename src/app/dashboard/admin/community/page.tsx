"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PendingQuestion = {
  id: string;
  workspace_id: string;
  title: string;
  body: string | null;
  author_id: string | null;
  author_email: string | null;
  created_at: string;
  status: string;
};

type ListResponse = {
  admin?: { email: string };
  pending?: PendingQuestion[];
  error?: string;
};

type RowState =
  | { kind: "idle" }
  | { kind: "working"; action: "approve" | "reject" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function AdminCommunityPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingQuestion[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/community/list", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as ListResponse;
      if (!res.ok) {
        setFetchError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setAdminEmail(json.admin?.email ?? null);
      setPending(json.pending ?? []);
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

  const setRow = (id: string, state: RowState) =>
    setRowState((prev) => ({ ...prev, [id]: state }));

  const onApprove = async (q: PendingQuestion) => {
    setRow(q.id, { kind: "working", action: "approve" });
    try {
      const res = await fetch("/api/admin/community/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: q.id }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setRow(q.id, { kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      setRow(q.id, { kind: "success", message: "Approved." });
      setTimeout(() => void load(), 800);
    } catch (err) {
      console.error(err);
      setRow(q.id, { kind: "error", message: "Network error." });
    }
  };

  const onReject = async (q: PendingQuestion) => {
    if (!window.confirm(`Reject "${q.title}"? This hides it from /help/community.`)) {
      return;
    }
    setRow(q.id, { kind: "working", action: "reject" });
    try {
      const res = await fetch("/api/admin/community/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: q.id }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setRow(q.id, { kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      setRow(q.id, { kind: "success", message: "Rejected." });
      setTimeout(() => void load(), 800);
    } catch (err) {
      console.error(err);
      setRow(q.id, { kind: "error", message: "Network error." });
    }
  };

  const header = useMemo(
    () => (
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Admin · Community
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Pending questions
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {adminEmail ? `Signed in as ${adminEmail}.` : null} Approving a question
          publishes it to{" "}
          <a href="/help/community" className="text-[#f97316] hover:underline">
            /help/community
          </a>
          . Rejecting hides it permanently.
        </p>
      </header>
    ),
    [adminEmail],
  );

  if (forbidden) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Admin only</h1>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800 shadow-sm">
          Your account isn&apos;t in the admin allowlist. If you should have access, add your email
          to the <code className="rounded bg-amber-100 px-1 py-0.5">ADMIN_EMAILS</code> environment
          variable.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {fetchError}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {pending.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          No pending questions. ✨
        </div>
      ) : (
        <ul className="space-y-4">
          {pending.map((q) => {
            const state = rowState[q.id] ?? { kind: "idle" };
            const working = state.kind === "working";
            return (
              <li
                key={q.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      {q.workspace_id}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 break-words">
                      {q.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-600 break-all">
                      {q.author_email ?? "(no email)"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Submitted {formatDate(q.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onReject(q)}
                      disabled={working}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                    >
                      {state.kind === "working" && state.action === "reject"
                        ? "Rejecting…"
                        : "Reject"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onApprove(q)}
                      disabled={working}
                      className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
                    >
                      {state.kind === "working" && state.action === "approve"
                        ? "Approving…"
                        : "Approve"}
                    </button>
                  </div>
                </div>

                {q.body ? (
                  <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                    {q.body}
                  </p>
                ) : (
                  <p className="mt-4 text-sm italic text-slate-400">No details provided.</p>
                )}

                {state.kind === "success" ? (
                  <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {state.message}
                  </p>
                ) : null}
                {state.kind === "error" ? (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {state.message}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
