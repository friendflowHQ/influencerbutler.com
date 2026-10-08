"use client";

/**
 * Owner scheduling console. Upcoming/past calls, a per-call prep sheet
 * (subscription + support history + "what Claude fixed"), per-call actions
 * (complete/no-show/cancel/reschedule/link/notes), and settings (availability
 * windows, manual blocks, config). Gated server-side by scheduling.view/manage.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { CALL_TYPES } from "@/lib/scheduling";
import { topicsForBooking } from "@/lib/call-topics";
import { TopicChips, TopicPicker } from "@/components/scheduling/TopicChips";
import { WD, hhmm, fmtWhen, fmtTime, startOfWeekSun, callPillClass, toLocalInput, eventDayKey, EVENTS_HREF, EVENT_PILL_CLASS, type Booking, type CalEvent } from "./shared";
import { CalendarDayView, CallCards, TopicFilterBar } from "./views";

type View = "list" | "day" | "week" | "month";
type Layout = "table" | "cards";

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
type RecurringBlock = { id: string; weekday: number; start_min: number; end_min: number; timezone: string; label: string | null };
type Config = { booking_horizon_days: number; lead_time_hours: number; decoy_min_per_day: number; decoy_max_per_day: number; default_join_url: string | null };

const REPO = "https://github.com/friendflowHQ/InfluencerButler";
// Renders in a specific IANA zone (used to show the customer's local time on the prep sheet).
function fmtWhenIn(iso: string, tz: string | null): string {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso)); }
  catch { return new Date(iso).toLocaleString("en-US"); }
}
// The admin's own resolved timezone, used to decide whether the customer is in a different zone.
function localTz(): string { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } }
// The exact date span a week/month grid renders, so the calendar can fetch that
// range directly instead of relying on the scope-filtered, 200-row-capped list
// (which can silently omit calls once the admin navigates away from "now").
function visibleRange(view: "day" | "week" | "month", anchor: DateTime): { from: DateTime; to: DateTime } {
  if (view === "day") { const start = anchor.startOf("day"); return { from: start, to: start.plus({ days: 1 }) }; }
  if (view === "week") { const start = startOfWeekSun(anchor); return { from: start, to: start.plus({ days: 7 }) }; }
  const gridStart = startOfWeekSun(anchor.startOf("month"));
  return { from: gridStart, to: gridStart.plus({ days: 42 }) };
}

// Human-readable confirmation per action, so a successful click is never silent.
function actLabel(action: string, emailSent: boolean, email: string): string {
  switch (action) {
    case "complete": return "Marked done.";
    case "no_show": return "Marked no-show.";
    case "no_show_email": return emailSent
      ? `Marked no-show. Rebooking email sent to ${email}.`
      : `Marked no-show, but the rebooking email could not be sent (check email logs).`;
    case "cancel": return emailSent
      ? `Call cancelled. Cancellation email sent to ${email}.`
      : `Call cancelled, but the cancellation email could not be sent (check email logs).`;
    case "notes": return "Notes saved.";
    case "link": return "Join link updated.";
    case "reschedule": return emailSent
      ? `Call moved. An updated invite was emailed to ${email}.`
      : `Call moved (no email sent to ${email}).`;
    default: return "Done.";
  }
}

export default function SchedulingAdminPage() {
  const [forbidden, setForbidden] = useState(false);
  const [scope, setScope] = useState<"upcoming" | "past" | "all">("upcoming");
  const [view, setView] = useState<View>("list");
  const [layout, setLayout] = useState<Layout>("table");
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [addPrefill, setAddPrefill] = useState<{ start: string; n: number } | null>(null);
  const [reschedOpen, setReschedOpen] = useState(false);
  const [showExpired, setShowExpired] = useState(false);
  const [calendarAnchor, setCalendarAnchor] = useState<DateTime>(() => DateTime.local());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [prep, setPrep] = useState<Prep | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [tab, setTab] = useState<"calls" | "settings">("calls");
  const [settings, setSettings] = useState<{ config: Config | null; rules: Rule[]; blocks: Block[]; recurringBlocks: RecurringBlock[]; googleConnected?: boolean; googleEmail?: string | null } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [actMsg, setActMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Remember the view/layout between visits (a per-viewer convenience only).
  useEffect(() => {
    try {
      const v = localStorage.getItem("ib.sched.view"); const l = localStorage.getItem("ib.sched.layout");
      if (v === "list" || v === "day" || v === "week" || v === "month") setView(v);
      if (l === "table" || l === "cards") setLayout(l);
    } catch { /* storage unavailable: defaults are fine */ }
  }, []);
  const chooseView = (v: View) => { setView(v); try { localStorage.setItem("ib.sched.view", v); } catch { /* ignore */ } };
  const chooseLayout = (l: Layout) => { setLayout(l); try { localStorage.setItem("ib.sched.layout", l); } catch { /* ignore */ } };

  const loadList = useCallback(async () => {
    // The calendar views fetch their own exact visible window (uncapped) instead
    // of the scope-filtered, 200-row list, so navigating the grid doesn't run
    // into calls that were simply never fetched.
    const qs = view === "list"
      ? `scope=${scope}${layout === "cards" ? "&enrich=1" : ""}`
      : (() => { const { from, to } = visibleRange(view, calendarAnchor); return `from=${from.toUTC().toJSDate().toISOString()}&to=${to.toUTC().toJSDate().toISOString()}`; })();
    const res = await fetch(`/api/admin/scheduling/list?${qs}`, { cache: "no-store" });
    if (res.status === 403) { setForbidden(true); return; }
    if (res.ok) { const j = await res.json(); setBookings(j.bookings ?? []); setEvents(j.events ?? []); setListError(null); }
    else { setBookings([]); setEvents([]); setListError(`Couldn't load calls (server error ${res.status}). This is a load failure, not an empty schedule. Check the /api/admin/scheduling/list response.`); }
  }, [scope, view, layout, calendarAnchor]);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/admin/scheduling/settings", { cache: "no-store" });
    if (res.status === 403) { setForbidden(true); return; }
    if (res.ok) setSettings(await res.json());
  }, []);

  const [googleMsg, setGoogleMsg] = useState("");
  useEffect(() => { loadList(); }, [loadList]);
  // Loaded on mount (not just when the Settings tab opens) so the connected
  // Google account email is already on hand for the prep sheet's Join line.
  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("google");
    if (!p) return;
    setTab("settings");
    setGoogleMsg(p === "connected" ? "Google Calendar connected. A Meet link is now created for each booking."
      : p === "notconfigured" ? "Google OAuth is not configured yet (set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in Vercel)."
      : "Could not connect Google Calendar. Please try again.");
  }, []);

  // The topic chip filter applies to every view.
  const shown = useMemo(
    () => (topicFilter ? bookings.filter((b) => topicsForBooking(b).some((t) => t.key === topicFilter)) : bookings),
    [bookings, topicFilter],
  );

  // Group events have no topic chips, so a topic filter hides them.
  const shownEvents = useMemo(() => (topicFilter ? [] : events), [events, topicFilter]);
  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of shownEvents) { const k = eventDayKey(e); (m.get(k) ?? m.set(k, []).get(k)!).push(e); }
    return m;
  }, [shownEvents]);

  // Table rows: calls and events merged in the same order as the list (soonest first for upcoming).
  const tableRows = useMemo(() => {
    const rows = [
      ...shown.map((b) => ({ at: b.starts_at, b, e: null as CalEvent | null })),
      ...shownEvents.map((e) => ({ at: e.starts_at, b: null as Booking | null, e })),
    ];
    return rows.sort((x, y) => (scope === "upcoming" ? x.at.localeCompare(y.at) : y.at.localeCompare(x.at)));
  }, [shown, shownEvents, scope]);

  // Buckets the shown bookings by local calendar day for the day/week/month views.
  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of shown) {
      // A cancelled call never happened and the slot is free again, so it
      // doesn't belong on the calendar; showing it reads as a duplicate of
      // whatever real call (if any) replaced it.
      if (b.status === "cancelled") continue;
      const key = DateTime.fromISO(b.starts_at).toLocal().toFormat("yyyy-MM-dd");
      (m.get(key) ?? m.set(key, []).get(key)!).push(b);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return m;
  }, [shown]);

  const openPrep = useCallback(async (id: string, opts?: { reschedule?: boolean }) => {
    setActMsg(null); setReschedOpen(!!opts?.reschedule);
    const res = await fetch(`/api/admin/scheduling/prep?bookingId=${id}`, { cache: "no-store" });
    if (!res.ok) return;
    const p = (await res.json()) as Prep;
    setPrep(p); setNotes(p.booking.host_notes || "");
  }, []);

  const act = useCallback(async (id: string, body: Record<string, unknown>) => {
    setBusy(true); setActMsg(null);
    const action = String(body.action || "");
    const email = prep?.booking.user_email || "the customer";
    try {
      const res = await fetch("/api/admin/scheduling/update", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...body }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        // Reload first (openPrep clears actMsg), then post the confirmation so it survives.
        await loadList(); if (prep?.booking.id === id) await openPrep(id);
        const warn = Array.isArray(j.warnings) && j.warnings.length ? ` ${j.warnings.join(" ")}` : "";
        setActMsg({ ok: true, text: actLabel(action, Boolean(j.emailSent), email) + warn });
      } else {
        setActMsg({ ok: false, text: j.error || `Action failed (server error ${res.status}).` });
      }
    } catch {
      setActMsg({ ok: false, text: "Action failed: could not reach the server. Please try again." });
    } finally { setBusy(false); }
  }, [loadList, prep, openPrep]);

  // Send a recording bot into a call now (or retry one that failed/was skipped).
  const rearmRecording = useCallback(async (id: string) => {
    setBusy(true); setActMsg(null);
    try {
      const res = await fetch("/api/admin/scheduling/rearm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        await loadList(); if (prep?.booking.id === id) await openPrep(id);
        setActMsg({ ok: true, text: "Recorder sent. The Influencer Butler Notetaker will join shortly (admit it from the Meet lobby if it knocks)." });
      } else {
        setActMsg({ ok: false, text: j.error || `Could not send the recorder (server error ${res.status}).` });
      }
    } catch {
      setActMsg({ ok: false, text: "Could not reach the server. Please try again." });
    } finally { setBusy(false); }
  }, [loadList, prep, openPrep]);

  // Returns true on success so the form can clear itself; surfaces the server
  // error (e.g. the slot_taken 409 that tells the admin to tick Force) otherwise.
  const createCall = useCallback(async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true); setAddMsg(null);
    try {
      const res = await fetch("/api/admin/scheduling/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        // A call whose time is already past is hidden by the "upcoming" filter, so
        // switch to a scope that shows it (auto-reloads via the scope effect) and
        // say where it went, instead of it silently vanishing.
        const past = typeof body.startMs === "number" && (body.startMs as number) < Date.now();
        if (past && scope === "upcoming") { setScope("all"); setAddMsg("Call added. Its start time is in the past, so it appears under All / Past, not Upcoming."); }
        else { setAddMsg("Call added."); await loadList(); }
        return true;
      }
      const j = await res.json().catch(() => ({}));
      setAddMsg(j.error || `Could not add the call (server error ${res.status}).`);
      return false;
    } finally { setBusy(false); }
  }, [loadList, scope]);

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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {view === "list" && (
                <div className="flex gap-1" role="group" aria-label="Which calls">
                  {(["upcoming", "past", "all"] as const).map((sc) => (
                    <button key={sc} type="button" aria-pressed={scope === sc} onClick={() => setScope(sc)} className={`rounded-full px-3 py-1 text-sm ${scope === sc ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>{sc}</button>
                  ))}
                </div>
              )}
              <div className="flex gap-1" role="group" aria-label="Calendar view">
                {(["list", "day", "week", "month"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => chooseView(v)} className={`rounded-full px-3 py-1 text-sm ${view === v ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>{v === "list" ? "List" : v === "day" ? "Day" : v === "week" ? "Week" : "Month"}</button>
                ))}
              </div>
              {view === "list" && (
                <div className="flex gap-1" role="group" aria-label="List layout">
                  {(["table", "cards"] as const).map((l) => (
                    <button key={l} type="button" aria-pressed={layout === l} onClick={() => chooseLayout(l)} className={`rounded-lg border px-2.5 py-1 text-sm ${layout === l ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{l === "table" ? "Table" : "Cards"}</button>
                  ))}
                </div>
              )}
              {view !== "list" && (
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setCalendarAnchor((a) => a.minus(view === "day" ? { days: 1 } : view === "week" ? { weeks: 1 } : { months: 1 }))} className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50" aria-label="Previous">‹</button>
                  <button type="button" onClick={() => setCalendarAnchor(DateTime.local())} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">Today</button>
                  <button type="button" onClick={() => setCalendarAnchor((a) => a.plus(view === "day" ? { days: 1 } : view === "week" ? { weeks: 1 } : { months: 1 }))} className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50" aria-label="Next">›</button>
                  <span className="text-sm text-slate-600">
                    {view === "day"
                      ? calendarAnchor.toFormat("ccc, MMM d, yyyy")
                      : view === "week"
                        ? `${startOfWeekSun(calendarAnchor).toFormat("MMM d")} - ${startOfWeekSun(calendarAnchor).plus({ days: 6 }).toFormat("MMM d, yyyy")}`
                        : calendarAnchor.toFormat("MMMM yyyy")}
                  </span>
                </div>
              )}
            </div>
            <button type="button" onClick={() => { setShowAdd((v) => !v); setAddMsg(null); setAddPrefill(null); }} className="rounded-lg bg-[#c2410c] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#9a3412]">{showAdd ? "Close" : "Add call"}</button>
          </div>
          <TopicFilterBar bookings={bookings} active={topicFilter} onChange={setTopicFilter} />
          {showAdd && <AddCall busy={busy} msg={addMsg} onAdd={createCall} prefill={addPrefill} />}
          {actMsg && !prep && (
            <p role="status" className={`rounded-lg px-3 py-2 text-sm ${actMsg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{actMsg.text}</p>
          )}
          {listError ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-center text-rose-600">{listError}</div>
          ) : view === "list" && layout === "cards" ? (
            <CallCards
              bookings={shown}
              events={shownEvents}
              descending={scope !== "upcoming"}
              emptyText={topicFilter ? "No calls with that topic." : "No calls."}
              a={{ onOpen: (id) => openPrep(id), onReschedule: (id) => openPrep(id, { reschedule: true }), onAct: (id, body) => act(id, body), busy }}
            />
          ) : view === "list" ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Topic</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tableRows.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">{topicFilter ? "No calls with that topic." : "No calls."}</td></tr> :
                    tableRows.map(({ b, e }) => e ? (
                      <tr key={`e-${e.id}`} className="bg-indigo-50/40">
                        <td className="px-3 py-2 text-slate-700"><a href={EVENTS_HREF} className="hover:underline">{fmtWhen(e.starts_at)}</a></td>
                        <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-xs ${EVENT_PILL_CLASS}`}>event</span></td>
                        <td className="px-3 py-2 text-slate-600">{typeof e.registrations === "number" ? `${e.registrations} registered` : "Group event"}</td>
                        <td className="px-3 py-2"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{e.status}</span></td>
                        <td className="max-w-sm px-3 py-2 text-slate-700"><div className="truncate">{e.title}</div></td>
                      </tr>
                    ) : b ? (
                      <tr key={b.id} onClick={() => openPrep(b.id)} className="cursor-pointer hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-700"><button type="button" onClick={(ev) => { ev.stopPropagation(); openPrep(b.id); }} className="text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700">{fmtWhen(b.starts_at)}</button></td>
                        <td className="px-3 py-2">{b.call_type}</td>
                        <td className="px-3 py-2 text-slate-600">{b.user_email}</td>
                        <td className="px-3 py-2"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{b.status}</span>{b.recording_status === "ready" ? <span className="ml-1 text-xs" title="Recorded, transcript + notes ready">🎙</span> : null}</td>
                        <td className="max-w-sm px-3 py-2 text-slate-500">
                          <TopicChips booking={b} size="xs" />
                          {b.topic ? <div className="mt-0.5 truncate">{b.topic}</div> : (topicsForBooking(b).length === 0 ? "-" : null)}
                        </td>
                      </tr>
                    ) : null)}
                </tbody>
              </table>
            </div>
          ) : view === "day" ? (
            <CalendarDayView
              anchor={calendarAnchor}
              items={byDay.get(calendarAnchor.toFormat("yyyy-MM-dd")) ?? []}
              events={eventsByDay.get(calendarAnchor.toFormat("yyyy-MM-dd")) ?? []}
              onOpen={openPrep}
              onSlot={(d) => { setAddPrefill({ start: toLocalInput(d.toMillis()), n: Date.now() }); setAddMsg(null); setShowAdd(true); }}
            />
          ) : view === "week" ? (
            <CalendarWeekView anchor={calendarAnchor} byDay={byDay} eventsByDay={eventsByDay} onOpen={openPrep} onAddDay={(d) => { setAddPrefill({ start: toLocalInput(d.set({ hour: 10, minute: 0 }).toMillis()), n: Date.now() }); setAddMsg(null); setShowAdd(true); }} />
          ) : (
            <CalendarMonthView anchor={calendarAnchor} byDay={byDay} eventsByDay={eventsByDay} onOpen={openPrep} onMore={(d) => { setCalendarAnchor(d); chooseView("week"); }} />
          )}
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
                  <span className="text-emerald-700">Connected{settings.googleEmail ? ` as ${settings.googleEmail}` : ""}. A Meet link is created for each booking. This account handles calls (Meet + Calendar) only; YouTube uploads use a separate account connected in Events.</span>
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
            <p className="mt-1 text-xs text-slate-500">Windows per weekday + timezone, with effective-date ranges (the Eastern to Mountain move is two sets of rows). A few random blocks inside each window are decoy-held automatically.</p>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {settings.rules.filter((r) => showExpired || !isExpired(r)).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-1.5">
                  <span className={isExpired(r) ? "text-slate-500" : "text-slate-700"}>{WD[r.weekday]} {hhmm(r.start_min)}–{hhmm(r.end_min)} · {r.timezone} {r.effective_from ? `from ${r.effective_from}` : ""}{r.effective_to ? ` until ${r.effective_to}` : ""}{isExpired(r) ? " (expired)" : ""}</span>
                  <button type="button" disabled={busy} onClick={() => mutateSettings({ action: "deleteRule", id: r.id })} className="text-xs text-slate-400 hover:text-rose-600">remove</button>
                </li>
              ))}
            </ul>
            {settings.rules.some(isExpired) && (
              <button type="button" onClick={() => setShowExpired((v) => !v)} className="mt-2 text-xs text-slate-600 underline hover:text-slate-900">
                {showExpired ? "Hide" : "Show"} {settings.rules.filter(isExpired).length} expired {settings.rules.filter(isExpired).length === 1 ? "window" : "windows"}
              </button>
            )}
            <AddRule timezones={Array.from(new Set(["America/Denver", "America/New_York", "America/Chicago", "America/Los_Angeles", ...settings.rules.map((r) => r.timezone)]))} defaultTz={settings.rules.find((r) => !isExpired(r))?.timezone || "America/Denver"} busy={busy} onAdd={(rule) => mutateSettings({ action: "addRule", rule })} />
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

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Weekly protected time (recurring)</h2>
            <p className="mt-1 text-xs text-slate-500">Always-on holds that repeat every week (deep-work focus, standing personal time). Slots overlapping these never appear. For flexible or one-off time, use your connected Google Calendar or the manual blocks above.</p>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {(settings.recurringBlocks ?? []).length === 0 && <li className="py-1.5 text-slate-400">None.</li>}
              {(settings.recurringBlocks ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-1.5">
                  <span className="text-slate-700">{WD[r.weekday]} {hhmm(r.start_min)}–{hhmm(r.end_min)} · {r.timezone}{r.label ? ` · ${r.label}` : ""}</span>
                  <button type="button" disabled={busy} onClick={() => mutateSettings({ action: "deleteRecurringBlock", id: r.id })} className="text-xs text-slate-400 hover:text-rose-600">remove</button>
                </li>
              ))}
            </ul>
            <AddRecurringBlock defaultTz={settings.rules[0]?.timezone || "America/Denver"} onAdd={(recurringBlock) => mutateSettings({ action: "addRecurringBlock", recurringBlock })} />
          </section>
        </div>
      )}

      {/* Prep sheet drawer */}
      {prep && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={() => { setPrep(null); setActMsg(null); }}>
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{CALL_TYPES[prep.booking.call_type].label}</h2>
                <p className="text-sm text-slate-500">{fmtWhen(prep.booking.starts_at)}</p>
                {prep.booking.user_timezone && prep.booking.user_timezone !== localTz() && (
                  <p className="text-xs text-slate-400">Customer&apos;s time: {fmtWhenIn(prep.booking.starts_at, prep.booking.user_timezone)} ({prep.booking.user_timezone})</p>
                )}
              </div>
              <button type="button" onClick={() => { setPrep(null); setActMsg(null); }} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">✕</button>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div><dt className="text-slate-400">Customer</dt><dd className="text-slate-700">{prep.displayName || prep.booking.user_name || "-"} &lt;{prep.booking.user_email}&gt;</dd></div>
              <div><dt className="text-slate-400">Subscription</dt><dd>{prep.subscription ? <span className={`rounded px-1.5 py-0.5 text-xs ${prep.subscription.badge.className}`}>{prep.subscription.badge.label}</span> : <span className="text-slate-400">none</span>}{prep.subscription?.plan_name ? ` · ${prep.subscription.plan_name}` : ""}</dd></div>
              <div><dt className="text-slate-400">Status</dt><dd className="text-slate-700">{prep.booking.status}</dd></div>
              <div><dt className="text-slate-400">Join</dt><dd>{prep.booking.join_url ? <a className="text-[#f97316] hover:underline" href={prep.booking.join_url} target="_blank" rel="noreferrer">link ↗</a> : <span className="text-slate-400">none</span>}{prep.booking.join_url && prep.booking.meeting_provider === "google_meet" && settings?.googleEmail ? <span className="ml-1 text-xs text-slate-400">({settings.googleEmail})</span> : null}</dd></div>
            </dl>

            {(topicsForBooking(prep.booking).length > 0 || prep.booking.topic) && (
              <section className="mt-3">
                <h3 className="text-xs font-semibold uppercase text-slate-500">What they want to cover</h3>
                <div className="mt-1"><TopicChips booking={prep.booking} /></div>
                {prep.booking.topic && <p className="mt-1 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">{prep.booking.topic}</p>}
              </section>
            )}

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
                      {prep.booking.filed_ticket_ids && prep.booking.filed_ticket_ids.length > 0 && (
                        <div><p className="text-xs font-medium text-slate-500">Auto-filed tickets</p><ul className="ml-4 list-disc text-sm text-slate-700">{prep.booking.filed_ticket_ids.map((id) => <li key={id}><a href={`/dashboard/admin/support?ticket=${encodeURIComponent(id)}`} className="text-[#f97316] hover:underline">{id}</a></li>)}</ul></div>
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
                  : st === "skipped_no_meet" ? "Not recorded. Add a Google Meet link (or connect Google Calendar), then send the recorder."
                  : "Not recorded.";
                // Recovery: for a call that has a Meet link but no live recording,
                // let the owner send the bot in now (works mid-call).
                const canRearm =
                  ["failed", "skipped_no_meet", "none"].includes(st) &&
                  !!prep.booking.join_url &&
                  prep.booking.status !== "cancelled";
                return (
                  <div className="mt-1">
                    <p className="text-sm text-slate-500">{msg}</p>
                    {canRearm && (
                      <button type="button" disabled={busy} onClick={() => rearmRecording(prep.booking.id)} className="mt-1.5 rounded-lg bg-[#f97316] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50">Send recorder now</button>
                    )}
                  </div>
                );
              })()}
            </section>

            <section className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => act(prep.booking.id, { action: "complete" })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Mark done</button>
              <button type="button" disabled={busy} onClick={() => act(prep.booking.id, { action: "no_show" })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">No-show</button>
              <button type="button" disabled={busy} onClick={() => { if (confirm("Mark no-show and email the customer to rebook?")) act(prep.booking.id, { action: "no_show_email" }); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">No-show + email</button>
              <button type="button" disabled={busy} onClick={() => { const url = prompt("Join link:", prep.booking.join_url || ""); if (url != null) act(prep.booking.id, { action: "link", joinUrl: url }); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Set link</button>
              {prep.booking.status !== "cancelled" && prep.booking.status !== "completed" && (
                <button type="button" disabled={busy} aria-expanded={reschedOpen} onClick={() => setReschedOpen((v) => !v)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Reschedule</button>
              )}
              <button type="button" disabled={busy} onClick={() => { if (confirm("Cancel and email the customer?")) act(prep.booking.id, { action: "cancel" }); }} className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50">Cancel</button>
            </section>
            {reschedOpen && prep.booking.status !== "cancelled" && prep.booking.status !== "completed" && (
              <ReschedulePanel
                key={prep.booking.starts_at}
                currentStartMs={Date.parse(prep.booking.starts_at)}
                busy={busy}
                onMove={(newStartMs, force, sendEmail) => act(prep.booking.id, { action: "reschedule", newStartMs, force, sendEmail })}
              />
            )}
            {actMsg && (
              <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${actMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{actMsg.text}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Cancelled calls never reach the grids (byDay drops them before grouping).
function CalendarWeekView({ anchor, byDay, eventsByDay, onOpen, onAddDay }: { anchor: DateTime; byDay: Map<string, Booking[]>; eventsByDay: Map<string, CalEvent[]>; onOpen: (id: string) => void; onAddDay: (day: DateTime) => void }) {
  const start = startOfWeekSun(anchor);
  const days = Array.from({ length: 7 }, (_, i) => start.plus({ days: i }));
  const today = DateTime.local().toFormat("yyyy-MM-dd");
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
      <div className="grid min-w-[700px] grid-cols-7 gap-2">
        {days.map((d) => {
          const key = d.toFormat("yyyy-MM-dd");
          const items = byDay.get(key) ?? [];
          const evs = eventsByDay.get(key) ?? [];
          const isToday = key === today;
          return (
            <div key={key} className={`min-h-[150px] rounded-lg border p-2 ${isToday ? "border-[#f97316] bg-orange-50/40" : "border-slate-200"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-500">{d.toFormat("ccc")}</div>
                  <div className={`text-sm font-semibold ${isToday ? "text-[#c2410c]" : "text-slate-700"}`}>{d.toFormat("d")}</div>
                </div>
                <button type="button" onClick={() => onAddDay(d)} aria-label={`Add a call on ${d.toFormat("cccc LLLL d")}`} className="rounded px-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700">+</button>
              </div>
              <div className="mt-1.5 space-y-1">
                {items.length === 0 && evs.length === 0 && <div className="text-xs text-slate-500">No calls.</div>}
                {evs.map((e) => (
                  <a key={e.id} href={EVENTS_HREF} title={`${e.title}${typeof e.registrations === "number" ? ` (${e.registrations} registered)` : ""}`} className={`block w-full rounded-lg px-1.5 py-1 text-left text-xs hover:opacity-80 ${EVENT_PILL_CLASS}`}>
                    <span className="block truncate">{fmtTime(e.starts_at)} · Event</span>
                    <span className="block truncate font-medium">{e.title}</span>
                  </a>
                ))}
                {items.map((b) => (
                  <button key={b.id} type="button" onClick={() => onOpen(b.id)} className={`block w-full rounded-lg px-1.5 py-1 text-left text-xs hover:opacity-80 ${callPillClass(b)}`}>
                    <span className="block truncate">{fmtTime(b.starts_at)} · {b.user_email}</span>
                    {topicsForBooking(b).length > 0 && <span className="mt-0.5 block"><TopicChips booking={b} size="xs" /></span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarMonthView({ anchor, byDay, eventsByDay, onOpen, onMore }: { anchor: DateTime; byDay: Map<string, Booking[]>; eventsByDay: Map<string, CalEvent[]>; onOpen: (id: string) => void; onMore: (day: DateTime) => void }) {
  const gridStart = startOfWeekSun(anchor.startOf("month"));
  const days = Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }));
  const today = DateTime.local().toFormat("yyyy-MM-dd");
  const MAX_PER_CELL = 3;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
          {WD.map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const key = d.toFormat("yyyy-MM-dd");
            const items = byDay.get(key) ?? [];
            const evs = eventsByDay.get(key) ?? [];
            const evShown = evs.slice(0, MAX_PER_CELL);
            const callBudget = MAX_PER_CELL - evShown.length;
            const inMonth = d.month === anchor.month;
            const isToday = key === today;
            return (
              <div key={key} className={`min-h-[96px] rounded-lg border p-1.5 ${isToday ? "border-[#f97316]" : "border-slate-200"} ${inMonth ? "bg-white" : "bg-slate-50"}`}>
                <div className={`text-xs ${!inMonth ? "text-slate-300" : isToday ? "font-semibold text-[#c2410c]" : "text-slate-600"}`}>{d.toFormat("d")}</div>
                <div className="mt-1 space-y-0.5">
                  {evShown.map((e) => (
                    <a key={e.id} href={EVENTS_HREF} title={`Event: ${e.title}`} className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] hover:opacity-80 ${EVENT_PILL_CLASS}`}>
                      {fmtTime(e.starts_at)} Event: {e.title}
                    </a>
                  ))}
                  {items.slice(0, callBudget).map((b) => (
                    <button key={b.id} type="button" onClick={() => onOpen(b.id)} title={topicsForBooking(b).map((t) => t.label).join(", ") || undefined} className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] hover:opacity-80 ${callPillClass(b)}`}>
                      {fmtTime(b.starts_at)} {b.user_email}
                    </button>
                  ))}
                  {items.length + evs.length > MAX_PER_CELL && (
                    <button type="button" onClick={() => onMore(d)} className="block w-full truncate rounded px-1 py-0.5 text-left text-[11px] text-slate-600 hover:underline">+{items.length + evs.length - MAX_PER_CELL} more</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AddBlock({ onAdd }: { onAdd: (b: { starts_at: string; ends_at: string; label: string }) => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [label, setLabel] = useState("");
  // End must be after start: an inverted block breaks the booking overlap check
  // for every customer (the DB range constructor throws), so never let one be added.
  const valid = start !== "" && end !== "" && new Date(end).getTime() > new Date(start).getTime();
  const inverted = start !== "" && end !== "" && new Date(end).getTime() <= new Date(start).getTime();
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-500">Start<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm" /></label>
      <label className="text-xs text-slate-500">End<input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm" />{inverted && <span className="mt-0.5 block text-[11px] text-rose-600">End must be after start.</span>}</label>
      <label className="text-xs text-slate-500">Label<input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder="Break" /></label>
      <button type="button" disabled={!valid} onClick={() => { onAdd({ starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), label }); setStart(""); setEnd(""); setLabel(""); }} className="rounded-lg bg-[#f97316] px-3 py-1.5 text-sm text-white disabled:opacity-50">Add block</button>
    </div>
  );
}

// Manually add a call without the customer going through the front-end booking
// flow. Times are entered in the admin's own browser timezone; the browser IANA
// zone is sent along so the customer-facing invite renders in the same clock.
function AddCall({ busy, msg, onAdd, prefill }: { busy: boolean; msg: string | null; onAdd: (body: Record<string, unknown>) => Promise<boolean>; prefill: { start: string; n: number } | null }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"support" | "demo">("support");
  const [start, setStart] = useState("");
  const [topic, setTopic] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [joinUrl, setJoinUrl] = useState("");
  const [meetingId, setMeetingId] = useState<string | null>(null); // set when the link is a generated Google Meet room
  const [gen, setGen] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [sendEmail, setSendEmail] = useState(false);
  const [force, setForce] = useState(false);
  const valid = email.includes("@") && start !== "";
  // Clicking an empty slot in the Day/Week view opens this form with that time filled in.
  useEffect(() => { if (prefill) setStart(prefill.start); }, [prefill]);
  const startInPast = start !== "" && new Date(start).getTime() < Date.now();

  const generateMeet = async () => {
    setGenMsg(null);
    // datetime-local reads as "" until BOTH date and time are set, so guide the
    // owner instead of silently doing nothing.
    if (!email.includes("@")) { setGenMsg("Enter the customer email first."); return; }
    if (start === "") { setGenMsg("Pick a start date and time first (the time is still blank)."); return; }
    setGen(true);
    try {
      const res = await fetch("/api/admin/scheduling/meet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, startMs: new Date(start).getTime(), email: email.trim(), topic: topic.trim() || undefined }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.joinUrl) { setJoinUrl(j.joinUrl); setMeetingId(j.meetingId || null); setGenMsg("Google Meet link created."); }
      else setGenMsg(j.error || `Could not create a link (server error ${res.status}).`);
    } finally { setGen(false); }
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Add a call</h2>
      <p className="mt-1 text-xs text-slate-500">Drops a call onto the schedule directly. The time is in your timezone ({localTz()}).</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-500">Customer email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder="name@example.com" /></label>
        <label className="text-xs text-slate-500">Name (optional)<input value={name} onChange={(e) => setName(e.target.value)} className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" /></label>
        <label className="text-xs text-slate-500">Type
          <select value={type} onChange={(e) => setType(e.target.value as "support" | "demo")} className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1 text-sm">
            <option value="support">Priority 1:1</option>
            <option value="demo">Setup</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">Start<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" />{startInPast && <span className="mt-0.5 block text-[11px] text-amber-600">This time is in the past, so the call will land under Past, not Upcoming.</span>}</label>
        <div className="sm:col-span-2"><TopicPicker value={topics} onChange={setTopics} legend="Topics" /></div>
        <label className="text-xs text-slate-500 sm:col-span-2">Notes (optional)<input value={topic} onChange={(e) => setTopic(e.target.value)} className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder="What they want to cover" /></label>
        <div className="text-xs text-slate-500 sm:col-span-2">
          <div className="flex items-center justify-between">
            <span>Join link (optional){meetingId ? <span className="ml-1 rounded bg-emerald-50 px-1 py-0.5 text-[10px] text-emerald-700">Google Meet</span> : null}</span>
            <button type="button" disabled={gen} onClick={generateMeet} className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">{gen ? "Generating..." : "Generate Meet link"}</button>
          </div>
          <input value={joinUrl} onChange={(e) => { setJoinUrl(e.target.value); setMeetingId(null); }} className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder="https://meet.google.com/xxx-xxxx-xxx" />
          {genMsg && <p className="mt-1 text-[11px] text-slate-500">{genMsg}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />Email the customer a confirmation</label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />Force / allow overlap</label>
      </div>
      {msg && <p className="mt-2 text-xs text-slate-600">{msg}</p>}
      <button
        type="button"
        disabled={!valid || busy}
        onClick={async () => {
          const startMs = new Date(start).getTime();
          const ok = await onAdd({ email: email.trim(), name: name.trim() || undefined, type, startMs, timezone: localTz(), topic: topic.trim() || undefined, topics, joinUrl: joinUrl.trim() || undefined, meetingId: meetingId || undefined, meetingProvider: meetingId ? "google_meet" : undefined, sendEmail, force });
          if (ok) { setEmail(""); setName(""); setStart(""); setTopic(""); setTopics([]); setJoinUrl(""); setMeetingId(null); setGenMsg(null); setSendEmail(false); setForce(false); }
        }}
        className="mt-3 rounded-lg bg-[#c2410c] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#9a3412] disabled:opacity-50"
      >Add call</button>
    </div>
  );
}

function toMin(hhmmStr: string): number { const [h, m] = hhmmStr.split(":").map(Number); return (h || 0) * 60 + (m || 0); }

function AddRecurringBlock({ defaultTz, onAdd }: { defaultTz: string; onAdd: (b: { weekday: number; start_min: number; end_min: number; timezone: string; label: string }) => void }) {
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [label, setLabel] = useState("");
  const valid = start !== "" && end !== "" && toMin(end) > toMin(start);
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-500">Day
        <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm">
          {WD.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-500">Start<input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm" /></label>
      <label className="text-xs text-slate-500">End<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm" /></label>
      <label className="text-xs text-slate-500">Label<input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder="Deep work" /></label>
      <button type="button" disabled={!valid} onClick={() => { onAdd({ weekday, start_min: toMin(start), end_min: toMin(end), timezone: defaultTz, label }); setStart(""); setEnd(""); setLabel(""); }} className="rounded-lg bg-[#f97316] px-3 py-1.5 text-sm text-white disabled:opacity-50">Add protected time</button>
    </div>
  );
}

// A window whose effective_to is today or earlier never produces slots again
// (effective_to is exclusive), so it only clutters the list.
function isExpired(r: Rule): boolean {
  return !!r.effective_to && r.effective_to <= DateTime.local().toFormat("yyyy-MM-dd");
}

// Move a call to a new time. The server refuses past times and overlaps unless
// "Allow overlap" is ticked, moves the Meet event + recording bot, and (by
// default) emails the customer an updated invite.
function ReschedulePanel({ currentStartMs, busy, onMove }: { currentStartMs: number; busy: boolean; onMove: (newStartMs: number, force: boolean, sendEmail: boolean) => void }) {
  const [start, setStart] = useState(toLocalInput(currentStartMs));
  const [force, setForce] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const ms = start ? new Date(start).getTime() : NaN;
  const valid = Number.isFinite(ms) && ms !== currentStartMs;
  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label="Reschedule this call">
      <h3 className="text-xs font-semibold uppercase text-slate-500">Move to a new time</h3>
      <p className="mt-1 text-xs text-slate-500">Your timezone ({localTz()}). This ignores your usual availability windows, but checks for conflicts.</p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">New start<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm" /></label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />Email the customer the new time</label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />Allow overlap</label>
        <button type="button" disabled={!valid || busy} onClick={() => onMove(ms, force, sendEmail)} className="rounded-lg bg-[#c2410c] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#9a3412] disabled:opacity-50">Move call</button>
      </div>
    </section>
  );
}

// Add a weekly availability window (the API's addRule action had no UI before).
function AddRule({ timezones, defaultTz, busy, onAdd }: { timezones: string[]; defaultTz: string; busy: boolean; onAdd: (r: { weekday: number; start_min: number; end_min: number; timezone: string; effective_from: string | null; effective_to: string | null }) => void }) {
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("14:00");
  const [tz, setTz] = useState(defaultTz);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const valid = days.length > 0 && start !== "" && end !== "" && toMin(end) > toMin(start) && (!from || !until || until > from);
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <h3 className="text-xs font-semibold text-slate-600">Add a window</h3>
      <fieldset className="mt-1">
        <legend className="sr-only">Days of the week</legend>
        <div className="flex flex-wrap gap-1">
          {WD.map((d, i) => (
            <button key={d} type="button" aria-pressed={days.includes(i)} onClick={() => setDays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))}
              className={`rounded-full px-2.5 py-0.5 text-xs ${days.includes(i) ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>{d}</button>
          ))}
        </div>
      </fieldset>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">Start<input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm" /></label>
        <label className="text-xs text-slate-500">End<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm" /></label>
        <label className="text-xs text-slate-500">Timezone
          <select value={tz} onChange={(e) => setTz(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm">
            {timezones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">From (optional)<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm" /></label>
        <label className="text-xs text-slate-500">Until (optional)<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm" /></label>
        <button type="button" disabled={!valid || busy} onClick={() => { for (const wd of days) onAdd({ weekday: wd, start_min: toMin(start), end_min: toMin(end), timezone: tz, effective_from: from || null, effective_to: until || null }); }} className="rounded-lg bg-[#c2410c] px-3 py-1.5 text-sm text-white hover:bg-[#9a3412] disabled:opacity-50">Add window</button>
      </div>
      {from && until && until <= from && <p className="mt-1 text-xs text-rose-700">Until must be after From.</p>}
    </div>
  );
}
