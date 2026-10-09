/**
 * account-deletion.ts - self-serve account deletion (and the shared eraser the
 * admin "Delete user" action uses).
 *
 * Flow
 *   1. The signed-in user asks to delete (POST /api/account/delete). We refuse
 *      while they hold a live paid subscription (they cancel first) and for
 *      staff accounts. Otherwise we record a pending request that is due in
 *      GRACE_DAYS days. They can cancel any time before then.
 *   2. A daily cron (/api/cron/process-account-deletions) runs executeDeletion
 *      for every due request.
 *
 * What executeDeletion does
 *   - Re-checks the blockers (they may have re-subscribed during the grace
 *     window).
 *   - Erases the user's data table by table. Prod schema lags migrations/
 *     (hand-applied), so every step tolerates a missing table or column.
 *   - Affiliates with payout / tax-form records: those rows must be kept for
 *     7 years (see the privacy policy) but they cascade-delete with the auth
 *     user. So for those users we RETIRE the account instead: everything else
 *     is erased, the login is banned and its email replaced with a
 *     non-identifying placeholder, and the auth row stays so the retained rows
 *     keep their owner. Everyone else is hard-deleted.
 *   - If any erase step fails for a real reason (not a missing table), we leave
 *     the request pending and retry on the next run instead of deleting the
 *     auth user, which would strand the remaining rows with no key to find
 *     them by.
 *
 * Not covered here (separate systems, see docs/privacy-policy-update-draft.md):
 * support tickets in the feedback Worker, Recall.ai-hosted recordings, Lemon
 * Squeezy billing records, licensing / links Worker data, and Resend's contact
 * list.
 *
 * State lives in app_config (key `account_deletion:<userId>`) so no migration is
 * needed. Pending keys hold no email address.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isEmailAdmin } from "@/lib/admin";
import { isMissingColumnError, isMissingTableError } from "@/lib/extension-api";

export const GRACE_DAYS = 7;
export const PENDING_PREFIX = "account_deletion:";
export const DONE_PREFIX = "account_deletion_done:";
/** After this many failed runs we stop retrying and leave it for a human. */
export const MAX_ATTEMPTS = 5;

/** Subscription statuses that mean the person is (or may still be) paying. */
export const LIVE_SUBSCRIPTION_STATUSES = ["active", "on_trial", "past_due", "paused"];

const DAY_MS = 24 * 60 * 60 * 1000;

type Admin = SupabaseClient;
type DbResult = { error: { code?: string; message?: string } | null };

export type DeletionBlocker = "staff" | "subscription" | "check_failed";

export type PendingDeletion = {
  userId: string;
  status: "pending";
  requestedAt: string;
  scheduledFor: string;
  attempts: number;
  lastError?: string;
};

export type DeletionOutcome =
  | { outcome: "deleted" | "retired"; email: string; errors: string[] }
  | { outcome: "blocked"; blocker: DeletionBlocker; email: string }
  | { outcome: "failed"; email: string; errors: string[] }
  | { outcome: "not_found" };

/** Escape LIKE wildcards so an address like a_b@x.com only matches itself. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** The placeholder a retired account's email is replaced with. */
export function retiredEmail(userId: string): string {
  return `deleted-${userId}@deleted.invalid`;
}

export function scheduledForFrom(now: Date): string {
  return new Date(now.getTime() + GRACE_DAYS * DAY_MS).toISOString();
}

export function pendingKey(userId: string): string {
  return `${PENDING_PREFIX}${userId}`;
}

// ---------------------------------------------------------------------------
// What gets erased
// ---------------------------------------------------------------------------

/** Tables keyed by user_id whose rows are deleted. */
const DELETE_BY_USER_ID = [
  "affiliate_applications",
  "subscription_cancel_reasons",
  "mcp_api_keys",
  "community_question_upvotes",
  "extension_product_scans",
  "extension_content_gaps",
  "extension_storefront_issues",
  "extension_orders",
  "extension_creator_api_creds",
  "extension_deals",
  "extension_instagram_creators",
  "customer_discount_grants",
  "user_notes",
  "desktop_earnings_months",
  "desktop_earnings_top_asins",
  "desktop_earnings_sync_meta",
  "scheduled_social_posts",
];

/** Tables with both a user id and an email column: delete either match. */
const DELETE_BY_ID_OR_EMAIL: Array<{ table: string; idCol: string; emailCol: string }> = [
  { table: "ai_concierge_sessions", idCol: "user_id", emailCol: "user_email" },
  { table: "call_bookings", idCol: "user_id", emailCol: "user_email" },
  { table: "event_registrations", idCol: "user_id", emailCol: "user_email" },
  { table: "testimonials", idCol: "user_id", emailCol: "email" },
  { table: "extension_feedback", idCol: "user_id", emailCol: "email" },
];

/** Tables keyed only by email: delete rows for this address. */
const DELETE_BY_EMAIL: Array<{ table: string; emailCol: string }> = [
  { table: "email_sequence_enrollments", emailCol: "email" },
  { table: "email_campaign_recipients", emailCol: "email" },
  { table: "course_progress", emailCol: "email" },
  { table: "bundle_contributors", emailCol: "email" },
  { table: "extension_review_nudges", emailCol: "email" },
  { table: "email_sends", emailCol: "recipient" },
];

/** Rows we keep but strip of identity: set these columns to null. */
const ANONYMIZE: Array<{ table: string; idCol?: string; emailCol?: string; nullCols: string[] }> = [
  { table: "community_questions", idCol: "author_id", emailCol: "author_email", nullCols: ["author_id", "author_email"] },
  { table: "community_answers", idCol: "author_id", emailCol: "author_email", nullCols: ["author_id", "author_email"] },
  { table: "comp_grants", idCol: "user_id", emailCol: "user_email", nullCols: ["user_id", "user_email"] },
  { table: "client_action_events", idCol: "user_id", nullCols: ["user_id"] },
  { table: "product_market_history", idCol: "contributor_user_id", nullCols: ["contributor_user_id"] },
  { table: "product_video_observations", idCol: "contributor_user_id", nullCols: ["contributor_user_id"] },
];

/**
 * Records we are legally required to keep (affiliate payouts and tax forms,
 * 7 years). A user with any row here is retired instead of deleted.
 */
const RETAINED_TABLES = [
  "affiliate_payouts",
  "affiliate_tax_forms",
  "affiliate_tax_tins",
  "affiliate_tax_form_events",
  "affiliate_tax_filings",
  "affiliate_commission_adjustments",
];

/** True for errors that only mean "this prod DB does not have it yet". */
function isSchemaLag(error: DbResult["error"]): boolean {
  return isMissingTableError(error) || isMissingColumnError(error);
}

type Report = { errors: string[] };

async function step(report: Report, label: string, op: () => PromiseLike<DbResult>): Promise<void> {
  try {
    const { error } = await op();
    if (error && !isSchemaLag(error)) {
      report.errors.push(`${label}: ${error.message ?? error.code ?? "error"}`);
    }
  } catch (e) {
    report.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Erase everything that is not a retained record. Safe to re-run. Returns the
 * list of real (non-schema-lag) errors; empty means fully erased.
 */
export async function eraseUserData(admin: Admin, userId: string, email: string): Promise<string[]> {
  const report: Report = { errors: [] };
  const pattern = escapeLike(email.trim());

  for (const table of DELETE_BY_USER_ID) {
    await step(report, `${table}`, () => admin.from(table).delete().eq("user_id", userId));
  }

  for (const t of DELETE_BY_ID_OR_EMAIL) {
    await step(report, `${t.table}.id`, () => admin.from(t.table).delete().eq(t.idCol, userId));
    if (pattern) {
      await step(report, `${t.table}.email`, () => admin.from(t.table).delete().ilike(t.emailCol, pattern));
    }
  }

  if (pattern) {
    for (const t of DELETE_BY_EMAIL) {
      await step(report, `${t.table}.email`, () => admin.from(t.table).delete().ilike(t.emailCol, pattern));
    }
    // The newsletter list: keep a row that records an unsubscribe so the opt-out
    // keeps being honoured; remove every other row for this address.
    await step(report, "email_subscribers", () =>
      admin.from("email_subscribers").delete().ilike("email", pattern).is("unsubscribed_at", null),
    );
    // email_suppressions is deliberately NOT touched: a suppression is an opt-out
    // we must keep honouring.
  }

  for (const t of ANONYMIZE) {
    const nulls = Object.fromEntries(t.nullCols.map((c) => [c, null]));
    if (t.idCol) {
      await step(report, `${t.table}.anon-id`, () => admin.from(t.table).update(nulls).eq(t.idCol as string, userId));
    }
    if (t.emailCol && pattern) {
      await step(report, `${t.table}.anon-email`, () =>
        admin.from(t.table).update(nulls).ilike(t.emailCol as string, pattern),
      );
    }
  }

  // Referrals: rows where this person referred others carry other people's
  // emails, so delete them; rows where they were the referred person are just
  // detached.
  await step(report, "referrals.referrer", () => admin.from("referrals").delete().eq("referrer_user_id", userId));
  await step(report, "referrals.referred", () =>
    admin.from("referrals").update({ referred_user_id: null, referred_email: null }).eq("referred_user_id", userId),
  );

  // Avatar file.
  try {
    await admin.storage.from("avatars").remove([`${userId}/avatar.webp`, `${userId}/avatar.gif`]);
  } catch (e) {
    report.errors.push(`avatar: ${e instanceof Error ? e.message : String(e)}`);
  }

  return report.errors;
}

/**
 * Does this user own rows we must keep? On any uncertainty (a query error that
 * is not a missing table) answer true: wrongly retiring an account is harmless,
 * wrongly deleting tax records is not.
 */
export async function hasRetainedRecords(admin: Admin, userId: string): Promise<boolean> {
  for (const table of RETAINED_TABLES) {
    try {
      const { count, error } = await admin
        .from(table)
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (error) {
        if (isSchemaLag(error)) continue;
        return true;
      }
      if ((count ?? 0) > 0) return true;
    } catch {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Why this account cannot be deleted right now, or null if it can. */
export async function deletionBlocker(
  admin: Admin,
  userId: string,
  email: string | null | undefined,
): Promise<DeletionBlocker | null> {
  if (isEmailAdmin(email ?? null)) return "staff";

  try {
    const { data, error } = await admin
      .from("staff_members")
      .select("is_active")
      .eq("user_id", userId)
      .maybeSingle();
    if (error && !isSchemaLag(error)) return "check_failed";
    if ((data as { is_active?: boolean } | null)?.is_active) return "staff";
  } catch {
    return "check_failed";
  }

  try {
    const { data, error } = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .in("status", LIVE_SUBSCRIPTION_STATUSES)
      .limit(1);
    if (error) return isMissingTableError(error) ? null : "check_failed";
    if (Array.isArray(data) && data.length > 0) return "subscription";
  } catch {
    return "check_failed";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Request state (app_config)
// ---------------------------------------------------------------------------

export async function getPendingDeletion(admin: Admin, userId: string): Promise<PendingDeletion | null> {
  const { data, error } = await admin
    .from("app_config")
    .select("value")
    .eq("key", pendingKey(userId))
    .maybeSingle();
  if (error || !data) return null;
  const v = (data as { value?: Partial<PendingDeletion> }).value;
  if (!v || typeof v.scheduledFor !== "string") return null;
  return {
    userId,
    status: "pending",
    requestedAt: typeof v.requestedAt === "string" ? v.requestedAt : v.scheduledFor,
    scheduledFor: v.scheduledFor,
    attempts: typeof v.attempts === "number" ? v.attempts : 0,
    lastError: typeof v.lastError === "string" ? v.lastError : undefined,
  };
}

async function writePending(admin: Admin, p: PendingDeletion): Promise<boolean> {
  const { error } = await admin.from("app_config").upsert(
    {
      key: pendingKey(p.userId),
      value: p,
      updated_at: new Date().toISOString(),
      updated_by: "account-deletion",
    },
    { onConflict: "key" },
  );
  if (error) {
    console.error("account-deletion: could not write pending request", error);
    return false;
  }
  return true;
}

async function clearPending(admin: Admin, userId: string): Promise<void> {
  const { error } = await admin.from("app_config").delete().eq("key", pendingKey(userId));
  if (error) console.error("account-deletion: could not clear pending request", error);
}

export type RequestResult =
  | { ok: true; scheduledFor: string; alreadyPending: boolean }
  | { ok: false; code: DeletionBlocker | "unavailable" };

/** Record a deletion request due in GRACE_DAYS days (idempotent). */
export async function requestDeletion(
  admin: Admin,
  userId: string,
  email: string | null | undefined,
  now: Date = new Date(),
): Promise<RequestResult> {
  const blocker = await deletionBlocker(admin, userId, email);
  if (blocker) return { ok: false, code: blocker };

  const existing = await getPendingDeletion(admin, userId);
  if (existing) return { ok: true, scheduledFor: existing.scheduledFor, alreadyPending: true };

  const pending: PendingDeletion = {
    userId,
    status: "pending",
    requestedAt: now.toISOString(),
    scheduledFor: scheduledForFrom(now),
    attempts: 0,
  };
  const wrote = await writePending(admin, pending);
  if (!wrote) return { ok: false, code: "unavailable" };
  return { ok: true, scheduledFor: pending.scheduledFor, alreadyPending: false };
}

export async function cancelDeletion(admin: Admin, userId: string): Promise<void> {
  await clearPending(admin, userId);
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

async function retireAccount(admin: Admin, userId: string): Promise<string | null> {
  const placeholder = retiredEmail(userId);
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email: placeholder,
    email_confirm: true,
    ban_duration: "876000h",
    user_metadata: {},
    app_metadata: { account_retired: true },
  });
  if (error) return `retire auth: ${error.message}`;

  // Strip identity from the profile row. Best-effort: columns may lag in prod.
  const { error: pErr } = await admin
    .from("profiles")
    .update({
      email: placeholder,
      display_name: null,
      username: null,
      avatar_url: null,
      avatar_updated_at: null,
    })
    .eq("id", userId);
  if (pErr && !isSchemaLag(pErr)) return `retire profile: ${pErr.message}`;
  return null;
}

async function recordDone(admin: Admin, userId: string, outcome: "deleted" | "retired", errors: string[]) {
  await admin.from("app_config").upsert(
    {
      key: `${DONE_PREFIX}${userId}`,
      value: { userId, outcome, completedAt: new Date().toISOString(), notes: errors.slice(0, 5) },
      updated_at: new Date().toISOString(),
      updated_by: "account-deletion",
    },
    { onConflict: "key" },
  );
}

/**
 * Delete (or retire) one account now. `force` skips the subscription/staff
 * guard and is for the admin action only.
 */
export async function executeDeletion(
  admin: Admin,
  userId: string,
  opts: { force?: boolean } = {},
): Promise<DeletionOutcome> {
  const { data: userRes } = await admin.auth.admin.getUserById(userId);
  const email = userRes?.user?.email ?? "";
  if (!userRes?.user) {
    await clearPending(admin, userId);
    return { outcome: "not_found" };
  }

  if (!opts.force) {
    const blocker = await deletionBlocker(admin, userId, email);
    if (blocker) return { outcome: "blocked", blocker, email };
  }

  const errors = await eraseUserData(admin, userId, email);
  if (errors.length > 0) {
    return { outcome: "failed", email, errors };
  }

  let outcome: "deleted" | "retired" = "deleted";
  const notes: string[] = [];

  if (await hasRetainedRecords(admin, userId)) {
    outcome = "retired";
  } else {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      // Most likely an FK with no cascade pointing at auth.users. Fall back to
      // retiring so the person is still gone as far as they can tell.
      notes.push(`deleteUser: ${error.message}`);
      outcome = "retired";
    }
  }

  if (outcome === "retired") {
    const retireErr = await retireAccount(admin, userId);
    if (retireErr) return { outcome: "failed", email, errors: [...notes, retireErr] };
  }

  await clearPending(admin, userId);
  await recordDone(admin, userId, outcome, notes);
  return { outcome, email, errors: notes };
}

// ---------------------------------------------------------------------------
// Cron: process due requests
// ---------------------------------------------------------------------------

export type DueRequest = PendingDeletion;

export async function listDueDeletions(admin: Admin, now: Date = new Date()): Promise<DueRequest[]> {
  const { data, error } = await admin
    .from("app_config")
    .select("key,value")
    .like("key", `${PENDING_PREFIX}%`)
    .limit(200);
  if (error || !Array.isArray(data)) return [];
  const due: DueRequest[] = [];
  for (const row of data as Array<{ key: string; value?: Partial<PendingDeletion> }>) {
    const v = row.value;
    if (!v || typeof v.scheduledFor !== "string") continue;
    if (new Date(v.scheduledFor).getTime() > now.getTime()) continue;
    const userId = row.key.slice(PENDING_PREFIX.length);
    due.push({
      userId,
      status: "pending",
      requestedAt: typeof v.requestedAt === "string" ? v.requestedAt : v.scheduledFor,
      scheduledFor: v.scheduledFor,
      attempts: typeof v.attempts === "number" ? v.attempts : 0,
      lastError: typeof v.lastError === "string" ? v.lastError : undefined,
    });
  }
  return due;
}

/** Record a failed attempt so the next run retries (up to MAX_ATTEMPTS). */
export async function recordFailedAttempt(admin: Admin, req: PendingDeletion, errors: string[]): Promise<void> {
  await writePending(admin, {
    ...req,
    attempts: req.attempts + 1,
    lastError: errors.slice(0, 3).join(" | ").slice(0, 500),
  });
}
