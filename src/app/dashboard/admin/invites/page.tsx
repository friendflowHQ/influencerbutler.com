"use client";

/**
 * Admin > Invites: the Storefront Score page pilot. One row per researched
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
  email_steps: { subject: string; body: string }[];
  score: { score: number } | null;
  opportunities: { counts: { deals: number; campaigns: number } } | null;
  storefront_url: string;
  time_on_page_ms: number;
  claim_clicked_at: string | null;
  replied_at: string | null;
  removed_at: string | null;
  previewUrl: string;
  enrolled: boolean;
  lastStepSent: number;
  enrollmentCancelled: boolean;
  delivered: boolean;
  opened: boolean;
  bounced: boolean;
};

type Report = {
  emailed: number;
  delivered: number;
  opened: number;
  visited: number;
  claimClicked: number;
  claimed: number;
  trialStarted: number;
  converted: number;
  replied: number;
  removed: number;
};

const FUNNEL = ["drafted", "sent", "viewed", "claimed", "activated", "published", "converted", "replied", "declined", "removed"] as const;

/** The pilot brief's expected ranges, for the day-14 report. */
const TARGETS: { key: keyof Report; label: string; of: keyof Report | null; expect: string }[] = [
  { key: "delivered", label: "Delivered", of: "emailed", expect: "about 90%" },
  { key: "opened", label: "Opened", of: "delivered", expect: "40 to 55%" },
  { key: "visited", label: "Visited the page", of: "delivered", expect: "10 to 20%" },
  { key: "claimed", label: "Claimed", of: "visited", expect: "30 to 50% of visitors" },
  { key: "trialStarted", label: "Started the trial in the app", of: "claimed", expect: "40 to 60% of claims" },
  { key: "converted", label: "Became paying", of: "trialStarted", expect: "0 to 1 per 100" },
];

function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)}%` : "-";
}

const STATUS_STYLE: Record<string, string> = {
  drafted: "bg-slate-100 text-slate-600",
  sent: "bg-sky-100 text-sky-700",
  viewed: "bg-indigo-100 text-indigo-700",
  claimed: "bg-amber-100 text-amber-800",
  activated: "bg-orange-100 text-orange-800",
  published: "bg-emerald-100 text-emerald-700",
  converted: "bg-emerald-600 text-white",
  declined: "bg-rose-100 text-rose-700",
  replied: "bg-violet-100 text-violet-700",
  removed: "bg-slate-200 text-slate-700",
};

function shortDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-";
}

export default function AdminInvitesPage() {
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [funnel, setFunnel] = useState<Record<string, number>>({});
  const [report, setReport] = useState<Report | null>(null);
  const [emailsId, setEmailsId] = useState<string | null>(null);
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
      setReport(json.report ?? null);
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

  // The brief's decision rule, evaluated on the live numbers.
  const advice = useMemo(() => {
    if (!report || report.emailed < 20) return "Decision rule needs at least 20 emailed creators.";
    const out: string[] = [];
    const openRate = report.delivered ? report.opened / report.delivered : 0;
    const claimRate = report.visited ? report.claimed / report.visited : 0;
    if (openRate < 0.3) out.push("Open rate is under 30%: fix subject lines and deliverability.");
    if (report.visited >= 5 && claimRate < 0.2) out.push("Visit-to-claim is under 20%: fix the page and the offer.");
    if (!out.length) out.push("Within the brief's thresholds. Do not scale past 100 without Liz's approval.");
    return out.join(" ");
  }, [report]);
  const emailsRow = rows.find((r) => r.id === emailsId) ?? null;

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
        Private Storefront Score pages for creators found by hashtag. Invite-only: claiming gives a 14-day Power User comp
        (kind Invite). Each creator&apos;s 4 emails are written for them and go out through the paused cold sequence
        &quot;Invite: Storefront Score (Instagram)&quot; on the Emails page; nothing sends until you activate it there.
        Replies land in your inbox: mark them here so their emails stop.
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {FUNNEL.map((s) => (
          <div key={s} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{s}</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{funnel[s] ?? 0}</div>
          </div>
        ))}
      </section>

      {report ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Pilot report ({report.emailed} emailed)</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1">Stage</th>
                <th className="py-1">Count</th>
                <th className="py-1">Rate</th>
                <th className="py-1">Brief&apos;s estimate</th>
              </tr>
            </thead>
            <tbody>
              {TARGETS.map((t) => (
                <tr key={t.key} className="border-t border-slate-100">
                  <td className="py-1">{t.label}</td>
                  <td className="py-1">{report[t.key]}</td>
                  <td className="py-1">{t.of ? pct(report[t.key], report[t.of]) : "-"}</td>
                  <td className="py-1 text-slate-500">{t.expect}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-slate-600">
            Also: {report.claimClicked} clicked Claim, {report.replied} replied, {report.removed} removed their page. Opens
            and visits can be inflated by email link scanners; claims are real clicks.
          </p>
          <p className="mt-2 text-sm font-medium text-slate-800">{advice}</p>
        </section>
      ) : null}

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
                    {r.storefront_url ? (
                      <a href={r.storefront_url} target="_blank" rel="noreferrer" className="block text-xs text-indigo-600 hover:underline">
                        Storefront
                      </a>
                    ) : null}
                    {r.opportunities ? (
                      <div className="mt-1 text-xs font-semibold text-slate-700">
                        {r.opportunities.counts.deals} on sale · {r.opportunities.counts.campaigns} campaigns
                      </div>
                    ) : r.score ? (
                      <div className="mt-1 text-xs font-semibold text-slate-700">Score {r.score.score}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status] ?? ""}`}>{r.status}</span>
                    {r.existing_customer ? <div className="mt-1 text-xs text-slate-500">already a customer</div> : null}
                    {r.view_count ? (
                      <div className="mt-1 text-xs text-slate-500">
                        {r.view_count} view(s), {Math.round((r.time_on_page_ms || 0) / 1000)}s on page
                      </div>
                    ) : null}
                    {r.claim_clicked_at && !r.claimed_at ? <div className="mt-1 text-xs text-slate-500">clicked Claim</div> : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {r.enrolled ? (r.enrollmentCancelled ? `stopped after ${r.lastStepSent}` : `${r.lastStepSent} of 4`) : "not enrolled"}
                    <div>
                      {r.bounced ? "bounced" : r.opened ? "opened" : r.delivered ? "delivered" : r.lastStepSent ? "sent" : ""}
                    </div>
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
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewId(r.id);
                        setEmailsId(null);
                      }}
                      className="block text-indigo-600 hover:underline"
                    >
                      Review page
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmailsId(r.id);
                        setPreviewId(null);
                      }}
                      className="block text-indigo-600 hover:underline"
                    >
                      Read the 4 emails
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
                    {!r.replied_at && ["sent", "viewed", "drafted"].includes(r.status) ? (
                      <button type="button" onClick={() => void act(r.id, "replied")} className="block text-violet-700 hover:underline">
                        Mark replied
                      </button>
                    ) : null}
                    {!["declined", "removed"].includes(r.status) && !r.claimed_at ? (
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
          ) : emailsRow ? (
            <div className="max-h-[760px] space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">Emails written for @{emailsRow.ig_handle}</h2>
              {(emailsRow.email_steps || []).map((s, i) => (
                <article key={i} className="rounded-lg border border-slate-100 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Email {i + 1}, day {[0, 3, 7, 14, 44, 74][i]}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{s.subject}</div>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-700">{s.body}</pre>
                </article>
              ))}
              <p className="text-xs text-slate-500">
                The link goes where it says {"{{INVITE_PREVIEW_URL}}"}; the address and unsubscribe footer are added when it
                sends.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
              Pick &quot;Review page&quot; to see a draft page here, or &quot;Read the 4 emails&quot; to read what goes out.
              Reviewing here never counts as a view.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
