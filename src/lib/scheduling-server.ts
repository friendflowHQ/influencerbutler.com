/**
 * Server-side scheduling data access + availability composition. Loads owner
 * rules / config / busy ranges from Supabase (service-role) and runs the pure
 * engine in scheduling.ts. Shared by the customer slots route, the create
 * route (re-validation), and the admin.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CALL_TYPES,
  activeRuleForDate,
  computeDaySlots,
  horizonDates,
  decoyBusyRanges,
  type AvailabilityRule,
  type BusyRange,
  type CallTypeKey,
  type Slot,
} from "@/lib/scheduling";

export type SchedConfig = {
  bookingHorizonDays: number;
  leadTimeHours: number;
  decoyMin: number;
  decoyMax: number;
  defaultJoinUrl: string | null;
  googleRefreshToken: string | null;
  googleCalendarEmail: string | null;
};

const DEFAULT_CONFIG: SchedConfig = {
  bookingHorizonDays: 14,
  leadTimeHours: 12,
  decoyMin: 2,
  decoyMax: 4,
  defaultJoinUrl: null,
  googleRefreshToken: null,
  googleCalendarEmail: null,
};

type Admin = ReturnType<typeof createAdminClient>;

export function getAdmin(): Admin | null {
  try { return createAdminClient(); } catch (e) { console.error("[scheduling] admin client", e); return null; }
}

export async function loadRules(admin: Admin): Promise<AvailabilityRule[]> {
  const { data, error } = await admin
    .from("call_availability_rules")
    .select("weekday,start_min,end_min,timezone,effective_from,effective_to");
  if (error) { console.error("[scheduling] loadRules", error.message); return []; }
  return (data ?? []) as AvailabilityRule[];
}

export async function loadConfig(admin: Admin): Promise<SchedConfig> {
  const { data, error } = await admin
    .from("call_config")
    .select("booking_horizon_days,lead_time_hours,decoy_min_per_day,decoy_max_per_day,default_join_url,google_refresh_token,google_calendar_email")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return DEFAULT_CONFIG;
  return {
    bookingHorizonDays: data.booking_horizon_days ?? DEFAULT_CONFIG.bookingHorizonDays,
    leadTimeHours: data.lead_time_hours ?? DEFAULT_CONFIG.leadTimeHours,
    decoyMin: data.decoy_min_per_day ?? DEFAULT_CONFIG.decoyMin,
    decoyMax: data.decoy_max_per_day ?? DEFAULT_CONFIG.decoyMax,
    defaultJoinUrl: data.default_join_url ?? null,
    googleRefreshToken: data.google_refresh_token ?? null,
    googleCalendarEmail: data.google_calendar_email ?? null,
  };
}

/** Confirmed bookings + manual blocks overlapping [fromMs, toMs], as busy ranges. */
export async function loadBusy(admin: Admin, fromMs: number, toMs: number): Promise<BusyRange[]> {
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();
  const busy: BusyRange[] = [];
  const b = await admin
    .from("call_bookings")
    .select("starts_at,ends_at")
    .eq("status", "confirmed")
    .lt("starts_at", toIso)
    .gt("ends_at", fromIso);
  if (!b.error) for (const r of b.data ?? []) busy.push({ startMs: Date.parse(r.starts_at as string), endMs: Date.parse(r.ends_at as string) });
  const m = await admin
    .from("call_blocks")
    .select("starts_at,ends_at")
    .lt("starts_at", toIso)
    .gt("ends_at", fromIso);
  if (!m.error) for (const r of m.data ?? []) busy.push({ startMs: Date.parse(r.starts_at as string), endMs: Date.parse(r.ends_at as string) });
  return busy;
}

export type DaySlots = { date: string; timezone: string; slots: Slot[] };

/** Per-day available slots across the booking horizon for a call type. */
export async function availabilityForType(admin: Admin, callType: CallTypeKey, nowMs: number): Promise<DaySlots[]> {
  const [rules, config] = await Promise.all([loadRules(admin), loadConfig(admin)]);
  if (rules.length === 0) return [];
  // Use the first rule's tz for the calendar-day walk (rules share the display tz per phase).
  const walkTz = rules[0].timezone;
  const dates = horizonDates(nowMs, config.bookingHorizonDays, walkTz);
  const rangeStart = nowMs;
  const rangeEnd = nowMs + (config.bookingHorizonDays + 1) * 86_400_000;
  const busy = await loadBusy(admin, rangeStart, rangeEnd);
  const decoyOpts = { minPerDay: config.decoyMin, maxPerDay: config.decoyMax };

  const out: DaySlots[] = [];
  for (const date of dates) {
    const rule = activeRuleForDate(rules, date);
    if (!rule) continue;
    const slots = computeDaySlots({
      dateISO: date,
      callType,
      rules,
      busy,
      nowMs,
      leadHours: config.leadTimeHours,
      decoyOpts,
    });
    if (slots.length) out.push({ date, timezone: rule.timezone, slots });
  }
  return out;
}

/** Re-validate a single proposed slot server-side (never trust the client). */
export async function validateSlot(
  admin: Admin,
  callType: CallTypeKey,
  startMs: number,
  nowMs: number,
): Promise<{ ok: true; endMs: number; userEndMs: number } | { ok: false; reason: string }> {
  const ct = CALL_TYPES[callType];
  const date = new Date(startMs);
  // Derive the calendar date in the rule tz for the day.
  const rules = await loadRules(admin);
  const config = await loadConfig(admin);
  // Find any rule tz to name the day; then confirm the slot is one the engine emits.
  const walkTz = rules[0]?.timezone || "UTC";
  const isoDate = new Intl.DateTimeFormat("en-CA", { timeZone: walkTz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(date); // YYYY-MM-DD
  const busy = await loadBusy(admin, startMs - 86_400_000, startMs + ct.blockMinutes * 60_000 + 86_400_000);
  const slots = computeDaySlots({
    dateISO: isoDate,
    callType,
    rules,
    busy,
    nowMs,
    leadHours: config.leadTimeHours,
    decoyOpts: { minPerDay: config.decoyMin, maxPerDay: config.decoyMax },
  });
  const match = slots.find((s) => s.startMs === startMs);
  if (!match) return { ok: false, reason: "That time is no longer available." };
  return { ok: true, endMs: match.endMs, userEndMs: match.userEndMs };
}

export { decoyBusyRanges };
