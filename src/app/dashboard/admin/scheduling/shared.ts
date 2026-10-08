/**
 * Types and formatters shared by the scheduling console (page.tsx) and its
 * extra views (views.tsx). Everything renders in the admin's own browser zone.
 */
import { DateTime } from "luxon";

export type AiNotes = { summary?: string; keyTopics?: string[]; actionItems?: string[]; followUps?: string[] };

export type BookingCtx = {
  /** Completed or no-show calls with this customer before this one. */
  priorCalls: number;
  /** Null when the booking has no linked account (admin-added by email). */
  plan: { tier: string; planName: string | null } | null;
};

export type Booking = {
  id: string; user_email: string; user_name: string | null; call_type: "support" | "demo";
  starts_at: string; user_ends_at: string; user_timezone: string | null; status: string;
  topic: string | null; topics?: string[] | null; join_url: string | null; meeting_provider: string | null; host_notes: string | null;
  recording_status?: string | null; recording_url?: string | null;
  transcript?: string | null; ai_notes?: AiNotes | null; recorded_at?: string | null;
  filed_ticket_ids?: string[] | null;
  ctx?: BookingCtx;
};

/** A group event (webinar-style call) from the Events system, shown read-only on the calendar. */
export type CalEvent = {
  id: string; title: string; starts_at: string; ends_at: string; status: string;
  join_url: string | null; registrations?: number;
};

/** Events are managed on their own page; calendar entries link there. */
export const EVENTS_HREF = "/dashboard/admin/events";
export const EVENT_PILL_CLASS = "bg-indigo-50 text-indigo-800";

export function eventDayKey(e: CalEvent): string { return DateTime.fromISO(e.starts_at).toLocal().toFormat("yyyy-MM-dd"); }

export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function hhmm(min: number): string { const h = Math.floor(min / 60), m = min % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }

// Renders in the admin's own (browser) timezone, with a short zone label so
// there's no ambiguity about whose clock the time is on.
export function fmtWhen(iso: string): string {
  try { return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso)); }
  catch { return new Date(iso).toLocaleString("en-US"); }
}

// Time-only, for compact calendar cells (the date is already shown by the cell itself).
export function fmtTime(iso: string): string {
  try { return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso)); }
  catch { return new Date(iso).toLocaleTimeString("en-US"); }
}

// Sunday-anchored week start (matches the WD labels), in the admin's local zone.
export function startOfWeekSun(dt: DateTime): DateTime { return dt.startOf("day").minus({ days: dt.weekday % 7 }); }

// Color coding shared by every view: status first (a resolved call reads very
// differently from a live one), then call type. All pairs are AA on their tint.
export function callPillClass(b: Booking): string {
  if (b.status === "no_show") return "bg-amber-50 text-amber-800";
  if (b.status === "completed") return "bg-slate-100 text-slate-600";
  return b.call_type === "support" ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700";
}

export function statusPillClass(status: string): string {
  switch (status) {
    case "confirmed": return "bg-sky-50 text-sky-700";
    case "completed": return "bg-slate-100 text-slate-600";
    case "no_show": return "bg-amber-50 text-amber-800";
    case "cancelled": return "bg-rose-50 text-rose-700";
    default: return "bg-slate-100 text-slate-700";
  }
}

/** "in 2h", "in 25m", "started 10m ago", "3d ago": a glanceable countdown. */
export function relTime(iso: string, endIso?: string): string {
  const now = Date.now();
  const start = Date.parse(iso);
  const end = endIso ? Date.parse(endIso) : start;
  const fmt = (ms: number) => {
    const m = Math.round(Math.abs(ms) / 60_000);
    if (m < 60) return `${m}m`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h}h`;
    return `${Math.round(h / 24)}d`;
  };
  if (start > now) return `in ${fmt(start - now)}`;
  if (end > now) return `started ${fmt(now - start)} ago`;
  return `${fmt(now - end)} ago`;
}

/** True once the given instant is in the past (kept out of render bodies for the purity lint rule). */
export function hasPassed(iso: string): boolean { return Date.parse(iso) < Date.now(); }

/** Value for an <input type="datetime-local"> in the admin's local zone. */
export function toLocalInput(ms: number): string {
  return DateTime.fromMillis(ms).toFormat("yyyy-MM-dd'T'HH:mm");
}
