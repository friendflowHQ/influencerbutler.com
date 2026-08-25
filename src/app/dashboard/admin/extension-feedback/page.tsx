"use client";

import { useCallback, useEffect, useState } from "react";

type Status = "new" | "reviewed" | "resolved";

type Feedback = {
  id: string;
  email: string | null;
  feedbackType: string;
  message: string;
  pageUrl: string | null;
  extVersion: string | null;
  browser: string | null;
  status: Status;
  resolvedVersion: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

type ListResponse = {
  admin?: { email: string };
  items?: Feedback[];
  migrationPending?: boolean;
  error?: string;
};

const STATUS_TABS: Array<{ key: Status | "all"; label: string }> = [
  { key: "new", label: "New" },
  { key: "reviewed", label: "Reviewed" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

const TYPE_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All types" },
  { key: "bug", label: "Bugs" },
  { key: "feature", label: "Features" },
  { key: "praise", label: "Praise" },
  { key: "other", label: "Other" },
];

const TYPE_TONE: Record<string, string> = {
  bug: "border-rose-200 bg-rose-50 text-rose-700",
  feature: "border-sky-200 bg-sky-50 text-sky-700",
  praise: "border-emerald-200 bg-emerald-50 text-emerald-700",
  other: "border-slate-200 bg-slate-50 text-slate-600",
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

export default function AdminExtensionFeedbackPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [tab, setTab] = useState<Status | "all">("new");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [items, setItems] = useState<Feedback[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Inline resolve form state, keyed by the row being resolved.
  const [resolveFor, setResolveFor] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async (which: Status | "all", type: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(
        `/api/admin/extension-feedback/list?status=${which}&type=${type}`,
        { cache: "no-store" },
      );
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as ListResponse;
      if (!res.ok) {
        setFetchError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setMigrationPending(Boolean(json.migrationPending));
      setItems(json.items ?? []);
    } catch (err) {
      console.error(err);
      setFetchError("Network error. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab, typeFilter);
  }, [tab, typeFilter, load]);

  const mutate = async (payload: Record<string, unknown>, id: string): Promise<boolean> => {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/extension-feedback/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await load(tab, typeFilter);
        return true;
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setFetchError(json.error ?? `Failed (${res.status})`);
      return false;
    } catch {
      setFetchError("Network error.");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const submitResolve = async (id: string) => {
    const ok = await mutate({ action: "resolve", id, resolvedVersion: version.trim(), note }, id);
    if (ok) {
      setResolveFor(null);
      setVersion("");
      setNote("");
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
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Extension feedback</h1>
      <p className="mt-1 text-sm text-slate-600">
        Bug reports and requests from the Chrome extension. Resolving a signed-in user&rsquo;s bug
        report surfaces it in their post-update &ldquo;What&rsquo;s New&rdquo; notice as an issue you
        fixed, so write the note for them to read.
      </p>

      {migrationPending ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The <code>extension_feedback</code> table is not in prod yet. Apply
          <code className="mx-1">supabase/migrations/20260708_extension_feedback.sql</code>
          and <code className="mx-1">20260825_extension_feedback_resolution.sql</code>.
        </div>
      ) : null}

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s.key}
            onClick={() => setTab(s.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              tab === s.key
                ? "bg-slate-900 text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s.label}
          </button>
        ))}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
        >
          {TYPE_FILTERS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <p className="mt-8 text-slate-500">Loading...</p>
      ) : fetchError ? (
        <p className="mt-8 text-rose-600">{fetchError}</p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">Nothing here yet.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {items.map((f) => (
            <div key={f.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-2 py-0.5 text-[11px] font-medium capitalize ${
                      TYPE_TONE[f.feedbackType] ?? TYPE_TONE.other
                    }`}
                  >
                    {f.feedbackType}
                  </span>
                  <strong className="text-sm text-slate-900">{f.email ?? "Anonymous"}</strong>
                </div>
                <span className="flex-none rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-600">
                  {f.status}
                </span>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{f.message}</p>
              <p className="mt-1 text-xs text-slate-400">
                {formatDate(f.createdAt)}
                {f.extVersion ? ` · v${f.extVersion}` : ""}
                {f.browser ? ` · ${f.browser}` : ""}
                {f.pageUrl ? (
                  <>
                    {" · "}
                    <a
                      href={f.pageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-slate-600"
                    >
                      page
                    </a>
                  </>
                ) : null}
              </p>

              {f.status === "resolved" ? (
                <div className="mt-3 rounded-lg border-l-2 border-emerald-300 bg-emerald-50/50 px-3 py-2 text-sm text-slate-700">
                  <span className="font-semibold text-emerald-800">
                    Fixed{f.resolvedVersion ? ` in v${f.resolvedVersion}` : ""}:
                  </span>{" "}
                  {f.resolutionNote ?? <span className="italic text-slate-500">(shows their original message)</span>}
                  {!f.email ? (
                    <span className="ml-1 text-xs text-slate-400">
                      · anonymous, so it will not appear in any What&rsquo;s New notice
                    </span>
                  ) : null}
                </div>
              ) : null}

              {/* Actions */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {f.status !== "resolved" ? (
                  <button
                    onClick={() => {
                      setResolveFor(resolveFor === f.id ? null : f.id);
                      setVersion(f.resolvedVersion ?? "");
                      setNote(f.resolutionNote ?? "");
                    }}
                    disabled={busyId === f.id}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {resolveFor === f.id ? "Cancel" : "Resolve"}
                  </button>
                ) : (
                  <button
                    onClick={() => mutate({ action: "reopen", id: f.id }, f.id)}
                    disabled={busyId === f.id}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Reopen
                  </button>
                )}
                {f.status === "new" ? (
                  <button
                    onClick={() => mutate({ action: "reviewed", id: f.id }, f.id)}
                    disabled={busyId === f.id}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Mark reviewed
                  </button>
                ) : null}
              </div>

              {resolveFor === f.id ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-sm text-slate-700">
                      <span className="block text-xs font-medium text-slate-500">Fixed in version</span>
                      <input
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        placeholder="e.g. 0.2.0"
                        className="mt-1 w-28 rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="flex-1 text-sm text-slate-700">
                      <span className="block text-xs font-medium text-slate-500">
                        Note the user will read (optional)
                      </span>
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Falls back to their original message"
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={() => submitResolve(f.id)}
                      disabled={busyId === f.id || !version.trim()}
                      className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                    >
                      Mark fixed
                    </button>
                    {!f.email ? (
                      <span className="text-xs text-slate-500">
                        Anonymous report: resolving is fine for your records, but it cannot appear in a
                        What&rsquo;s New notice.
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
