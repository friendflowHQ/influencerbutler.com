// Audience definitions for the email marketing engine: the shape a campaign
// or sequence targets, its validator, and the one resolver that turns it into
// a concrete list of addresses. Shared by the audience-preview API and the
// email-marketing cron's materializer so the "will send to N people" preview
// and the actual recipient list can never drift.
//
// Suppression is deliberately NOT filtered here: sendMarketingEmail() checks
// it at send time, and the cron marks suppressed recipients as skipped, which
// keeps per-campaign skip counts honest.

import type { SupabaseClient } from "@supabase/supabase-js";

export type AudienceSegment = "trial" | "pro" | "churned" | "newsletter";

export type Audience =
  | { kind: "tag"; tag: string }
  | { kind: "all_contacts" }
  | { kind: "segment"; segment: AudienceSegment }
  | { kind: "engaged"; minOpens: number; withinDays?: number }
  | { kind: "pasted"; emails: string[] };

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SEGMENTS = new Set<AudienceSegment>(["trial", "pro", "churned", "newsletter"]);
const TAG_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

const PAGE = 1000;
const CHUNK = 200;
const MAX_AUDIENCE = 20000;
const MAX_PASTED = 2000;

// Ceiling on how many opened-email rows the "engaged" audience will scan, so a
// large email_sends table can never turn a preview into a runaway query.
const OPEN_SCAN_CAP = 200000;
const MAX_MIN_OPENS = 50;
const MAX_WITHIN_DAYS = 3650;

/** Statuses that mean a user currently has live access. Mirrors winback. */
const LIVE_STATUSES = ["active", "on_trial", "past_due", "paused"];

/** Lowercase/trim a raw tag and clamp to the allowed shape. Null if unusable. */
export function normalizeTag(raw: string): string | null {
  const tag = raw.trim().toLowerCase().replace(/\s+/g, "-");
  return TAG_RE.test(tag) ? tag : null;
}

/**
 * Splits a pasted blob of addresses (newlines, commas, semicolons, spaces)
 * into a deduped, lowercased list. Returns how many entries were dropped as
 * invalid so imports can report it.
 */
export function parseEmailList(
  raw: string,
  cap: number = MAX_PASTED,
): { emails: string[]; invalid: number } {
  const seen = new Set<string>();
  let invalid = 0;
  for (const part of raw.split(/[\s,;]+/)) {
    const candidate = part.trim().toLowerCase();
    if (!candidate) continue;
    if (candidate.length > 254 || !EMAIL_RE.test(candidate)) {
      invalid += 1;
      continue;
    }
    if (seen.size < cap) seen.add(candidate);
  }
  return { emails: [...seen], invalid };
}

/** Allow-list validation of an untrusted audience payload. Null on garbage. */
export function parseAudience(input: unknown): Audience | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  switch (raw.kind) {
    case "all_contacts":
      return { kind: "all_contacts" };
    case "tag": {
      if (typeof raw.tag !== "string") return null;
      const tag = normalizeTag(raw.tag);
      return tag ? { kind: "tag", tag } : null;
    }
    case "segment": {
      const segment = raw.segment as AudienceSegment;
      return SEGMENTS.has(segment) ? { kind: "segment", segment } : null;
    }
    case "engaged": {
      // minOpens is the threshold recipients must beat: we keep anyone who has
      // opened STRICTLY MORE than this many of our emails, so minOpens:2 means
      // "opened more than two" (three or more). Defaults to 2.
      const minOpens =
        typeof raw.minOpens === "number" && Number.isFinite(raw.minOpens)
          ? Math.max(1, Math.min(MAX_MIN_OPENS, Math.floor(raw.minOpens)))
          : 2;
      const withinDays =
        typeof raw.withinDays === "number" && Number.isFinite(raw.withinDays)
          ? Math.max(1, Math.min(MAX_WITHIN_DAYS, Math.floor(raw.withinDays)))
          : undefined;
      return withinDays
        ? { kind: "engaged", minOpens, withinDays }
        : { kind: "engaged", minOpens };
    }
    case "pasted": {
      if (!Array.isArray(raw.emails)) return null;
      const { emails } = parseEmailList(raw.emails.filter((e) => typeof e === "string").join("\n"));
      return emails.length > 0 ? { kind: "pasted", emails } : null;
    }
    default:
      return null;
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type SubscriberQuery = {
  tag?: string;
};

/** Pages email_subscribers (not unsubscribed), optionally tag-filtered. */
async function collectSubscribers(
  db: SupabaseClient,
  into: Set<string>,
  opts: SubscriberQuery,
): Promise<boolean> {
  let offset = 0;
  for (;;) {
    let q = db
      .from("email_subscribers")
      .select("email")
      .is("unsubscribed_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (opts.tag) q = q.contains("tags", [opts.tag]);
    const { data, error } = await q;
    if (error) return false;
    const rows = data ?? [];
    for (const row of rows) {
      const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      if (email && into.size < MAX_AUDIENCE) into.add(email);
    }
    if (rows.length < PAGE || into.size >= MAX_AUDIENCE) return true;
    offset += PAGE;
  }
}

/** Pages subscriptions for the given statuses, returning distinct user ids. */
async function collectUserIdsByStatus(
  db: SupabaseClient,
  statuses: string[],
): Promise<Set<string> | null> {
  const ids = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from("subscriptions")
      .select("user_id")
      .in("status", statuses)
      .range(offset, offset + PAGE - 1);
    if (error) return null;
    const rows = data ?? [];
    for (const row of rows) {
      if (typeof row.user_id === "string" && row.user_id) ids.add(row.user_id);
    }
    if (rows.length < PAGE) return ids;
    offset += PAGE;
  }
}

/**
 * Returns the set of lowercased emails belonging to users who currently have a
 * live subscription (active / on_trial / past_due / paused). Used by the
 * sequence cron to stop a re-engagement drip the moment someone converts, so we
 * never keep nudging a person who has already subscribed. Returns null on a
 * query error so callers can skip the check rather than cancel wrongly.
 */
export async function liveSubscriberEmails(db: SupabaseClient): Promise<Set<string> | null> {
  const ids = await collectUserIdsByStatus(db, LIVE_STATUSES);
  if (!ids) return null;
  const into = new Set<string>();
  if (ids.size > 0) await emailsForUserIds(db, [...ids], into);
  return into;
}

/** Hydrates emails from profiles for a set of user ids (chunked .in()). */
async function emailsForUserIds(
  db: SupabaseClient,
  userIds: string[],
  into: Set<string>,
): Promise<void> {
  for (const slice of chunk(userIds, CHUNK)) {
    const { data, error } = await db.from("profiles").select("email").in("id", slice);
    if (error) continue;
    for (const row of data ?? []) {
      const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      if (email && into.size < MAX_AUDIENCE) into.add(email);
    }
  }
}

/**
 * Collects addresses that appear in email_suppressions OR are marked
 * unsubscribed in email_subscribers, restricted to the given candidate list
 * (chunked .in()). Used to strip opted-out people from the "engaged" audience
 * at resolve time: "did not unsubscribe" is part of that audience's definition,
 * not just the send-time safety net that sendMarketingEmail already provides.
 */
async function collectOptedOut(
  db: SupabaseClient,
  emails: string[],
  into: Set<string>,
): Promise<void> {
  for (const slice of chunk(emails, CHUNK)) {
    const { data: suppressed } = await db
      .from("email_suppressions")
      .select("email")
      .in("email", slice);
    for (const row of suppressed ?? []) {
      const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      if (email) into.add(email);
    }
    const { data: unsub } = await db
      .from("email_subscribers")
      .select("email")
      .in("email", slice)
      .not("unsubscribed_at", "is", null);
    for (const row of unsub ?? []) {
      const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      if (email) into.add(email);
    }
  }
}

/**
 * Pages email_sends for delivered opens, tallies opens per recipient, and keeps
 * anyone who opened STRICTLY MORE than minOpens of our emails, then drops
 * opted-out addresses. opened_at is stamped first-open-only (one row per send),
 * so a row count is an opened-email count. Returns false on a query error so
 * the caller can surface the migration/setup banner.
 */
async function collectEngagedOpeners(
  db: SupabaseClient,
  minOpens: number,
  withinDays: number | undefined,
  into: Set<string>,
): Promise<boolean> {
  const counts = new Map<string, number>();
  const sinceIso =
    withinDays && withinDays > 0
      ? new Date(Date.now() - withinDays * 86_400_000).toISOString()
      : null;
  let offset = 0;
  let scanned = 0;
  for (;;) {
    let q = db
      .from("email_sends")
      .select("recipient")
      .not("opened_at", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const { data, error } = await q;
    if (error) return false;
    const rows = data ?? [];
    for (const row of rows) {
      const email = typeof row.recipient === "string" ? row.recipient.trim().toLowerCase() : "";
      if (email) counts.set(email, (counts.get(email) ?? 0) + 1);
    }
    scanned += rows.length;
    if (rows.length < PAGE || scanned >= OPEN_SCAN_CAP) break;
    offset += PAGE;
  }

  const candidates: string[] = [];
  for (const [email, n] of counts) {
    if (n > minOpens) candidates.push(email);
  }

  const optedOut = new Set<string>();
  await collectOptedOut(db, candidates, optedOut);
  for (const email of candidates) {
    if (!optedOut.has(email) && into.size < MAX_AUDIENCE) into.add(email);
  }
  return true;
}

/**
 * Resolves an audience to a concrete deduped list of lowercased addresses.
 * migrationPending is true when the contacts table (or its tags column) is
 * missing, so callers can surface the apply-the-migration banner.
 */
export async function resolveAudience(
  db: SupabaseClient,
  audience: Audience,
): Promise<{ emails: string[]; migrationPending: boolean }> {
  const into = new Set<string>();

  switch (audience.kind) {
    case "pasted":
      return { emails: audience.emails.slice(0, MAX_AUDIENCE), migrationPending: false };

    case "all_contacts": {
      const ok = await collectSubscribers(db, into, {});
      return { emails: [...into], migrationPending: !ok };
    }

    case "tag": {
      const ok = await collectSubscribers(db, into, { tag: audience.tag });
      return { emails: [...into], migrationPending: !ok };
    }

    case "engaged": {
      const ok = await collectEngagedOpeners(db, audience.minOpens, audience.withinDays, into);
      return { emails: [...into], migrationPending: !ok };
    }

    case "segment": {
      if (audience.segment === "newsletter") {
        // v1: the newsletter list IS the contacts base (the Resend segment is
        // a best-effort mirror of it).
        const ok = await collectSubscribers(db, into, {});
        return { emails: [...into], migrationPending: !ok };
      }
      if (audience.segment === "trial" || audience.segment === "pro") {
        const statuses = audience.segment === "trial" ? ["on_trial"] : ["active"];
        const ids = await collectUserIdsByStatus(db, statuses);
        if (!ids) return { emails: [], migrationPending: false };
        await emailsForUserIds(db, [...ids], into);
        return { emails: [...into], migrationPending: false };
      }
      // churned: ended subs minus anyone who currently has live access.
      const ended = await collectUserIdsByStatus(db, ["cancelled", "expired"]);
      if (!ended) return { emails: [], migrationPending: false };
      const live = await collectUserIdsByStatus(db, LIVE_STATUSES);
      const churned = [...ended].filter((id) => !live?.has(id));
      await emailsForUserIds(db, churned, into);
      return { emails: [...into], migrationPending: false };
    }
  }
}
