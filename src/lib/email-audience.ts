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
import { campaignCategory } from "@/lib/email-marketing";

export type AudienceSegment = "trial" | "pro" | "churned" | "newsletter";

/**
 * Optional A/B split applied to ANY audience: keep only the addresses whose
 * stable hash bucket equals `index` out of `of` buckets. Two campaigns with the
 * same audience and split indexes 0 and 1 (of 2) get disjoint halves.
 */
export type AudienceSplit = { index: number; of: number };

export type Audience = (
  | { kind: "tag"; tag: string }
  | { kind: "all_contacts" }
  | { kind: "segment"; segment: AudienceSegment }
  | { kind: "engaged"; minOpens: number; withinDays?: number }
  | { kind: "opened_nonpaid"; minOpens: number; maxOpens?: number; withinDays?: number }
  | { kind: "campaign_nonopeners"; campaignId: string }
  | { kind: "pasted"; emails: string[] }
) & {
  split?: AudienceSplit;
  /**
   * Drop anyone who is already a recipient (any status) of these campaigns, so a
   * recurring send only reaches people who have not been sent the series yet.
   */
  excludeCampaignIds?: string[];
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SEGMENTS = new Set<AudienceSegment>(["trial", "pro", "churned", "newsletter"]);
const TAG_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SPLIT_OF = 4;
const MAX_EXCLUDE_CAMPAIGNS = 100;

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

/**
 * Stable bucket (0..of-1) for an address: FNV-1a 32-bit over the lowercased,
 * trimmed email. Deterministic, so a preview, the cron's recipient list and a
 * "duplicate as the other half" campaign always agree.
 */
export function splitBucket(email: string, of: number): number {
  let hash = 0x811c9dc5;
  for (const ch of email.trim().toLowerCase()) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % of;
}

/** Validates the optional split field. Undefined when absent, null when invalid. */
function parseSplit(raw: unknown): AudienceSplit | undefined | null {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") return null;
  const { index, of } = raw as Record<string, unknown>;
  if (typeof index !== "number" || typeof of !== "number") return null;
  if (!Number.isInteger(index) || !Number.isInteger(of)) return null;
  if (of < 2 || of > MAX_SPLIT_OF || index < 0 || index >= of) return null;
  return { index, of };
}

/** Validates the optional excludeCampaignIds field. Undefined when absent, null when invalid. */
function parseExcludeCampaignIds(raw: unknown): string[] | undefined | null {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.length > MAX_EXCLUDE_CAMPAIGNS) return null;
  const ids = new Set<string>();
  for (const id of raw) {
    if (typeof id !== "string" || !UUID_RE.test(id)) return null;
    ids.add(id.toLowerCase());
  }
  return ids.size > 0 ? [...ids] : undefined;
}

/** Allow-list validation of an untrusted audience payload. Null on garbage. */
export function parseAudience(input: unknown): Audience | null {
  const base = parseAudienceBase(input);
  if (!base) return null;
  const rawInput = input as Record<string, unknown>;
  const split = parseSplit(rawInput.split);
  if (split === null) return null;
  const exclude = parseExcludeCampaignIds(rawInput.excludeCampaignIds);
  if (exclude === null) return null;
  return {
    ...base,
    ...(split ? { split } : {}),
    ...(exclude ? { excludeCampaignIds: exclude } : {}),
  };
}

function parseAudienceBase(input: unknown): Audience | null {
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
    case "opened_nonpaid": {
      // Inclusive threshold ("opened at least this many"), unlike "engaged"'s
      // strictly-more-than: the point of this audience is simply "has opened
      // one of our emails", so the default is 1, not 2.
      const minOpens =
        typeof raw.minOpens === "number" && Number.isFinite(raw.minOpens)
          ? Math.max(1, Math.min(MAX_MIN_OPENS, Math.floor(raw.minOpens)))
          : 1;
      const withinDays =
        typeof raw.withinDays === "number" && Number.isFinite(raw.withinDays)
          ? Math.max(1, Math.min(MAX_WITHIN_DAYS, Math.floor(raw.withinDays)))
          : undefined;
      // Optional inclusive upper bound ("opened 1 to 2 emails"). A maximum below
      // the minimum would match nobody, so it is dropped rather than honored.
      const maxCandidate =
        typeof raw.maxOpens === "number" && Number.isFinite(raw.maxOpens)
          ? Math.min(MAX_MIN_OPENS, Math.floor(raw.maxOpens))
          : undefined;
      const maxOpens =
        maxCandidate !== undefined && maxCandidate >= minOpens ? maxCandidate : undefined;
      return {
        kind: "opened_nonpaid",
        minOpens,
        ...(maxOpens !== undefined ? { maxOpens } : {}),
        ...(withinDays ? { withinDays } : {}),
      };
    }
    case "campaign_nonopeners": {
      if (typeof raw.campaignId !== "string" || !UUID_RE.test(raw.campaignId)) return null;
      return { kind: "campaign_nonopeners", campaignId: raw.campaignId.toLowerCase() };
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
 * Pages email_sends for delivered opens and tallies opens per recipient.
 * opened_at is stamped first-open-only (one row per send), so a row count is
 * an opened-email count. Returns null on a query error so callers can surface
 * the migration/setup banner. Shared by every audience that starts from open
 * history (engaged, opened_nonpaid).
 */
async function scanOpenCounts(
  db: SupabaseClient,
  withinDays: number | undefined,
): Promise<Map<string, number> | null> {
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
    if (error) return null;
    const rows = data ?? [];
    for (const row of rows) {
      const email = typeof row.recipient === "string" ? row.recipient.trim().toLowerCase() : "";
      if (email) counts.set(email, (counts.get(email) ?? 0) + 1);
    }
    scanned += rows.length;
    if (rows.length < PAGE || scanned >= OPEN_SCAN_CAP) break;
    offset += PAGE;
  }
  return counts;
}

/**
 * Tallies opens per recipient and keeps anyone who opened STRICTLY MORE than
 * minOpens of our emails, then drops opted-out addresses. Returns false on a
 * query error so the caller can surface the migration/setup banner.
 */
async function collectEngagedOpeners(
  db: SupabaseClient,
  minOpens: number,
  withinDays: number | undefined,
  into: Set<string>,
): Promise<boolean> {
  const counts = await scanOpenCounts(db, withinDays);
  if (!counts) return false;

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
 * Tallies opens per recipient and keeps anyone who opened at least minOpens
 * (and at most maxOpens, when given) of our emails, drops opted-out addresses
 * (same as "engaged"), then drops
 * anyone with a live subscription (active, past_due, paused, or on a free
 * trial), since a "try Pro free" pitch is wrong for someone already on one. A
 * candidate with no matching profiles row (extension-only leads, cold-outreach
 * contacts) has no app account and so counts as unsubscribed. Returns false on a query
 * error so the caller can surface the migration/setup banner.
 */
async function collectOpenedNonPaid(
  db: SupabaseClient,
  minOpens: number,
  maxOpens: number | undefined,
  withinDays: number | undefined,
  into: Set<string>,
): Promise<boolean> {
  const counts = await scanOpenCounts(db, withinDays);
  if (!counts) return false;

  const candidates: string[] = [];
  for (const [email, n] of counts) {
    if (n >= minOpens && (maxOpens === undefined || n <= maxOpens)) candidates.push(email);
  }

  const optedOut = new Set<string>();
  await collectOptedOut(db, candidates, optedOut);
  const remaining = candidates.filter((email) => !optedOut.has(email));
  if (remaining.length === 0) return true;

  const emailToUserId = new Map<string, string>();
  for (const slice of chunk(remaining, CHUNK)) {
    const { data, error } = await db.from("profiles").select("id,email").in("email", slice);
    if (error) continue;
    for (const row of data ?? []) {
      const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      const id = typeof row.id === "string" ? row.id : "";
      if (email && id) emailToUserId.set(email, id);
    }
  }

  const liveIds = await collectUserIdsByStatus(db, LIVE_STATUSES);

  for (const email of remaining) {
    const userId = emailToUserId.get(email);
    const isLive = userId !== undefined && liveIds !== null && liveIds.has(userId);
    if (!isLive && into.size < MAX_AUDIENCE) into.add(email);
  }
  return true;
}

/** Addresses that were sent the campaign but never opened it (pure set logic). */
export function nonOpeners(sent: Iterable<string>, openers: Set<string>): string[] {
  const out: string[] = [];
  for (const email of sent) {
    if (!openers.has(email)) out.push(email);
  }
  return out;
}

/**
 * People who were sent an earlier campaign and never opened it: recipients with
 * status 'sent' minus anyone with an opened email_sends row for that campaign's
 * category, minus opted-out addresses, minus anyone who has since started a
 * subscription or trial. Fails closed (returns false) if the live-subscriber
 * lookup errors, so a resend can never reach a paying customer by accident.
 * Note a "non-opener" may simply have blocked the tracking pixel.
 */
async function collectCampaignNonOpeners(
  db: SupabaseClient,
  campaignId: string,
  into: Set<string>,
): Promise<boolean> {
  const sent = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("email_campaign_recipients")
      .select("email")
      .eq("campaign_id", campaignId)
      .eq("status", "sent")
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) return false;
    const rows = data ?? [];
    for (const row of rows) {
      const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      if (email) sent.add(email);
    }
    if (rows.length < PAGE) break;
  }
  if (sent.size === 0) return true;

  const openers = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("email_sends")
      .select("recipient")
      .eq("category", campaignCategory(campaignId))
      .not("opened_at", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) return false;
    const rows = data ?? [];
    for (const row of rows) {
      const email = typeof row.recipient === "string" ? row.recipient.trim().toLowerCase() : "";
      if (email) openers.add(email);
    }
    if (rows.length < PAGE) break;
  }

  const live = await liveSubscriberEmails(db);
  if (!live) return false;

  const candidates = nonOpeners(sent, openers).filter((email) => !live.has(email));
  const optedOut = new Set<string>();
  await collectOptedOut(db, candidates, optedOut);
  for (const email of candidates) {
    if (!optedOut.has(email) && into.size < MAX_AUDIENCE) into.add(email);
  }
  return true;
}

/**
 * Resolves an audience to a concrete deduped list of lowercased addresses,
 * then applies the optional A/B split. migrationPending is true when the
 * contacts table (or its tags column) is missing, so callers can surface the
 * apply-the-migration banner.
 */
export async function resolveAudience(
  db: SupabaseClient,
  audience: Audience,
): Promise<{ emails: string[]; migrationPending: boolean }> {
  const resolved = await resolveAudienceBase(db, audience);
  let emails = resolved.emails;

  if (audience.excludeCampaignIds?.length) {
    const already = await collectCampaignRecipients(db, audience.excludeCampaignIds);
    // Fail closed: if we cannot tell who was already emailed, reach nobody.
    if (!already) return { emails: [], migrationPending: true };
    emails = emails.filter((email) => !already.has(email));
  }

  const { split } = audience;
  if (split) emails = emails.filter((email) => splitBucket(email, split.of) === split.index);
  return { ...resolved, emails };
}

/** Every address that is a recipient (any status) of the given campaigns, or null on error. */
async function collectCampaignRecipients(
  db: SupabaseClient,
  campaignIds: string[],
): Promise<Set<string> | null> {
  const out = new Set<string>();
  for (const campaignId of campaignIds) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await db
        .from("email_campaign_recipients")
        .select("email")
        .eq("campaign_id", campaignId)
        .order("id")
        .range(offset, offset + PAGE - 1);
      if (error) return null;
      const rows = data ?? [];
      for (const row of rows) {
        const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
        if (email) out.add(email);
      }
      if (rows.length < PAGE) break;
    }
  }
  return out;
}

async function resolveAudienceBase(
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

    case "opened_nonpaid": {
      const ok = await collectOpenedNonPaid(
        db,
        audience.minOpens,
        audience.maxOpens,
        audience.withinDays,
        into,
      );
      return { emails: [...into], migrationPending: !ok };
    }

    case "campaign_nonopeners": {
      const ok = await collectCampaignNonOpeners(db, audience.campaignId, into);
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
