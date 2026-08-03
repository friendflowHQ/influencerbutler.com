"use client";

/**
 * Owner scheduling console. Upcoming/past calls, a per-call prep sheet
 * (subscription + support history + "what Claude fixed"), per-call actions
 * (complete/no-show/cancel/reschedule/link/notes), and settings (availability
 * windows, manual blocks, config). Gated server-side by scheduling.view/manage.
 */

import { useCallback, useEffect, useState } from "react";

type AiNotes = { summary?: string; keyTopics?: string[]; actionItems?: string[]; followUps?: string[] };
type Booking = {
  id: string; user_email: string; user_name: string | null; call_type: "support" | "demo";
  starts_at: string; user_ends_at: string; user_timezone: string | null; status: string;
  topic: string | null; join_url: string | null; meeting_provider: string | null; host_notes: string | null;
  recording_status?: string | null; recording_url?: string | null;
  transcript?: string | null; ai_notes?: AiNotes | null; recorded_at?: string | null;
};
type Prep = {
  booking: Booking & { user_id: string | null };
  displayName: string | null;
  subscription: { status: string | null; plan_name: string | null; renews_at: string | null; ends_at: string | null; badge: { label: string; className: string } } | null;
  priorCalls: { id: string; call_type: string; starts_at: string; status: string; topic: string | null }[];
  support: {
    total: number; open: number;
    tickets: { id: string; title: string; status: string; priority: string; submittedAt: number | null }[];
    fixedHighlights: { id: string; title: string; resolvedVersion: string | null; fixCommitSha: string | null; note: string }[];
  };
};
type Rule = { id: string; weekday: number; start_min: number; end_min: number; timezone: string; effective_from: string | null; effective_to: string | null };
type Block = { id: string; starts_at: string; ends_at: string; label: string | null };
type Config = { booking_horizon_days: number; lead_time_hours: number; decoy_min_per_day: number; decoy_max_per_day: number; default_join_url: string | null };

const REPO = "https://github.com/friendflowHQ/InfluencerButler";
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function hhmm(min: number): string { const h = Math.floor(min / 60), m = min % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
function fmtWhen(iso: string, tz: string | null): string {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)); }
  catch { return new Date(iso).toLocaleString("en-US"); }
}

export default function SchedulingAdminPage() {
  const [forbidden, setForbidden] = useState(false);
  const [scope, setScope] = useState<"upcoming" | "past" | "all">("upcoming");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [prep, setPrep] = useState<Prep | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [tab, setTab] = useState<"calls" | "settings">("calls");
  const [settings, setSettings] = useState<{ config: Config | null; rules: Rule[]; blocks: Block[]; googleConnected?: boolean; googleEmail?: string | null } | null>(null);

  const loadList = useCallback(async () => {
    const res = await fetch(`/api/admin/scheduling/list?scope=${scope}`, { cache: "no-store" });
    if (res.status === 403) { setForbidden(true); return; }
    if (res.ok) setBookings((await res.json()).bookings ?? []);
  }, [scope]);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/admin/scheduling/settings", { cache: "no-store" });
    if (res.status === 403) { setForbidden(true); return; }
    if (res.ok) setSettings(await res.json());
  }, []);

  const [googleMsg, setGoogleMsg] = useState("");
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (tab === "settings") loadSettings(); }, [tab, loadSettings]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("google");
    if (!p) return;
    setTab("settings");
    setGoogleMsg(p === "connected" ? "Google Calendar connected. A Meet link is now created for each booking."
      : p === "notconfigured" ? "Google OAuth is not configured yet (set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in Vercel)."
      : "Could not connect Google Calendar. Please try again.");
  }, []);

  const openPrep = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/scheduling/prep?bookingId=${id}`, { cache: "no-store" });
    if (!res.ok) return;
    const p = (await res.json()) as Prep;
    setPrep(p); setNotes(p.booking.host_notes || "");
  }, []);

  const act = useCallback(async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/scheduling/update", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...body }) });
      if (res.ok) { await loadList(); if (prep?.booking.id === id) await openPrep(id); }
    } finally { setBusy(false); }
  }, [loadList, prep, openPrep]);

  const mutateSettings = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    try { await fetch("/api/admin/scheduling/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); await loadSettings(); }
    finally { setBusy(false); }
  }, [loadSettings]);

  if (forbidden) return <div className="rounded-xl border border-slate-200 bg-white p-6"><h1 className="text-lg font-semibold">Scheduling</h1><p className="mt-2 text-sm text-slate-600">Admin only.</p></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Scheduling</h1>
        <div className="flex gap-1">
          {(["calls", "settings"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm ${tab === t ? "bg-[#f97316] text-white" : "bg-slate-100 text-slate-600"}`}>{t === "calls" ? "Calls" : "Availability & settings"}</button>
          ))}
        </div>
      </div>

      {tab === "calls" && (
        <>
          <div className="flex gap-1">
            {(["upcoming", "past", "all"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setScope(s)} className={`rounded-full px-3 py-1 text-sm ${scope === s ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>{s}</button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Topic</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {bookings.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No calls.</td></tr> :
                  bookings.map((b) => (
                    <tr key={b.id} onClick={() => openPrep(b.id)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-700">{fmtWhen(b.starts_at, b.user_timezone)}</td>
                      <td className="px-3 py-2">{b.call_type}</td>
                      <td className="px-3 py-2 text-slate-600">{b.user_email}</td>
                      <td className="px-3 py-2"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{b.status}</span>{b.recording_status === "ready" ? <span className="ml-1 text-xs" title="Recorded, transcript + notes ready">🎙</span> : null}</td>
                      <td className="px-3 py-2 max-w-xs truncate text-slate-500">{b.topic || "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "settings" && googleMsg && <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{googleMsg}</div>}
      {tab === "settings" && settings && (
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Config</h2>
            {settings.config && (
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {([["booking_horizon_days", "Horizon (days)"], ["lead_time_hours", "Lead time (hours)"], ["decoy_min_per_day", "Decoys min/day"], ["decoy_max_per_day", "Decoys max/day"]] as const).map(([k, label]) => (
                  <label key={k} className="text-sm"><span className="block text-xs text-slate-500">{label}</span>
                    <input type="number" defaultValue={settings.config![k] as number} onBlur={(e) => mutateSettings({ action: "config", config: { [k]: Number(e.target.value) } })} className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" /></label>
                ))}
                <label className="col-span-2 text-sm sm:col-span-3"><span className="block text-xs text-slate-500">Fallback join link (used if Google Meet is not connected)</span>
                  <input defaultValue={settings.config.default_join_url || ""} onBlur={(e) => mutateSettings({ action: "config", config: { default_join_url: e.target.value } })} className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder="https://meet.google.com/xxx-xxxx-xxx" /></label>
              </div>
            )}
            {/* Google Meet connection */}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="text-xs font-medium text-slate-500">Google Meet</div>
              {settings.googleConnected ? (
                <div className="mt-1 flex items-center gap-3 text-sm">
                  <span className="text-emerald-700">Connected{settings.googleEmail ? ` as ${settings.googleEmail}` : ""}. A Meet link is created for each booking.</span>
                  <button type="button" disabled={busy} onClick={() => mutateSettings({ action: "disconnectGoogle" })} className="text-xs text-slate-400 hover:text-rose-600">Disconnect</button>
                </div>
              ) : (
                <div className="mt-1 text-sm">
                  <a href="/api/admin/scheduling/google/connect" className="inline-block rounded-lg bg-[#f97316] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#ea580c]">Connect Google Calendar</a>
                  <span className="ml-2 text-xs text-slate-500">Until connected, bookings use the fallback link above.</span>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Weekly availability</h2>
            <p className="mt-1 text-xs text-slate-500">Windows per weekday + timezone, with effective-date ranges (the Eastern to Mountain move is two sets of rows). 3-5pm and a few random blocks are decoy-held automatically.</p>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {settings.rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-1.5">
                  <span className="text-slate-700">{WD[r.weekday]} {hhmm(r.start_min)}–{hhmm(r.end_min)} · {r.timezone} {r.effective_from ? `from ${r.effective_from}` : ""}{r.effective_to ? ` until ${r.effective_to}` : ""}</span>
                  <button type="button" disabled={busy} onClick={() => mutateSettings({ action: "deleteRule", id: r.id })} className="text-xs text-slate-400 hover:text-rose-600">remove</button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Manual blocks (personal holds)</h2>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {settings.blocks.length === 0 && <li className="py-1.5 text-slate-400">None.</li>}
              {settings.blocks.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-1.5">
                  <span className="text-slate-700">{new Date(b.starts_at).toLocaleString("en-US")} → {new Date(b.ends_at).toLocaleTimeString("en-US")} {b.label ? `· ${b.label}` : ""}</span>
                  <button type="button" disabled={busy} onClick={() => mutateSettings({ action: "deleteBlock", id: b.id })} className="text-xs text-slate-400 hover:text-rose-600">remove</button>
                </li>
              ))}
            </ul>
            <AddBlock onAdd={(block) => mutateSettings({ action: "addBlock", block })} />
          </section>
        </div>
      )}

      {/* Prep sheet drawer */}
      {prep && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={() => setPrep(null)}>
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{prep.booking.call_type === "support" ? "Support call" : "Demo call"}</h2>
                <p className="text-sm text-slate-500">{fmtWhen(prep.booking.starts_at, prep.booking.user_timezone)} ({prep.booking.user_timezone || "?"})</p>
              </div>
              <button type="button" onClick={() => setPrep(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">✕</button>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div><dt className="text-slate-400">Customer</dt><dd className="text-slate-700">{prep.displayName || prep.booking.user_name || "—"} &lt;{prep.booking.user_email}&gt;</dd></div>
              <div><dt className="text-slate-400">Subscription</dt><dd>{prep.subscription ? <span className={`rounded px-1.5 py-0.5 text-xs ${prep.subscription.badge.className}`}>{prep.subscription.badge.label}</span> : <span className="text-slate-400">none</span>}{prep.subscription?.plan_name ? ` · ${prep.subscription.plan_name}` : ""}</dd></div>
              <div><dt className="text-slate-400">Status</dt><dd className="text-slate-700">{prep.booking.status}</dd></div>
              <div><dt className="text-slate-400">Join</dt><dd>{prep.booking.join_url ? <a className="text-[#f97316] hover:underline" href={prep.booking.join_url} target="_blank" rel="noreferrer">link ↗</a> : <span className="text-slate-400">none</span>}</dd></div>
            </dl>

            {prep.booking.topic && <section className="mt-3"><h3 className="text-xs font-semibold uppercase text-slate-500">What they want to cover</h3><p className="mt-1 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">{prep.booking.topic}</p></section>}

            <section className="mt-3">
              <h3 className="text-xs font-semibold uppercase text-slate-500">Support history ({prep.support.open} open / {prep.support.total} total)</h3>
              {prep.support.fixedHighlights.length > 0 && (
                <div className="mt-1">
                  <p className="text-xs text-slate-500">What Claude fixed:</p>
                  <ul className="mt-1 space-y-1">
                    {prep.support.fixedHighlights.map((f) => (
                      <li key={f.id} className="text-sm text-slate-700">• {f.title}{f.resolvedVersion ? ` (v${String(f.resolvedVersion).replace(/^v/i, "")})` : ""}{f.fixCommitSha ? <> · <a className="text-[#f97316] hover:underline" href={`${REPO}/commit/${f.fixCommitSha}`} target="_blank" rel="noreferrer">commit ↗</a></> : null}</li>
                    ))}
                  </ul>
                </div>
              )}
              <ul className="mt-2 space-y-1">
                {prep.support.tickets.slice(0, 8).map((t) => (
                  <li key={t.id} className="text-sm text-slate-600">[{t.status}] {t.title} <span className="text-xs text-slate-400">{t.priority}</span></li>
                ))}
                {prep.support.total === 0 && <li className="text-sm text-slate-400">No prior support tickets.</li>}
              </ul>
            </section>

            {prep.priorCalls.length > 0 && (
              <section className="mt-3"><h3 className="text-xs font-semibold uppercase text-slate-500">Prior calls</h3>
                <ul className="mt-1 space-y-1">{prep.priorCalls.map((c) => <li key={c.id} className="text-sm text-slate-600">{c.call_type} · {new Date(c.starts_at).toLocaleDateString("en-US")} · {c.status}</li>)}</ul>
              </section>
            )}

            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase text-slate-500">Private notes</h3>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              <button type="button" disabled={busy} onClick={() => act(prep.booking.id, { action: "notes", hostNotes: notes })} className="mt-1 rounded-lg bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">Save notes</button>
            </section>

            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase text-slate-500">Recording &amp; notes</h3>
              {(() => {
                const st = prep.booking.recording_status || "none";
                const n = prep.booking.ai_notes || null;
                if (st === "ready") {
                  return (
                    <div className="mt-1 space-y-2">
                      {prep.booking.recording_url && (
                        <a href={prep.booking.recording_url} target="_blank" rel="noreferrer" className="inline-block text-sm text-[#f97316] hover:underline">Open recording ↗</a>
                      )}
                      {n?.summary && <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-700">{n.summary}</p>}
                      {n?.keyTopics && n.keyTopics.length > 0 && (
                        <div><p className="text-xs font-medium text-slate-500">Key topics</p><ul className="ml-4 list-disc text-sm text-slate-700">{n.keyTopics.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
                      )}
                      {n?.actionItems && n.actionItems.length > 0 && (
                        <div><p className="text-xs font-medium text-slate-500">Action items</p><ul className="ml-4 list-disc text-sm text-slate-700">{n.actionItems.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
                      )}
                      {n?.followUps && n.followUps.length > 0 && (
                        <div><p className="text-xs font-medium text-slate-500">Follow-ups</p><ul className="ml-4 list-disc text-sm text-slate-700">{n.followUps.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
                      )}
                      {prep.booking.transcript && (
                        <details className="mt-1"><summary className="cursor-pointer text-xs text-slate-500">Full transcript</summary><pre className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{prep.booking.transcript}</pre></details>
                      )}
                    </div>
                  );
                }
                const msg = st === "scheduled" ? "A recording bot is scheduled to join this call."
                  : st === "recording" ? "Recording in progress."
                  : st === "processing" ? "Recording finished. Transcript and notes are being prepared."
                  : st === "failed" ? "Recording could not be captured for this call."
                  : st === "skipped_no_meet" ? "Not recorded. Connect Google Calendar so calls get a Meet room the bot can join."
                  : "Not recorded.";
                return <p className="mt-1 text-sm text-slate-500">{msg}</p>;
              })()}
            </section>

            <section className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => act(prep.booking.id, { action: "complete" })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Mark done</button>
              <button type="button" disabled={busy} onClick={() => act(prep.booking.id, { action: "no_show" })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">No-show</button>
              <button type="button" disabled={busy} onClick={() => { const url = prompt("Join link:", prep.booking.join_url || ""); if (url != null) act(prep.booking.id, { action: "link", joinUrl: url }); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Set link</button>
              <button type="button" disabled={busy} onClick={() => { if (confirm("Cancel and email the customer?")) act(prep.booking.id, { action: "cancel" }); }} className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50">Cancel</button>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function AddBlock({ onAdd }: { onAdd: (b: { starts_at: string; ends_at: string; label: string }) => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [label, setLabel] = useState("");
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-500">Start<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm" /></label>
      <label className="text-xs text-slate-500">End<input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm" /></label>
      <label className="text-xs text-slate-500">Label<input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder="Break" /></label>
      <button type="button" disabled={!start || !end} onClick={() => { onAdd({ starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), label }); setStart(""); setEnd(""); setLabel(""); }} className="rounded-lg bg-[#f97316] px-3 py-1.5 text-sm text-white disabled:opacity-50">Add block</button>
    </div>
  );
}
