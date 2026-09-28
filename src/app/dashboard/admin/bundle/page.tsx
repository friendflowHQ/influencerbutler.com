"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BUNDLE_TOPICS, BUNDLE_NAME } from "@/app/grow-together/_data/bundleMeta";

type ContributorRow = {
  id: string;
  name: string | null;
  email: string | null;
  instagram_handle: string | null;
  other_socials: Record<string, string> | null;
  website: string | null;
  topic: string | null;
  chapter_title: string | null;
  bio: string | null;
  headshot_url: string | null;
  audience_size: string | null;
  status: string | null;
  chapter_url: string | null;
  promo_committed: boolean | null;
  submitted_at: string | null;
  notes: string | null;
  created_at: string | null;
};

type ListResponse = { rows?: ContributorRow[]; migrationPending?: boolean; error?: string };

const STATUSES = ["applied", "confirmed", "submitted", "scheduled", "done", "declined"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "applied", label: "Applied" },
  { key: "confirmed", label: "Confirmed" },
  { key: "submitted", label: "Submitted" },
  { key: "done", label: "Done" },
] as const;
type FilterKey = (typeof STATUS_FILTERS)[number]["key"];

const STATUS_CHIP: Record<string, string> = {
  applied: "bg-slate-100 text-slate-600",
  confirmed: "bg-blue-100 text-blue-700",
  submitted: "bg-amber-100 text-amber-800",
  scheduled: "bg-violet-100 text-violet-700",
  done: "bg-emerald-100 text-emerald-700",
  declined: "bg-rose-100 text-rose-700",
};

function topicTitle(slug: string | null): string {
  if (!slug) return "-";
  return BUNDLE_TOPICS.find((t) => t.slug === slug)?.title ?? slug;
}

function shortDate(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function AdminBundlePage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [rows, setRows] = useState<ContributorRow[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/bundle", { cache: "no-store" });
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

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status ?? "applied"] = (c[r.status ?? "applied"] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const byStatus = filter === "all" ? rows : rows.filter((r) => (r.status ?? "applied") === filter);
    const q = search.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((r) =>
      [r.name, r.email, r.instagram_handle, r.topic, r.chapter_title].some(
        (v) => v != null && v.toLowerCase().includes(q),
      ),
    );
  }, [rows, filter, search]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        window.alert(json.error ?? "Could not save.");
        return;
      }
      await load();
    } catch {
      window.alert("Network error. Please retry.");
    } finally {
      setBusyId(null);
    }
  };

  const editChapterUrl = (row: ContributorRow) => {
    const url = window.prompt(`Chapter draft link for ${row.name ?? row.email ?? "this contributor"}:`, row.chapter_url ?? "");
    if (url == null) return;
    void patch(row.id, { chapterUrl: url.trim() });
  };

  const editNotes = (row: ContributorRow) => {
    const notes = window.prompt(`Notes for ${row.name ?? row.email ?? "this contributor"}:`, row.notes ?? "");
    if (notes == null) return;
    void patch(row.id, { notes: notes.trim() });
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
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{BUNDLE_NAME}</h1>
      <p className="mt-1 text-sm text-slate-600">
        Creators who applied to contribute a chapter. Move each one through applied to confirmed,
        submitted, and done as their chapter comes in. The export buttons pull the contributor roster
        and, after launch, the shared reader list to hand back to contributors.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href="/api/admin/bundle/export?list=contributors"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Export contributor roster (CSV)
        </a>
        <a
          href="/api/admin/bundle/export?list=submissions"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Export submissions for PDF (JSON)
        </a>
        <a
          href="/api/admin/bundle/export?list=readers"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Export shared reader list (CSV)
        </a>
      </div>

      {migrationPending ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          The <code>20260905_bundle_contributors.sql</code> migration is not applied yet. Paste it into
          the Supabase SQL editor to start collecting applications.
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={[
              "rounded-full px-3 py-1.5 text-sm font-medium transition",
              filter === f.key ? "bg-orange-600 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            {f.label}
            {f.key !== "all" && counts[f.key] ? <span className="ml-1.5 text-xs opacity-80">{counts[f.key]}</span> : null}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, handle, topic"
          className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
        />
        <span className="ml-auto text-sm text-slate-500">
          {filtered.length} {filtered.length === 1 ? "creator" : "creators"}
        </span>
      </div>

      {loading ? (
        <p className="mt-8 text-slate-500">Loading...</p>
      ) : fetchError ? (
        <p className="mt-8 text-rose-600">{fetchError}</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-slate-500">
          {search.trim() ? "No creators match your search." : "No applications yet."}
        </p>
      ) : (
        <section className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Creator</th>
                <th className="px-4 py-3">Topic</th>
                <th className="px-4 py-3">Audience</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Promo</th>
                <th className="px-4 py-3">Chapter</th>
                <th className="px-4 py-3">Applied</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => {
                const busy = busyId === row.id;
                return (
                  <tr key={row.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.name ?? "(no name)"}</div>
                      <div className="text-xs text-slate-500">{row.email}</div>
                      {row.instagram_handle ? (
                        <div className="text-xs text-slate-400">{row.instagram_handle}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <div>{topicTitle(row.topic)}</div>
                      {row.chapter_title ? (
                        <div className="text-xs text-slate-400">{row.chapter_title}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.audience_size ?? "-"}</td>
                    <td className="px-4 py-3">
                      <select
                        value={row.status ?? "applied"}
                        disabled={busy}
                        onChange={(e) => void patch(row.id, { status: e.target.value as Status })}
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_CHIP[row.status ?? "applied"] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => void patch(row.id, { promoCommitted: !row.promo_committed })}
                        disabled={busy}
                        className={[
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          row.promo_committed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                        ].join(" ")}
                      >
                        {row.promo_committed ? "committed" : "not yet"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {row.chapter_url ? (
                        <a href={row.chapter_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-orange-700 underline">
                          view draft
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">none</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{shortDate(row.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <button onClick={() => editChapterUrl(row)} disabled={busy} className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50">
                          {row.chapter_url ? "edit link" : "add link"}
                        </button>
                        <button onClick={() => editNotes(row)} disabled={busy} className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50">
                          {row.notes ? "edit notes" : "add notes"}
                        </button>
                      </div>
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
