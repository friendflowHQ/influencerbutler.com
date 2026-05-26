"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AuthorChip from "@/components/community/AuthorChip";
import type { CommunityAuthor } from "@/lib/community-authors";

type RowType = "question" | "answer";
type StatusFilter = "all" | "approved" | "pending" | "rejected";

type QuestionRow = {
  id: string;
  workspace_id: string;
  title: string;
  body: string | null;
  status: string;
  upvotes: number | null;
  answer_count: number | null;
  author_id: string | null;
  author_email: string | null;
  created_at: string;
};

type AnswerRow = {
  id: string;
  question_id: string;
  body: string;
  status: string;
  author_id: string | null;
  author_email: string | null;
  created_at: string;
};

type ListResponse = {
  admin?: { email: string };
  type?: RowType;
  status?: StatusFilter;
  rows?: (QuestionRow | AnswerRow)[];
  authors?: Record<string, CommunityAuthor>;
  questionTitles?: Record<string, { title: string; workspace_id: string }>;
  stats?: { total: number; approved: number; pending: number; rejected: number };
  error?: string;
};

type RowAction = "hide" | "restore" | "delete";

type RowState =
  | { kind: "idle" }
  | { kind: "working"; action: RowAction }
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    rejected: "bg-rose-100 text-rose-800 border-rose-200",
  };
  const cls = styles[status] || "bg-slate-100 text-slate-700 border-slate-200";
  const label = status === "rejected" ? "Hidden" : status[0].toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default function AdminCommunityPage() {
  const [type, setType] = useState<RowType>("question");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [rows, setRows] = useState<(QuestionRow | AnswerRow)[]>([]);
  const [authors, setAuthors] = useState<Record<string, CommunityAuthor>>({});
  const [questionTitles, setQuestionTitles] = useState<Record<string, { title: string; workspace_id: string }>>({});
  const [stats, setStats] = useState<ListResponse["stats"] | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/admin/community/list?type=${type}&status=${status}`, {
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
      setAdminEmail(json.admin?.email ?? null);
      setRows(json.rows ?? []);
      setAuthors(json.authors ?? {});
      setQuestionTitles(json.questionTitles ?? {});
      setStats(json.stats ?? null);
      setRowState({});
    } catch (err) {
      console.error(err);
      setFetchError("Network error. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [type, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const setRow = (id: string, state: RowState) =>
    setRowState((prev) => ({ ...prev, [id]: state }));

  const callAction = async (
    row: QuestionRow | AnswerRow,
    action: RowAction,
  ) => {
    setRow(row.id, { kind: "working", action });
    try {
      const endpoint =
        action === "delete" ? "/api/admin/community/delete" : "/api/admin/community/update";
      const body =
        action === "delete"
          ? { type, id: row.id }
          : { type, id: row.id, status: action === "hide" ? "rejected" : "approved" };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setRow(row.id, { kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      // Refresh the list so the row reflects new state (or disappears on delete).
      await load();
    } catch (err) {
      console.error(err);
      setRow(row.id, { kind: "error", message: "Network error." });
    }
  };

  const onHide = (row: QuestionRow | AnswerRow) => callAction(row, "hide");
  const onRestore = (row: QuestionRow | AnswerRow) => callAction(row, "restore");
  const onDelete = (row: QuestionRow | AnswerRow) => {
    const label =
      type === "question"
        ? `"${(row as QuestionRow).title}"`
        : `this answer (${(row as AnswerRow).body.slice(0, 40)}...)`;
    if (!window.confirm(`Permanently delete ${label}? This cannot be undone.`)) return;
    void callAction(row, "delete");
  };

  const header = useMemo(
    () => (
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Admin · Community
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Moderation</h1>
        <p className="text-sm text-slate-600">
          {adminEmail ? `Signed in as ${adminEmail}. ` : null}
          Hide content to keep it out of <a href="/help/community" className="text-[#f97316] hover:underline">/help/community</a>,
          restore to make it visible again, or delete to remove permanently.
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
          Your account isn&apos;t in the admin allowlist. Add your email to{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5">ADMIN_EMAILS</code>.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {(["question", "answer"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setType(t);
              setStatus("all");
            }}
            className={[
              "border-b-2 px-3 py-2 text-sm font-medium transition",
              type === t
                ? "border-[#f97316] text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {t === "question" ? "Questions" : "Answers"}
          </button>
        ))}
      </div>

      {/* Stats + status filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {stats ? (
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{stats.total}</span> total ·{" "}
            <span className="text-emerald-700">{stats.approved} live</span>
            {stats.pending > 0 ? (
              <>
                {" · "}
                <span className="text-amber-700">{stats.pending} pending</span>
              </>
            ) : null}
            {" · "}
            <span className="text-rose-700">{stats.rejected} hidden</span>
          </p>
        ) : (
          <span className="text-sm text-slate-500">&nbsp;</span>
        )}
        <div className="flex gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 text-xs">
          {(["all", "approved", "pending", "rejected"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={[
                "rounded px-2 py-1 font-medium transition",
                status === s
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              {s === "rejected" ? "Hidden" : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />
      ) : fetchError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {fetchError}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Nothing matches this filter.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const state = rowState[row.id] ?? { kind: "idle" };
            const working = state.kind === "working";
            const author = row.author_id ? authors[row.author_id] ?? null : null;
            const isQuestion = type === "question";
            const questionLink = isQuestion
              ? `/help/community/${row.id}`
              : `/help/community/${(row as AnswerRow).question_id}`;

            return (
              <li
                key={row.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <StatusBadge status={row.status} />
                      <AuthorChip
                        author={author}
                        fallbackEmail={row.author_email}
                        size="sm"
                      />
                      <span className="text-slate-400">{formatDate(row.created_at)}</span>
                    </div>

                    {isQuestion ? (
                      <>
                        <p className="mt-2 text-xs uppercase tracking-widest text-slate-500">
                          {(row as QuestionRow).workspace_id}
                        </p>
                        <h2 className="mt-1 text-lg font-semibold text-slate-900 break-words">
                          {(row as QuestionRow).title}
                        </h2>
                        {(row as QuestionRow).body ? (
                          <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">
                            {(row as QuestionRow).body}
                          </p>
                        ) : null}
                        <div className="mt-2 text-xs text-slate-500">
                          {(row as QuestionRow).upvotes ?? 0} upvotes ·{" "}
                          {(row as QuestionRow).answer_count ?? 0} answers
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 text-xs text-slate-500">
                          Answer to:{" "}
                          <a
                            href={questionLink}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-slate-800 hover:underline"
                          >
                            {questionTitles[(row as AnswerRow).question_id]?.title ??
                              "(question)"}
                          </a>
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                          {(row as AnswerRow).body}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
                    <a
                      href={questionLink}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      View
                    </a>
                    {row.status !== "rejected" ? (
                      <button
                        type="button"
                        onClick={() => onHide(row)}
                        disabled={working}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
                      >
                        {working && state.action === "hide" ? "Hiding..." : "Hide"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRestore(row)}
                        disabled={working}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
                      >
                        {working && state.action === "restore" ? "Restoring..." : "Restore"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(row)}
                      disabled={working}
                      className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                    >
                      {working && state.action === "delete" ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>

                {state.kind === "error" ? (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
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
