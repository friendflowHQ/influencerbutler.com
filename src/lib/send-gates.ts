/**
 * Global marketing send gates (price lock push, owner rules 2026-11-11). They
 * apply to every marketing email (sequences, campaigns, funnels), never to
 * transactional mail (sign-in links, receipts, license keys):
 *
 *   1. One marketing email per person per day (America/Los_Angeles calendar
 *      day). A gated send is DEFERRED, not dropped: the caller retries later.
 *   2. Blackout days: no marketing email on Nov 26, 27 or 28 2026 (Thanksgiving
 *      and Black Friday), Pacific time.
 *   3. Push emails win their day: on a day with a price lock push send, other
 *      marketing to anyone in that day's push audience waits until tomorrow,
 *      and until the push has picked its recipients, other marketing waits.
 *
 * Every check fails OPEN on a database error (the send goes ahead), matching
 * the rest of the engine: a flaky read must never silence the whole system.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const SEND_TIMEZONE = "America/Los_Angeles";

/** Pacific calendar dates (YYYY-MM-DD) with no marketing email at all. */
export const BLACKOUT_DATES: readonly string[] = ["2026-11-26", "2026-11-27", "2026-11-28"];

/** Funnels counted toward the one-per-day cap (everything but transactional). */
const MARKETING_FUNNELS = [
  "trial",
  "apptrial",
  "pro",
  "conversion",
  "onboarding",
  "winback",
  "upgrade",
  "newsletter",
  "campaign",
  "sequence",
] as const;

/** YYYY-MM-DD for `now` in Pacific time. */
export function pacificDate(now: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEND_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Offset of Pacific time from UTC at `utcMs`, in ms (e.g. -8h in winter). */
function pacificOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEND_TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** UTC instant of a Pacific wall-clock time, e.g. pacificTimeToUtc("2026-11-12", 12). */
export function pacificTimeToUtc(date: string, hour: number, minute = 0): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const offset = pacificOffsetMs(guess);
  const first = guess - offset;
  // Re-check across a DST edge.
  const offset2 = pacificOffsetMs(first);
  return new Date(guess - offset2);
}

/** Start of the Pacific calendar day containing `now`, as a UTC Date. */
export function pacificDayStart(now: number = Date.now()): Date {
  return pacificTimeToUtc(pacificDate(now), 0, 0);
}

export function isBlackoutDay(now: number = Date.now()): boolean {
  return BLACKOUT_DATES.includes(pacificDate(now));
}

/** Pure decision for the daily cap, given how many marketing emails went today. */
export function dailyCapAllows(sentToday: number, opts: { allowSecondToday?: boolean } = {}): boolean {
  return sentToday < (opts.allowSecondToday ? 2 : 1);
}

/** Marketing emails actually sent to `email` since Pacific midnight. Null on error. */
export async function marketingSentToday(db: SupabaseClient, email: string, now: number = Date.now()): Promise<number | null> {
  try {
    const { count, error } = await db
      .from("email_sends")
      .select("id", { count: "exact", head: true })
      .eq("recipient", email.trim().toLowerCase())
      .eq("status", "sent")
      .in("funnel", MARKETING_FUNNELS as unknown as string[])
      .not("category", "like", "%_test%")
      .gte("created_at", pacificDayStart(now).toISOString());
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export type GateResult = { ok: true } | { ok: false; reason: "blackout" | "daily_cap" | "push_day" };

/** Per-run cache of today's push audience (see pushDayReservation). */
type PushReservation = { holdAll: boolean; emails: Set<string> } | null;
let reservationCache: { day: string; at: number; value: PushReservation } | null = null;

/**
 * On a price lock push day: null when today has no push send; holdAll while a
 * push send scheduled today has not picked its recipients yet; otherwise the
 * set of today's push recipients. Cached for 2 minutes.
 */
export async function pushDayReservation(db: SupabaseClient, now: number = Date.now()): Promise<PushReservation> {
  const day = pacificDate(now);
  if (reservationCache && reservationCache.day === day && now - reservationCache.at < 120_000) {
    return reservationCache.value;
  }
  let value: PushReservation = null;
  try {
    const start = pacificDayStart(now);
    const end = new Date(start.getTime() + 36 * 60 * 60 * 1000); // safe upper bound, filtered below
    const { data, error } = await db
      .from("email_campaigns")
      .select("id, scheduled_at, materialized_at, status, audience")
      .gte("scheduled_at", start.toISOString())
      .lt("scheduled_at", end.toISOString())
      .in("status", ["draft", "sending", "sent"]);
    if (!error) {
      const today = ((data ?? []) as {
        id: string;
        scheduled_at: string;
        materialized_at: string | null;
        status: string;
        audience: { kind?: string } | null;
      }[]).filter(
        (c) => c.audience?.kind === "price_lock" && pacificDate(Date.parse(c.scheduled_at)) === day,
      );
      if (today.length > 0) {
        const holdAll = today.some((c) => !c.materialized_at);
        const emails = new Set<string>();
        const ids = today.filter((c) => c.materialized_at).map((c) => c.id);
        for (let from = 0; ids.length > 0; from += 1000) {
          const { data: recs, error: recErr } = await db
            .from("email_campaign_recipients")
            .select("email")
            .in("campaign_id", ids)
            .range(from, from + 999);
          if (recErr) break;
          for (const r of (recs ?? []) as { email: string }[]) emails.add(r.email.trim().toLowerCase());
          if (!recs || recs.length < 1000) break;
        }
        value = { holdAll, emails };
      }
    }
  } catch {
    value = null;
  }
  reservationCache = { day, at: now, value };
  return value;
}

/**
 * The full gate for one marketing send. `isPush` marks a price lock push send
 * itself (it is never held for the push reservation). `allowSecondToday` is the
 * Nov 30 "final hours" exception (owner decision 2026-11-11).
 */
export async function marketingGate(
  db: SupabaseClient,
  email: string,
  opts: { now?: number; isPush?: boolean; allowSecondToday?: boolean } = {},
): Promise<GateResult> {
  const now = opts.now ?? Date.now();
  if (isBlackoutDay(now)) return { ok: false, reason: "blackout" };
  if (!opts.isPush) {
    const reservation = await pushDayReservation(db, now);
    if (reservation && (reservation.holdAll || reservation.emails.has(email.trim().toLowerCase()))) {
      return { ok: false, reason: "push_day" };
    }
  }
  const sent = await marketingSentToday(db, email, now);
  if (sent != null && !dailyCapAllows(sent, { allowSecondToday: opts.allowSecondToday })) {
    return { ok: false, reason: "daily_cap" };
  }
  return { ok: true };
}

/** Test hook. */
export function __resetPushReservationCache(): void {
  reservationCache = null;
}
