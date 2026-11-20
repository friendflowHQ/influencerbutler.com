"use client";

/**
 * Owner view of Butler AI concierge sessions: who talked to the AI, when, and
 * an AI summary of each conversation for follow-up. Super-admin only (the API
 * enforces it). Read-only list with an expandable summary per row.
 */

import { Fragment, useCallback, useEffect, useState } from "react";

type Summary = { summary?: string; keyTopics?: string[]; actionItems?: string[]; followUps?: string[] };
type Session = {
  id: string;
  user_email: string | null;
  mode: string;
  started_at: string;
  ended_at: string | null;
  summary: Summary | null;
  filed_ticket_ids: string[] | null;
};

// How stale the newest session can get before we flag it: logging happens on
// every concierge session end, so a gap this long past one usually means the
// write path broke, not just a quiet day.
const STALE_HOURS = 72;

function fmt(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function duration(a: string, b: string | null): string {
  if (!b) return "-";
  const ms = Date.parse(b) - Date.parse(a);
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  const m = Math.round(ms / 60000);
  return m < 1 ? "<1 min" : `${m} min`;
}

type QualityData = {
  days: number;
  feedback: {
    up: number;
    down: number;
    bySurface: Record<string, { up: number; down: number }>;
    recentDown: Array<{ surface: string | null; reason: string | null; question: string | null; answer: string | null; created_at: string }>;
    missing: boolean;
  };
  misses: { top: Array<{ query: string; count: number; confidence: string; lastSeen: string }>; missing: boolean };
};

// Answer quality: thumbs ratio, the answers people marked unhelpful, and the
// searches that found no guide (topics that need a new tutorial or video).
function QualitySection() {
  const [data, setData] = useState<QualityData | null>(null);
  useEffect(() => {
    fetch("/api/admin/ai-feedback?days=30", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j))
      .catch(() => setData(null));
  }, []);
  if (!data) return null;
  const { feedback: f, misses: m } = data;
  const total = f.up + f.down;
  const helpful = total ? Math.round((f.up / total) * 100) : null;
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">Answer quality, last {data.days} days</h2>
      {f.missing || m.missing ? (
        <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {f.missing && "ai_concierge_feedback table is not applied yet. "}
          {m.missing && "ai_concierge_search_misses table is not applied yet. "}
          Run the matching files in supabase/migrations in the Supabase SQL editor.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-6 text-sm">
        <div><p className="text-2xl font-semibold text-slate-900">{helpful === null ? "-" : `${helpful}%`}</p><p className="text-xs text-slate-500">found helpful ({total} ratings)</p></div>
        {Object.entries(f.bySurface).map(([surface, c]) => (
          <div key={surface}><p className="text-lg font-semibold text-slate-900">{c.up} up / {c.down} down</p><p className="text-xs text-slate-500">{surface}</p></div>
        ))}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Topics with no good guide ({m.top.length})</h3>
        {m.top.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">None recorded yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100 text-sm">
            {m.top.map((t) => (
              <li key={t.query} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate text-slate-700">{t.query}</span>
                <span className="shrink-0 text-xs text-slate-500">{t.count}x{t.confidence === "none" ? " (no match)" : " (weak)"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Recent answers marked unhelpful</h3>
        {f.recentDown.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">None yet.</p>
        ) : (
          <ul className="mt-1 space-y-3 text-sm">
            {f.recentDown.map((r, i) => (
              <li key={i} className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{fmt(r.created_at)} · {r.surface || "unknown"}{r.reason ? ` · ${r.reason}` : ""}</p>
                <p className="mt-1 font-medium text-slate-800">{r.question || "-"}</p>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-slate-600">{r.answer || "-"}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function AiSessionsPage() {
  const [forbidden, setForbidden] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai-sessions", { cache: "no-store" });
      if (res.status === 403) { setForbidden(true); return; }
      if (res.ok) setSessions((await res.json()).sessions ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (forbidden) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-semibold">AI sessions</h1>
        <p className="mt-2 text-sm text-slate-600">Admin only.</p>
      </div>
    );
  }

  const newest = sessions[0]?.started_at;
  const staleHours = newest ? (Date.now() - Date.parse(newest)) / 3_600_000 : null;
  const isStale = !loading && staleHours !== null && staleHours > STALE_HOURS;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900">Butler AI sessions</h1>
      <p className="text-sm text-slate-500">Instant AI demo and support conversations, newest first. Click a row for the summary.</p>

      <QualitySection />

      {isStale && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No new session in {Math.floor((staleHours as number) / 24)} days (last one {fmt(newest ?? null)}). If the
          concierge is still being used, the logging path is likely broken - check the Vercel function logs for
          <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 text-xs">[ai-concierge/session]</code>
          and
          <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 text-xs">[ai-concierge/transcript]</code>
          around a known usage time, and confirm <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 text-xs">SUPABASE_SERVICE_ROLE_KEY</code> in Vercel matches the current Supabase key.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2">Length</th>
              <th className="px-3 py-2">Summary</th>
              <th className="px-3 py-2">Tickets</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : sessions.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No AI sessions yet.</td></tr>
            ) : (
              sessions.map((s) => (
                <Fragment key={s.id}>
                  <tr onClick={() => setOpen(open === s.id ? null : s.id)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-700">{fmt(s.started_at)}</td>
                    <td className="px-3 py-2 text-slate-600">{s.user_email || "-"}</td>
                    <td className="px-3 py-2"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{s.mode}</span></td>
                    <td className="px-3 py-2 text-slate-500">{duration(s.started_at, s.ended_at)}</td>
                    <td className="px-3 py-2 max-w-md truncate text-slate-500">{s.summary?.summary || "-"}</td>
                    <td className="px-3 py-2">
                      {s.filed_ticket_ids?.length ? (
                        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-800">
                          {s.filed_ticket_ids.length} filed
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  </tr>
                  {open === s.id && s.summary && (
                    <tr className="bg-slate-50">
                      <td colSpan={6} className="px-4 py-3">
                        <p className="text-sm text-slate-700">{s.summary.summary}</p>
                        {!!s.summary.keyTopics?.length && (
                          <p className="mt-2 text-xs text-slate-500">Topics: {s.summary.keyTopics.join(", ")}</p>
                        )}
                        {!!s.summary.actionItems?.length && (
                          <div className="mt-2">
                            <p className="text-xs font-semibold text-slate-500">Action items</p>
                            <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                              {s.summary.actionItems.map((a, i) => <li key={i}>{a}</li>)}
                            </ul>
                          </div>
                        )}
                        {!!s.summary.followUps?.length && (
                          <div className="mt-2">
                            <p className="text-xs font-semibold text-slate-500">Follow-ups</p>
                            <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                              {s.summary.followUps.map((a, i) => <li key={i}>{a}</li>)}
                            </ul>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
