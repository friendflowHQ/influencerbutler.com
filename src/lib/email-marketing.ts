// Shared helpers for the email marketing engine (campaigns + sequences),
// used by both the admin APIs and the /api/cron/email-marketing send engine.
//
// Tracking convention: every campaign send carries email_sends.category
// `campaign_<id8>` and every sequence step `seq_<id8>_s<position>`, so the
// existing per-category summary endpoint yields per-campaign and per-step
// open/click stats with no extra tracking code.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isUndeliverableTestEmail } from "@/lib/email-address";

export const MARKETING_FROM = "Influencer Butler <hello@influencerbutler.com>";

const CHUNK = 200;

/** Escapes the five HTML-special characters so plain text renders literally. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders a plain-text email body as MINIMAL HTML so Resend can inject its
 * open-tracking pixel (a text-only send carries no pixel and can never record an
 * open) and wrap links for click tracking. Deliberately plain: no images or
 * branding, so the message still reads as a personal 1:1 note. Escapes all text
 * first, turns bare http(s) URLs into links, and preserves line breaks.
 *
 * Used by the sequence sender when a sequence has track_opens enabled. The
 * marketing sender appends the compliant unsubscribe footer to this HTML.
 */
export function plainTextToTrackableHtml(text: string): string {
  const linked = escapeHtml(text).replace(
    // Bare http(s) URL up to the next whitespace, trimming common trailing
    // punctuation so a URL at the end of a sentence does not swallow the period.
    /(https?:\/\/[^\s<]+[^\s<.,!?:;)'"])/g,
    (url) => `<a href="${url}">${url}</a>`,
  );
  const withBreaks = linked.replace(/\r?\n/g, "<br>\n");
  return (
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;` +
    `font-size:15px;line-height:1.5;color:#111827">${withBreaks}</div>`
  );
}

/** First 8 hex chars of a UUID: short, stable, collision-safe at our scale. */
export function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

export function campaignCategory(id: string): string {
  return `campaign_${shortId(id)}`;
}

export function stepCategory(sequenceId: string, position: number): string {
  return `seq_${shortId(sequenceId)}_s${position}`;
}

/**
 * Per-sequence contact tag (e.g. "seq-course-follow-up") applied when someone is
 * enrolled, so the Contacts tab shows which sequence enrolled an address and can
 * filter by it. Always a valid tag: lowercased, non-alphanumeric runs collapse
 * to hyphens, trimmed, capped, "seq-" prefixed. The SQL backfill in
 * 20260831_tag_enrollee_contacts_by_sequence.sql reproduces this exact slug, so
 * keep the two in sync.
 */
export function sequenceContactTag(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return slug ? `seq-${slug}` : "seq-drip";
}

/**
 * Platform tags implied by a sequence's name (e.g. an Instagram or TikTok drip).
 * Enrolling into such a sequence unions these onto the contact IN ADDITION to
 * the per-sequence seq-* tag, so the Contacts tab can segment every Instagram or
 * TikTok contact across all such sequences, not just per-sequence. Returns
 * already-valid, normalized tags ("instagram" / "tiktok"); empty when the name
 * names no platform. Ordered [tag, matcher] so more platforms can be added.
 */
const PLATFORM_TAG_MATCHERS: ReadonlyArray<readonly [string, RegExp]> = [
  ["tiktok", /tik\s*tok/],
  ["instagram", /instagram/],
];

export function sequencePlatformTags(name: string): string[] {
  const n = name.toLowerCase();
  return PLATFORM_TAG_MATCHERS.filter(([, re]) => re.test(n)).map(([tag]) => tag);
}

/** The email-marketing cron runs every 5 minutes: 12 runs per hour. */
export const SEQUENCE_RUNS_PER_HOUR = 12;

/**
 * Default hourly send rate for a sequence with no explicit sends_per_hour. Kept
 * conservative so every sequence (including any created later without a rate set)
 * is drip-protected by default rather than blasting. The admin create endpoint
 * seeds this into new sequences, and the cron falls back to it if the column is
 * somehow null.
 */
export const DEFAULT_SENDS_PER_HOUR = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Timezone a sequence's fixed send hour is interpreted in. The business is in
 * Utah (Mountain Time), so a "9" send hour means 9am MT year-round, DST and all.
 */
export const SEQUENCE_SEND_TIMEZONE = "America/Denver";

/** Wall-clock parts of a UTC instant as seen in `tz`. */
function tzParts(
  utcMs: number,
  tz: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  // Some engines emit "24" for midnight; normalize to 0.
  if (map.hour === 24) map.hour = 0;
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

/** Offset (local - UTC) in ms that `tz` has at the given UTC instant. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const p = tzParts(utcMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - utcMs;
}

/** UTC ms for `hour:00:00` wall-clock on the given date, interpreted in `tz`. */
function zonedWallToUtc(year: number, month: number, day: number, hour: number, tz: string): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, 0, 0);
  const offset = tzOffsetMs(asUtc, tz);
  let utc = asUtc - offset;
  // One refinement pass handles the DST edge where the naive guess landed in a
  // different offset than the real instant.
  const offset2 = tzOffsetMs(utc, tz);
  if (offset2 !== offset) utc = asUtc - offset2;
  return utc;
}

/**
 * When a sequence step is due to send, as a UTC epoch ms.
 *
 * The base due time is always `enrolled_at + dayOffset` days (offsets count
 * from enrollment, not from the previous step). With no `sendHour` that base is
 * the answer, matching the original behavior of firing at the same wall-clock
 * minute each person enrolled. With a `sendHour` (0-23) set, the send is pinned
 * to the first `sendHour:00` in `tz` at or after that base, so steps land at a
 * predictable hour instead of a random per-person minute. Pure so the timing
 * math can be unit-tested without the cron.
 */
export function nextSendTime(
  enrolledAt: string | number | Date,
  dayOffset: number,
  sendHour: number | null | undefined,
  tz: string = SEQUENCE_SEND_TIMEZONE,
): number {
  const base = new Date(enrolledAt).getTime() + dayOffset * DAY_MS;
  if (!Number.isFinite(base)) return NaN;
  if (sendHour == null || !Number.isInteger(sendHour) || sendHour < 0 || sendHour > 23) {
    return base;
  }
  const p = tzParts(base, tz);
  let candidate = zonedWallToUtc(p.year, p.month, p.day, sendHour, tz);
  if (candidate < base) {
    // sendHour has already passed today (in tz): roll to the next calendar day.
    // Date.UTC with day+1 rolls month/year over correctly.
    const rolled = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    candidate = zonedWallToUtc(
      rolled.getUTCFullYear(),
      rolled.getUTCMonth() + 1,
      rolled.getUTCDate(),
      sendHour,
      tz,
    );
  }
  return candidate;
}

/**
 * Per-run send budget for a sequence given its hourly rate cap. A positive
 * sends_per_hour throttles to ceil(rate / runsPerHour) sends per cron run (min
 * 1); null/0/invalid falls back to the caller's default budget. Pure so the
 * throttle math can be unit-tested without the cron.
 */
export function sequenceRunBudget(
  sendsPerHour: number | null | undefined,
  defaultBudget: number,
  runsPerHour: number = SEQUENCE_RUNS_PER_HOUR,
): number {
  if (typeof sendsPerHour === "number" && Number.isFinite(sendsPerHour) && sendsPerHour > 0) {
    return Math.max(1, Math.ceil(sendsPerHour / runsPerHour));
  }
  return defaultBudget;
}

/**
 * Per-run budget for drip marketing (campaigns and sequences) given a domain-safe
 * hourly ceiling and how many emails (all funnels) already went out in the last
 * rolling hour. Returns the leftover headroom, clamped to [0, perRunCeiling].
 *
 * This is how transactional/system mail is prioritized: transactional is sent
 * immediately outside the cron and is never gated, but it IS counted in
 * sentLastHour, so a burst of it shrinks the headroom left for drip sends this
 * run (down to zero). A quiet hour opens the budget back up. Pure so the math is
 * unit-testable without the DB; the caller supplies sentLastHour from email_sends.
 */
export function marketingRunBudget(
  safeHourly: number,
  sentLastHour: number,
  perRunCeiling: number,
): number {
  const headroom = Math.max(0, safeHourly - Math.max(0, sentLastHour));
  return Math.max(0, Math.min(perRunCeiling, headroom));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type EnrollResult = {
  /** Addresses with no prior row, inserted fresh. */
  inserted: number;
  /** Existing cancelled/completed rows reset to a fresh Step 1 (reactivate only). */
  reactivated: number;
  /** Left untouched: already active, or cancelled/completed when not reactivating. */
  skipped: number;
};

/**
 * Enrolls addresses into a sequence. Each address has at most one row per
 * sequence (UNIQUE (sequence_id, email)), so behavior depends on the existing
 * row's state:
 *   - no row      -> inserted fresh (last_step_sent 0, enrolled_at now).
 *   - active row  -> skipped (already mid-drip; never restarted, so no double-send).
 *   - cancelled/completed row -> reactivated when opts.reactivate is set:
 *       reset to a fresh Step 1 (clears cancelled_at/completed_at, resets
 *       last_step_sent and enrolled_at so day-0 is due on the next cron run);
 *       otherwise skipped.
 *
 * The manual admin Enroll button passes reactivate:true so re-adding a stopped
 * address restarts it. Tag-added auto-enroll does NOT reactivate, so re-applying
 * a tag never silently re-drips someone who finished or opted out.
 */
export async function enrollEmails(
  db: SupabaseClient,
  sequenceId: string,
  emails: string[],
  opts: { reactivate?: boolean } = {},
): Promise<EnrollResult> {
  const result: EnrollResult = { inserted: 0, reactivated: 0, skipped: 0 };
  // Callers already lowercase, but dedupe defensively so counts don't double up.
  // Drop reserved test addresses (example.com, *.test, ...): they can never be
  // delivered, so enrolling one only seeds the drip with a guaranteed failure.
  const unique = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ).filter((e) => !isUndeliverableTestEmail(e));
  if (unique.length === 0) return result;

  const toInsert: string[] = [];
  const toReactivate: string[] = [];

  for (const slice of chunk(unique, CHUNK)) {
    const { data: existing, error: fetchErr } = await db
      .from("email_sequence_enrollments")
      .select("email, cancelled_at, completed_at")
      .eq("sequence_id", sequenceId)
      .in("email", slice);
    if (fetchErr) {
      console.error("email-marketing: enroll existing-lookup failed", fetchErr);
      continue;
    }
    const state = new Map<string, { cancelled: boolean; completed: boolean }>();
    for (const row of existing ?? []) {
      if (typeof row.email !== "string") continue;
      state.set(row.email, {
        cancelled: Boolean(row.cancelled_at),
        completed: Boolean(row.completed_at),
      });
    }
    for (const email of slice) {
      const prior = state.get(email);
      if (!prior) {
        toInsert.push(email);
      } else if (opts.reactivate && (prior.cancelled || prior.completed)) {
        toReactivate.push(email);
      } else {
        result.skipped += 1;
      }
    }
  }

  for (const slice of chunk(toInsert, CHUNK)) {
    const rows = slice.map((email) => ({ sequence_id: sequenceId, email }));
    const { error } = await db.from("email_sequence_enrollments").insert(rows);
    if (error) {
      console.error("email-marketing: enroll insert failed", error);
      continue;
    }
    result.inserted += slice.length;
  }

  for (const slice of chunk(toReactivate, CHUNK)) {
    const { error } = await db
      .from("email_sequence_enrollments")
      .update({
        enrolled_at: new Date().toISOString(),
        last_step_sent: 0,
        last_step_sent_at: null,
        cancelled_at: null,
        completed_at: null,
      })
      .eq("sequence_id", sequenceId)
      .in("email", slice);
    if (error) {
      console.error("email-marketing: enroll reactivate failed", error);
      continue;
    }
    result.reactivated += slice.length;
  }

  return result;
}

/**
 * Fires tag_added auto-enrollment: every ACTIVE sequence whose trigger is
 * {kind:"tag_added", tag} gets the given addresses enrolled. Called
 * synchronously by the contacts API whenever a tag is applied (import or
 * bulk-tag); tag writes only happen there, so nothing needs polling.
 */
export async function enrollForTagAdded(
  db: SupabaseClient,
  tag: string,
  emails: string[],
): Promise<void> {
  if (emails.length === 0) return;
  try {
    const { data, error } = await db
      .from("email_sequences")
      .select("id, trigger")
      .eq("status", "active");
    if (error || !data) return;
    for (const seq of data) {
      const trigger = (seq.trigger ?? null) as { kind?: string; tag?: string } | null;
      if (trigger?.kind === "tag_added" && trigger.tag === tag && typeof seq.id === "string") {
        await enrollEmails(db, seq.id, emails);
      }
    }
  } catch (err) {
    console.error("email-marketing: enrollForTagAdded threw", err);
  }
}

/**
 * Tag-on-send: ensures each address is a contact (email_subscribers) and, when
 * a tag is given, unions it onto their existing tags without replacing them.
 * Used by the campaign materializer so a send can grow and segment the list in
 * one step. Best-effort: a missing table/column just no-ops. Also fires
 * tag_added sequence auto-enrollment for the tag, matching the contacts API.
 */
export async function tagRecipientsAsContacts(
  db: SupabaseClient,
  emails: string[],
  tag: string | null,
  source: string,
): Promise<void> {
  if (emails.length === 0) return;
  try {
    for (const slice of chunk(emails, CHUNK)) {
      const { data: existing, error: readErr } = await db
        .from("email_subscribers")
        .select("email, tags")
        .in("email", slice);
      if (readErr) return; // table/column missing: degrade to no-op

      const existingByEmail = new Map<string, string[]>();
      for (const row of existing ?? []) {
        if (typeof row.email !== "string") continue;
        existingByEmail.set(
          row.email.toLowerCase(),
          Array.isArray(row.tags)
            ? row.tags.filter((t: unknown): t is string => typeof t === "string")
            : [],
        );
      }

      const fresh = slice.filter((e) => !existingByEmail.has(e));
      if (fresh.length > 0) {
        const rows = fresh.map((email) => ({ email, source, tags: tag ? [tag] : [] }));
        const { error: insertErr } = await db.from("email_subscribers").insert(rows);
        if (insertErr) console.error("email-marketing: contact insert failed", insertErr);
      }

      if (tag) {
        for (const [email, tags] of existingByEmail) {
          if (tags.includes(tag)) continue;
          const { error: updErr } = await db
            .from("email_subscribers")
            .update({ tags: [...tags, tag] })
            .eq("email", email);
          if (updErr) console.error("email-marketing: contact tag union failed", { email, updErr });
        }
      }
    }
    if (tag) await enrollForTagAdded(db, tag, emails);
  } catch (err) {
    console.error("email-marketing: tagRecipientsAsContacts threw", err);
  }
}
