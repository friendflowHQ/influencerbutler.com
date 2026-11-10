"use client";

/**
 * Admin > Invites: the done-for-you Foyer page pilot. One row per researched
 * Instagram creator, with the funnel (drafted, sent, viewed, claimed,
 * activated, published, converted), a review preview that does not count as a
 * view, per-row notes, and the actions Liz needs while the pilot runs: enroll a
 * drafted invite in the (paused) cold sequence, stop one, or mark a "no thanks"
 * as declined (which also suppresses the address).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

type InviteRow = {
  id: string;
  code: string;
  ig_handle: string;
  email: string;
  first_name: string;
  niche: string;
  followers: number | null;
  opener: string;
  batch: string;
  status: string;
  notes: string;
  created_at: string;
  sent_at: string | null;
  expires_at: string | null;
  viewed_at: string | null;
  view_count: number;
  claimed_at: string | null;
  activated_at: string | null;
  published_at: string | null;
  existing_customer: boolean;
  previewUrl: string;
  enrolled: boolean;
  lastStepSent: number;
  enrollmentCancelled: boolean;
};

const FUNNEL = ["drafted", "sent", "viewed", "claimed", "activated", "published", "converted", "declined"] as const;

const STATUS_STYLE: Record<string, string> = {
  drafted: "bg-slate-100 text-slate-600",
  sent: "bg-sky-100 text-sky-700",
  viewed: "bg-indigo-100 text-indigo-700",
  claimed: "bg-amber-100 text-amber-800",
  activated: "bg-orange-100 text-orange-800",
  published: "bg-emerald-100 text-emerald-700",
  converted: "bg-emerald-600 text-white",
  declined: "bg-rose-100 text-rose-700",
};

function shortDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-";
}

export default function AdminInvitesPage() {
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [funnel, setFunnel] = useState<Record<string, number>>({});
  const [batches, setBatches] = useState<string[]>([]);
  const [batch, setBatch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/invites${batch ? `?batch=${encodeURIComponent(batch)}` : ""}`);
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = await res.json();
      if (json.error) setError(json.error);
      setRows(json.rows ?? []);
      setFunnel(json.funnel ?? {});
      setBatches(json.batches ?? []);
    } catch {
      setError("Could not load invites.");
    } finally {
      setLoading(false);
    }
  }, [batch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/admin/invites", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, ...extra }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error || "Action failed");
    await load();
  }

  const rates = useMemo(() => {
    const reached = (s: string) => rows.filter((r) => FUNNEL.indexOf(r.status as (typeof FUNNEL)[number]) >= FUNNEL.indexOf(s as (typeof FUNNEL)[number]) && r.status !== "declined").length;
    const sent = reached("sent");
    const pct = (n: number) => (sent ? `${Math.round((n / sent) * 100)}%` : "-");
    return { sent, viewed: pct(reached("viewed")), claimed: pct(reached("claimed")), published: pct(reached("published")) };
  }, [rows]);

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Admin only</h1>
        <p className="mt-2 text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Invites</h1>
      <p className="mt-1 text-sm text-slate-600">
        Done-for-you Foyer pages for researched Instagram creators. Invite-only: claiming gives a 14-day Power User comp
        (kind Invite). Emails go out through the paused cold sequence &quot;Invite: Foyer page (Instagram)&quot; on the Emails
        page; nothing sends until you activate it there.
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {FUNNEL.map((s) => (
          <div key={s} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{s}</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{funnel[s] ?? 0}</div>
          </div>
        ))}
      </section>
      <p className="mt-3 text-sm text-slate-600">
        Of {rates.sent} sent: {rates.viewed} viewed, {rates.claimed} claimed, {rates.published} published. Views can be
        inflated by email link scanners; claims and publishes are real clicks.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <span className="mr-2 font-medium text-slate-700">Batch</span>
          <select value={batch} onChange={(e) => setBatch(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
          Refresh
        </button>
        {loading ? <span className="text-sm text-slate-500">Loading...</span> : null}
        {error ? <span role="alert" className="text-sm text-rose-700">{error}</span> : null}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Creator</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Email step</th>
                <th className="px-3 py-2">Dates</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-t border-slate-100 align-top ${previewId === r.id ? "bg-orange-50" : ""}`}>
                  <td className="px-3 py-2">
                    <a href={`https://www.instagram.com/${r.ig_handle}/`} target="_blank" rel="noreferrer" className="font-semibold text-slate-900 hover:text-indigo-600">
                      @{r.ig_handle}
                    </a>
                    <div className="text-xs text-slate-500">
                      {r.niche}
                      {r.followers ? ` · ${r.followers.toLocaleString()} followers` : ""}
                      {r.batch ? ` · ${r.batch}` : ""}
                    </div>
                    <div className="text-xs text-slate-500">{r.email}</div>
                    <details className="mt-1 text-xs text-slate-600">
                      <summary className="cursor-pointer">Opener</summary>
                      <p className="mt-1 max-w-md">{r.opener}</p>
                    </details>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status] ?? ""}`}>{r.status}</span>
                    {r.existing_customer ? <div className="mt-1 text-xs text-slate-500">already a customer</div> : null}
                    {r.view_count ? <div className="mt-1 text-xs text-slate-500">{r.view_count} view(s)</div> : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {r.enrolled ? (r.enrollmentCancelled ? `stopped after ${r.lastStepSent}` : `${r.lastStepSent} of 3`) : "not enrolled"}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    <div>sent {shortDate(r.sent_at)}</div>
                    <div>claimed {shortDate(r.claimed_at)}</div>
                    <div>expires {shortDate(r.expires_at)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <textarea
                      aria-label={`Notes for @${r.ig_handle}`}
                      defaultValue={r.notes}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      onBlur={() => {
                        if (notes[r.id] !== undefined && notes[r.id] !== r.notes) void act(r.id, "note", { notes: notes[r.id] });
                      }}
                      className="h-16 w-48 rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="space-y-1 px-3 py-2 text-xs">
                    <button type="button" onClick={() => setPreviewId(r.id)} className="block text-indigo-600 hover:underline">
                      Review page
                    </button>
                    <a href={r.previewUrl} target="_blank" rel="noreferrer" className="block text-slate-500 hover:underline" title="Opens the public preview (counts as a view)">
                      Public link
                    </a>
                    {r.status === "drafted" && !r.enrolled ? (
                      <button type="button" onClick={() => void act(r.id, "enroll")} className="block text-emerald-700 hover:underline">
                        Enroll in sequence
                      </button>
                    ) : null}
                    {r.enrolled && !r.enrollmentCancelled ? (
                      <button type="button" onClick={() => void act(r.id, "unenroll")} className="block text-slate-600 hover:underline">
                        Stop emails
                      </button>
                    ) : null}
                    {r.status !== "declined" && !r.claimed_at ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Mark @${r.ig_handle} as declined? This stops the emails and adds ${r.email} to the do-not-email list.`)) void act(r.id, "decline");
                        }}
                        className="block text-rose-700 hover:underline"
                      >
                        Mark declined
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!rows.length && !loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No invites yet. They arrive from scripts/outreach/upload-invite.js.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          {previewId ? (
            <div className="overflow-hidden rounded-[2rem] border-8 border-slate-900 bg-white shadow">
              <iframe
                title="Invite page review"
                src={`/api/admin/invites/preview?id=${encodeURIComponent(previewId)}`}
                sandbox="allow-popups"
                className="h-[720px] w-full border-0"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
              Pick &quot;Review page&quot; on a row to see its draft here. Reviewing here never counts as a view.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
