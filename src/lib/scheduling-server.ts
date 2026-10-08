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
  hasConflict,
  horizonDates,
  decoyBusyRanges,
  recurringBlockBusyRanges,
  type AvailabilityRule,
  type BusyRange,
  type CallTypeKey,
  type RecurringBlock,
  type Slot,
} from "@/lib/scheduling";
import { isGoogleConfigured } from "@/lib/google-meet";
import { freeBusy } from "@/lib/google-calendar";

export type SchedConfig = {
  bookingHorizonDays: number;
  leadTimeHours: number;
  decoyMin: number;
  decoyMax: number;
  defaultJoinUrl: string | null;
  googleRefreshToken: string | null;
  googleCalendarEmail: string | null;
  // Dedicated YouTube account (events uploads). Separate from the calls/calendar
  // account above; may be a different Google account entirely.
  youtubeRefreshToken: string | null;
  youtubeAccountEmail: string | null;
};

const DEFAULT_CONFIG: SchedConfig = {
  bookingHorizonDays: 14,
  leadTimeHours: 12,
  decoyMin: 2,
  decoyMax: 4,
  defaultJoinUrl: null,
  googleRefreshToken: null,
  googleCalendarEmail: null,
  youtubeRefreshToken: null,
  youtubeAccountEmail: null,
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

/** Weekly always-on protected blocks (owner deep-work / standing personal time). */
export async function loadRecurringBlocks(admin: Admin): Promise<RecurringBlock[]> {
  const { data, error } = await admin
    .from("call_recurring_blocks")
    .select("weekday,start_min,end_min,timezone");
  // Table is applied by hand in prod; if it's not there yet, degrade to none.
  if (error) { console.error("[scheduling] loadRecurringBlocks", error.message); return []; }
  return (data ?? []) as RecurringBlock[];
}

// Short-lived cache of the owner's Google busy ranges, keyed by the connected
// token + hour-rounded window, so repeated slot requests don't hit Google on
// every page load. Per server instance; safe to be approximate.
const GBUSY_TTL_MS = 60_000;
const gBusyCache = new Map<string, { at: number; ranges: BusyRange[] }>();

async function googleBusyCached(refreshToken: string, fromMs: number, toMs: number): Promise<BusyRange[]> {
  const hour = 3600_000;
  const qMin = Math.floor(fromMs / hour) * hour;
  const qMax = Math.ceil(toMs / hour) * hour;
  const key = `${refreshToken.slice(-12)}:${qMin}:${qMax}`;
  const hit = gBusyCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < GBUSY_TTL_MS) return hit.ranges;
  const ranges = await freeBusy({ refreshToken, timeMinMs: qMin, timeMaxMs: qMax });
  gBusyCache.set(key, { at: now, ranges });
  return ranges;
}

export async function loadConfig(admin: Admin): Promise<SchedConfig> {
  const { data, error } = await admin
    .from("call_config")
    .select("booking_horizon_days,lead_time_hours,decoy_min_per_day,decoy_max_per_day,default_join_url,google_refresh_token,google_calendar_email,youtube_refresh_token,youtube_account_email")
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
    youtubeRefreshToken: data.youtube_refresh_token ?? null,
    youtubeAccountEmail: data.youtube_account_email ?? null,
  };
}

/**
 * Everything that makes the owner busy in [fromMs, toMs], as UTC busy ranges:
 * confirmed bookings, one-off manual blocks, weekly recurring protected blocks,
 * and (when connected) the owner's Google Calendar free/busy. Google is folded
 * in here so both availability listing and booking re-validation subtract it.
 */
export async function loadBusy(
  admin: Admin,
  fromMs: number,
  toMs: number,
  opts?: { googleRefreshToken?: string | null; excludeBookingId?: string | null },
): Promise<BusyRange[]> {
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();
  const busy: BusyRange[] = [];
  let bq = admin
    .from("call_bookings")
    .select("starts_at,ends_at")
    .eq("status", "confirmed")
    .lt("starts_at", toIso)
    .gt("ends_at", fromIso);
  // A booking being moved must not conflict with its own current slot.
  if (opts?.excludeBookingId) bq = bq.neq("id", opts.excludeBookingId);
  const b = await bq;
  if (!b.error) for (const r of b.data ?? []) busy.push({ startMs: Date.parse(r.starts_at as string), endMs: Date.parse(r.ends_at as string) });
  const m = await admin
    .from("call_blocks")
    .select("starts_at,ends_at")
    .lt("starts_at", toIso)
    .gt("ends_at", fromIso);
  if (!m.error) for (const r of m.data ?? []) busy.push({ startMs: Date.parse(r.starts_at as string), endMs: Date.parse(r.ends_at as string) });

  // Weekly recurring protected blocks, expanded across the window.
  const recurring = await loadRecurringBlocks(admin);
  if (recurring.length) busy.push(...recurringBlockBusyRanges(recurring, fromMs, toMs));

  // Owner's Google Calendar busy (best-effort; empty on any failure).
  const token = opts?.googleRefreshToken;
  if (token && isGoogleConfigured()) {
    try { busy.push(...(await googleBusyCached(token, fromMs, toMs))); }
    catch (e) { console.error("[scheduling] google busy", e); }
  }
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
  const busy = await loadBusy(admin, rangeStart, rangeEnd, { googleRefreshToken: config.googleRefreshToken });
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
  const busy = await loadBusy(admin, startMs - 86_400_000, startMs + ct.blockMinutes * 60_000 + 86_400_000, { googleRefreshToken: config.googleRefreshToken });
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

/**
 * Owner-side move check for a booking. Unlike validateSlot this does NOT apply
 * availability windows, decoys or the lead-time floor (the owner may place a
 * call anywhere), but it still refuses a time in the past or one that overlaps
 * another booking, a block, recurring protected time or the owner's Google busy.
 */
export async function checkMove(
  admin: Admin,
  callType: CallTypeKey,
  bookingId: string,
  startMs: number,
  nowMs: number,
  // The booking's own Google Calendar event (old slot). It shows as owner-busy
  // in free/busy, so it is excluded or a small shift would conflict with itself.
  ownEvent?: { startMs: number; endMs: number } | null,
): Promise<{ ok: true; endMs: number; userEndMs: number } | { ok: false; reason: string }> {
  const ct = CALL_TYPES[callType];
  if (startMs < nowMs) return { ok: false, reason: "That time is in the past." };
  const endMs = startMs + ct.blockMinutes * 60_000;
  const userEndMs = startMs + ct.userMinutes * 60_000;
  const config = await loadConfig(admin);
  const from = startMs - 3600_000;
  const to = endMs + 3600_000;
  const busy = await loadBusy(admin, from, to, { excludeBookingId: bookingId });
  if (config.googleRefreshToken && isGoogleConfigured()) {
    try {
      const own = ownEvent;
      const near = (a: number, b: number) => Math.abs(a - b) < 60_000;
      const g = await googleBusyCached(config.googleRefreshToken, from, to);
      busy.push(...g.filter((r) => !(own && near(r.startMs, own.startMs) && near(r.endMs, own.endMs))));
    } catch (e) { console.error("[scheduling] move google busy", e); }
  }
  if (hasConflict(startMs, endMs, busy)) return { ok: false, reason: "That time overlaps another call, a block or your calendar. Tick Allow overlap to move it anyway." };
  return { ok: true, endMs, userEndMs };
}

export { decoyBusyRanges };
