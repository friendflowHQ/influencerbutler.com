"use client";

/**
 * Extra views for the scheduling console: the hourly Day view, the Cards view
 * (grouped by day, with each customer's plan and history attached) and the
 * topic-chip filter bar. Pure presentation: data and actions come from page.tsx.
 */

import { DateTime } from "luxon";
import { CALL_TYPES } from "@/lib/scheduling";
import { CALL_TOPICS, topicsForBooking } from "@/lib/call-topics";
import { TopicChips } from "@/components/scheduling/TopicChips";
import { EVENTS_HREF, EVENT_PILL_CLASS, callPillClass, eventDayKey, fmtTime, fmtWhen, hasPassed, relTime, statusPillClass, type Booking, type CalEvent } from "./shared";

const HOUR_PX = 56;

// ---------------------------------------------------------------- filter bar

/** Click a chip to show only calls with that topic; click it again to clear. */
export function TopicFilterBar({ bookings, active, onChange }: { bookings: Booking[]; active: string | null; onChange: (key: string | null) => void }) {
  const counts = new Map<string, number>();
  for (const b of bookings) for (const t of topicsForBooking(b)) counts.set(t.key, (counts.get(t.key) ?? 0) + 1);
  const present = CALL_TOPICS.filter((t) => counts.has(t.key));
  if (present.length === 0 && !active) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter calls by topic">
      <span className="text-xs text-slate-500">Topic:</span>
      <button type="button" onClick={() => onChange(null)} aria-pressed={active === null}
        className={`rounded-full px-2.5 py-0.5 text-xs ring-1 ring-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 ${active === null ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"}`}>All</button>
      {present.map((t) => (
        <button key={t.key} type="button" onClick={() => onChange(active === t.key ? null : t.key)} aria-pressed={active === t.key}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 ${t.chipClass} ${active === t.key ? "outline outline-2 outline-offset-1 outline-slate-700" : ""}`}>
          {t.label}<span className="opacity-70">{counts.get(t.key)}</span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ day view

type Entry = { key: string; b?: Booking; e?: CalEvent; starts: string; ends: string };
type Placed = Entry & { m0: number; m1: number; lane: number; lanes: number };

// Side-by-side lanes for overlapping calls, so two calls at the same time are
// both visible instead of one hiding the other.
function layoutDay(items: Entry[]): Placed[] {
  const evs = items.map((it) => {
    const s = DateTime.fromISO(it.starts).toLocal();
    const e = DateTime.fromISO(it.ends).toLocal();
    const m0 = s.hour * 60 + s.minute;
    const dur = Math.max(30, Math.round(e.diff(s, "minutes").minutes) || 30);
    return { ...it, m0, m1: m0 + dur, lane: 0, lanes: 1 };
  }).sort((a, b) => a.m0 - b.m0);
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => { for (const p of cluster) p.lanes = laneEnds.length || 1; out.push(...cluster); cluster = []; laneEnds = []; clusterEnd = -1; };
  for (const ev of evs) {
    if (cluster.length && ev.m0 >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= ev.m0);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(ev.m1); } else laneEnds[lane] = ev.m1;
    clusterEnd = Math.max(clusterEnd, ev.m1);
    cluster.push({ ...ev, lane });
  }
  flush();
  return out;
}

export function CalendarDayView({ anchor, items, events = [], onOpen, onSlot }: { anchor: DateTime; items: Booking[]; events?: CalEvent[]; onOpen: (id: string) => void; onSlot: (start: DateTime) => void }) {
  const day = anchor.startOf("day");
  const placed = layoutDay([
    ...events.map((e): Entry => ({ key: `e-${e.id}`, e, starts: e.starts_at, ends: e.ends_at })),
    ...items.map((b): Entry => ({ key: b.id, b, starts: b.starts_at, ends: b.user_ends_at })),
  ]);
  const firstMin = placed.length ? Math.min(...placed.map((p) => p.m0)) : 600;
  const lastMin = placed.length ? Math.max(...placed.map((p) => p.m1)) : 1020;
  const startHour = Math.min(8, Math.floor(firstMin / 60));
  const endHour = Math.min(24, Math.max(18, Math.ceil(lastMin / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const now = DateTime.local();
  const isToday = now.hasSame(day, "day");
  const nowTop = ((now.hour * 60 + now.minute) - startHour * 60) / 60 * HOUR_PX;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
      <div className="mb-2 text-sm font-semibold text-slate-700">{day.toFormat("cccc, LLLL d")}{isToday ? <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-[#c2410c]">Today</span> : null}</div>
      <div className="relative min-w-[420px]" style={{ height: hours.length * HOUR_PX }}>
        {/* Hour grid: two half-hour buttons per hour, so any empty slot can start an Add call. */}
        {hours.map((h) => (
          <div key={h} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: (h - startHour) * HOUR_PX, height: HOUR_PX }}>
            <span className="absolute left-0 top-0 w-14 -translate-y-2 bg-white pr-2 text-right text-[11px] text-slate-500">{DateTime.fromObject({ hour: h }).toFormat("h a")}</span>
            {[0, 30].map((m) => (
              <button key={m} type="button" onClick={() => onSlot(day.set({ hour: h, minute: m }))}
                aria-label={`Add a call at ${day.set({ hour: h, minute: m }).toFormat("h:mm a")} on ${day.toFormat("LLLL d")}`}
                className="absolute left-14 right-0 block hover:bg-orange-50/60 focus:outline-none focus-visible:bg-orange-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-700"
                style={{ top: (m / 60) * HOUR_PX, height: HOUR_PX / 2 }} />
            ))}
          </div>
        ))}
        {/* Calls */}
        {placed.map((p) => {
          const top = ((p.m0 - startHour * 60) / 60) * HOUR_PX;
          const height = Math.max(26, ((p.m1 - p.m0) / 60) * HOUR_PX - 2);
          const widthPct = 100 / p.lanes;
          const pos = { top, height, left: `calc(3.5rem + (100% - 3.5rem) * ${p.lane / p.lanes})`, width: `calc((100% - 3.5rem) * ${widthPct / 100} - 2px)` };
          if (p.e) {
            return (
              <a key={p.key} href={EVENTS_HREF}
                className={`absolute overflow-hidden rounded-lg border border-indigo-200 px-2 py-1 text-left text-xs shadow-sm hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 ${EVENT_PILL_CLASS}`}
                style={pos}>
                <div className="truncate font-medium">{fmtTime(p.e.starts_at)} · Event{typeof p.e.registrations === "number" ? ` · ${p.e.registrations} registered` : ""}</div>
                <div className="truncate">{p.e.title}</div>
              </a>
            );
          }
          const b = p.b!;
          return (
            <button key={p.key} type="button" onClick={() => onOpen(b.id)}
              className={`absolute overflow-hidden rounded-lg border border-white px-2 py-1 text-left text-xs shadow-sm hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 ${callPillClass(b)}`}
              style={pos}>
              <div className="truncate font-medium">{fmtTime(b.starts_at)} · {CALL_TYPES[b.call_type].label}</div>
              <div className="truncate">{b.user_name || b.user_email}</div>
              {height > 56 && <div className="mt-0.5"><TopicChips booking={b} size="xs" /></div>}
            </button>
          );
        })}
        {isToday && nowTop >= 0 && nowTop <= hours.length * HOUR_PX && (
          <div className="pointer-events-none absolute left-12 right-0 z-10 flex items-center" style={{ top: nowTop }} aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-red-600" /><span className="h-px flex-1 bg-red-600" />
          </div>
        )}
      </div>
      {items.length === 0 && events.length === 0 && <p className="mt-2 text-xs text-slate-500">No calls this day. Click a time to add one.</p>}
    </div>
  );
}

// --------------------------------------------------------------- cards view

function dayHeading(key: string): string {
  const d = DateTime.fromFormat(key, "yyyy-MM-dd");
  const today = DateTime.local().startOf("day");
  const diff = Math.round(d.diff(today, "days").days);
  if (diff === 0) return `Today, ${d.toFormat("cccc LLLL d")}`;
  if (diff === 1) return `Tomorrow, ${d.toFormat("cccc LLLL d")}`;
  if (diff === -1) return `Yesterday, ${d.toFormat("cccc LLLL d")}`;
  return d.toFormat("cccc, LLLL d");
}

const TIER_LABEL: Record<string, { label: string; className: string }> = {
  free: { label: "Free", className: "bg-slate-100 text-slate-700" },
  trial: { label: "Trial", className: "bg-blue-100 text-blue-800" },
  pro: { label: "Pro", className: "bg-emerald-100 text-emerald-800" },
};

export type CardActions = {
  onOpen: (id: string) => void;
  onReschedule: (id: string) => void;
  onAct: (id: string, body: Record<string, unknown>) => void;
  busy: boolean;
};

function CallCard({ b, a }: { b: Booking; a: CardActions }) {
  const live = b.status === "confirmed";
  const plan = b.ctx?.plan ? (TIER_LABEL[b.ctx.plan.tier] ?? TIER_LABEL.free) : null;
  const prior = b.ctx?.priorCalls;
  const btn = "rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700";
  return (
    <article className={`flex flex-col rounded-xl border bg-white p-3 shadow-sm ${live ? "border-slate-200" : "border-slate-200 opacity-80"}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <div>
          <div className="whitespace-nowrap text-sm font-semibold text-slate-900">{fmtTime(b.starts_at)} <span className="font-normal text-slate-500">- {fmtTime(b.user_ends_at)}</span></div>
          <div className="text-xs text-slate-500" title={fmtWhen(b.starts_at)}>{relTime(b.starts_at, b.user_ends_at)}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <span className={`rounded px-1.5 py-0.5 text-xs ${callPillClass(b)}`}>{CALL_TYPES[b.call_type].label}</span>
          <span className={`rounded px-1.5 py-0.5 text-xs ${statusPillClass(b.status)}`}>{b.status}</span>
          {b.recording_status === "ready" ? <span className="text-xs" title="Recorded, transcript + notes ready" aria-label="Recording ready">🎙</span> : null}
        </div>
      </div>

      <button type="button" onClick={() => a.onOpen(b.id)} className="mt-2 block text-left text-sm font-medium text-slate-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700">
        {b.user_name || b.user_email}
      </button>
      {b.user_name ? <div className="text-xs text-slate-500">{b.user_email}</div> : null}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {plan ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${plan.className}`}>{plan.label}{b.ctx?.plan?.planName && b.ctx.plan.planName.toLowerCase() !== plan.label.toLowerCase() ? ` · ${b.ctx.plan.planName}` : ""}</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">No account</span>}
        {typeof prior === "number" ? <span className="text-xs text-slate-500">{prior === 0 ? "First call" : `${prior} prior ${prior === 1 ? "call" : "calls"}`}</span> : null}
      </div>

      <div className="mt-2"><TopicChips booking={b} /></div>
      {b.topic ? <p className="mt-2 line-clamp-2 text-xs text-slate-600">{b.topic}</p> : null}

      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        {live && b.join_url ? <a href={b.join_url} target="_blank" rel="noreferrer" className="rounded-lg bg-[#c2410c] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#9a3412] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700">Join</a> : null}
        <button type="button" className={btn} onClick={() => a.onOpen(b.id)}>Prep</button>
        {b.status !== "cancelled" && b.status !== "completed" ? <button type="button" className={btn} disabled={a.busy} onClick={() => a.onReschedule(b.id)}>Reschedule</button> : null}
        {live && hasPassed(b.user_ends_at) ? <button type="button" className={btn} disabled={a.busy} onClick={() => a.onAct(b.id, { action: "complete" })}>Mark done</button> : null}
        {live && hasPassed(b.starts_at) ? <button type="button" className={btn} disabled={a.busy} onClick={() => a.onAct(b.id, { action: "no_show" })}>No-show</button> : null}
        {live ? <button type="button" className={`${btn} border-rose-200 text-rose-700 hover:bg-rose-50`} disabled={a.busy} onClick={() => { if (confirm("Cancel and email the customer?")) a.onAct(b.id, { action: "cancel" }); }}>Cancel</button> : null}
      </div>
    </article>
  );
}

function EventCard({ e }: { e: CalEvent }) {
  return (
    <article className="flex flex-col rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <div>
          <div className="whitespace-nowrap text-sm font-semibold text-slate-900">{fmtTime(e.starts_at)} <span className="font-normal text-slate-500">- {fmtTime(e.ends_at)}</span></div>
          <div className="text-xs text-slate-500" title={fmtWhen(e.starts_at)}>{relTime(e.starts_at, e.ends_at)}</div>
        </div>
        <span className={`rounded px-1.5 py-0.5 text-xs ${EVENT_PILL_CLASS}`}>Group event</span>
      </div>
      <div className="mt-2 text-sm font-medium text-slate-800">{e.title}</div>
      <div className="mt-1 text-xs text-slate-600">{typeof e.registrations === "number" ? `${e.registrations} registered` : "Registrations on the Events page"}</div>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        {e.join_url ? <a href={e.join_url} target="_blank" rel="noreferrer" className="rounded-lg bg-[#c2410c] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#9a3412]">Join</a> : null}
        <a href={EVENTS_HREF} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">Manage event</a>
      </div>
    </article>
  );
}

/** Calls and group events as cards, grouped under day headings (doubles as an agenda). */
export function CallCards({ bookings, events = [], descending = false, a, emptyText }: { bookings: Booking[]; events?: CalEvent[]; descending?: boolean; a: CardActions; emptyText: string }) {
  if (bookings.length === 0 && events.length === 0) return <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-center text-slate-500">{emptyText}</div>;
  const groups = new Map<string, Booking[]>();
  for (const b of bookings) {
    const key = DateTime.fromISO(b.starts_at).toLocal().toFormat("yyyy-MM-dd");
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(b);
  }
  const eventGroups = new Map<string, CalEvent[]>();
  for (const e of events) {
    const key = eventDayKey(e);
    (eventGroups.get(key) ?? eventGroups.set(key, []).get(key)!).push(e);
    if (!groups.has(key)) groups.set(key, []);
  }
  // Same order as the calls it sits among: ascending for upcoming, descending otherwise.
  const keys = Array.from(groups.keys()).sort((x, y) => (descending ? y.localeCompare(x) : x.localeCompare(y)));
  // Keep the incoming order between days (upcoming is ascending, past is descending), but each day reads top to bottom by time.
  return (
    <div className="space-y-5">
      {keys.map((key) => (
        <section key={key} aria-label={dayHeading(key)}>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{dayHeading(key)} <span className="font-normal text-slate-500">({groups.get(key)!.length + (eventGroups.get(key)?.length ?? 0)})</span></h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(eventGroups.get(key) ?? []).map((e) => <EventCard key={e.id} e={e} />)}
            {groups.get(key)!.slice().sort((x, y) => x.starts_at.localeCompare(y.starts_at)).map((b) => <CallCard key={b.id} b={b} a={a} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

