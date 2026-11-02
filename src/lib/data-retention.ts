/**
 * Retention purges promised by the privacy policy (section 7):
 *   - AI Assistant transcripts: 12 months, then deleted.
 *   - Private call recordings and transcripts: 12 months, then deleted.
 *   - Marketing email events: 24 months, then deleted (transactional sends and
 *     the suppression list are out of scope - see purgeMarketingEmailSends).
 * (Support tickets and attachments, 3 years, are purged by the feedback Worker.)
 *
 * Also purges product_market_history, the pooled "internal Keepa" trend log
 * (not personal data, no privacy-policy entry), which is append-only by design
 * and otherwise grows forever - see purgeProductMarketHistory.
 *
 * All purges are bounded per run, dry-runnable, and idempotent: a row that
 * fails stays put and is picked up again on the next daily run. Called from
 * /api/cron/purge-ai-sessions, /api/cron/purge-call-recordings,
 * /api/cron/purge-marketing-email-sends and /api/cron/purge-market-history.
 * Dependencies: ./recall (deleteBotMedia).
 */
import { deleteBotMedia } from "@/lib/recall";

export const AI_SESSION_RETENTION_MONTHS = 12;
export const CALL_RECORDING_RETENTION_MONTHS = 12;
// Matches the privacy policy §7 promise for marketing email events.
export const MARKETING_EMAIL_SENDS_RETENTION_MONTHS = 24;
// One month of buffer over market_monthly_rank's default 24-month seasonality
// window (20260911_market_monthly_rank.sql), so the seasonality chip never
// loses a month it would otherwise have had.
export const PRODUCT_MARKET_HISTORY_RETENTION_MONTHS = 25;
export const PURGE_BATCH = 100;
// product_market_history and email_sends are plain DB deletes with no external
// API call per row (unlike call recordings), so a run can clear far more rows
// without risking the function's time budget.
export const BULK_PURGE_BATCH = 2000;

/** ISO timestamp `months` calendar months before `nowMs`. */
export function cutoffIso(nowMs: number, months: number): string {
  const d = new Date(nowMs);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}

// Structural type for the bits of the Supabase client used here, so the purges
// can be unit-tested without a database.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export type PurgeSummary = {
  dry: boolean;
  candidates: number;
  purged: number;
  skipped: number;
  errors: number;
};

function newSummary(dry: boolean): PurgeSummary {
  return { dry, candidates: 0, purged: 0, skipped: 0, errors: 0 };
}

/** Delete AI Assistant sessions created more than 12 months ago (whole rows). */
export async function purgeAiSessions(
  admin: Admin,
  opts: { dry?: boolean; nowMs?: number } = {},
): Promise<PurgeSummary> {
  const dry = !!opts.dry;
  const out = newSummary(dry);
  const cutoff = cutoffIso(opts.nowMs ?? Date.now(), AI_SESSION_RETENTION_MONTHS);

  const { data, error } = await admin
    .from("ai_concierge_sessions")
    .select("id")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(PURGE_BATCH);
  if (error) { console.error("[purge-ai-sessions] query", error.message); out.errors += 1; return out; }

  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  out.candidates = ids.length;
  if (dry || ids.length === 0) return out;

  const del = await admin.from("ai_concierge_sessions").delete().in("id", ids);
  if (del?.error) { console.error("[purge-ai-sessions] delete", del.error.message); out.errors += 1; return out; }
  out.purged = ids.length;
  return out;
}

type RecordingRow = { id: string; recall_bot_id: string | null };

/**
 * Remove call recordings and transcripts older than 12 months: delete the media
 * at Recall.ai first, then null recording_url / transcript / ai_notes /
 * recall_bot_id on the booking (the booking itself and filed ticket ids stay) and
 * mark recording_status 'expired'. Recall failures leave the row untouched so the
 * next run retries; a row is never cleared while Recall may still hold the media.
 * Group-event recordings (events table) are out of scope: the policy keeps those
 * while the replay is offered.
 */
export async function purgeCallRecordings(
  admin: Admin,
  opts: { dry?: boolean; nowMs?: number; deleteMedia?: typeof deleteBotMedia } = {},
): Promise<PurgeSummary> {
  const dry = !!opts.dry;
  const del = opts.deleteMedia ?? deleteBotMedia;
  const out = newSummary(dry);
  const cutoff = cutoffIso(opts.nowMs ?? Date.now(), CALL_RECORDING_RETENTION_MONTHS);

  const { data, error } = await admin
    .from("call_bookings")
    .select("id, recall_bot_id")
    .lt("recorded_at", cutoff)
    .or("recall_bot_id.not.is.null,recording_url.not.is.null,transcript.not.is.null,ai_notes.not.is.null")
    .order("recorded_at", { ascending: true })
    .limit(PURGE_BATCH);
  if (error) { console.error("[purge-call-recordings] query", error.message); out.errors += 1; return out; }

  const rows = (data ?? []) as RecordingRow[];
  out.candidates = rows.length;
  if (dry) return out;

  for (const r of rows) {
    try {
      if (r.recall_bot_id) {
        const res = await del(r.recall_bot_id);
        if (res.result === "pending") { out.skipped += 1; continue; }
        if (res.result === "error") { out.errors += 1; continue; }
      }
      const up = await admin
        .from("call_bookings")
        .update({
          recording_url: null,
          transcript: null,
          ai_notes: null,
          recall_bot_id: null,
          recording_status: "expired",
        })
        .eq("id", r.id);
      if (up?.error) { console.error("[purge-call-recordings] update", r.id, up.error.message); out.errors += 1; continue; }
      out.purged += 1;
    } catch (e) {
      console.error("[purge-call-recordings] row", r.id, e);
      out.errors += 1;
    }
  }
  return out;
}

/**
 * Delete marketing email_sends rows (funnel 'campaign' or 'sequence') created
 * more than 24 months ago, per the privacy policy §7 "Marketing email events"
 * entry. Transactional sends (receipts, account notices, etc.) and the
 * email_suppressions table are untouched: transactional carries no promised
 * expiry and suppressions are kept indefinitely so we keep honoring opt-outs.
 */
export async function purgeMarketingEmailSends(
  admin: Admin,
  opts: { dry?: boolean; nowMs?: number } = {},
): Promise<PurgeSummary> {
  const dry = !!opts.dry;
  const out = newSummary(dry);
  const cutoff = cutoffIso(opts.nowMs ?? Date.now(), MARKETING_EMAIL_SENDS_RETENTION_MONTHS);

  const { data, error } = await admin
    .from("email_sends")
    .select("id")
    .in("funnel", ["campaign", "sequence"])
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(BULK_PURGE_BATCH);
  if (error) { console.error("[purge-marketing-email-sends] query", error.message); out.errors += 1; return out; }

  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  out.candidates = ids.length;
  if (dry || ids.length === 0) return out;

  const del = await admin.from("email_sends").delete().in("id", ids);
  if (del?.error) { console.error("[purge-marketing-email-sends] delete", del.error.message); out.errors += 1; return out; }
  out.purged = ids.length;
  return out;
}

/**
 * Delete product_market_history rows older than 25 months (not personal data,
 * no privacy-policy entry - this is purely a disk-IO/growth bound). The table
 * is an append-only pooled trend log by design (do not upsert it), so without
 * a purge it grows forever; reads only ever need the last ~60 trend points or
 * the last 24 months for the seasonality RPC, both well inside this window.
 * product_market_latest (the "now" snapshot) is untouched: it is already one
 * row per asin+marketplace with no history to prune.
 */
export async function purgeProductMarketHistory(
  admin: Admin,
  opts: { dry?: boolean; nowMs?: number } = {},
): Promise<PurgeSummary> {
  const dry = !!opts.dry;
  const out = newSummary(dry);
  const cutoff = cutoffIso(opts.nowMs ?? Date.now(), PRODUCT_MARKET_HISTORY_RETENTION_MONTHS);

  const { data, error } = await admin
    .from("product_market_history")
    .select("id")
    .lt("captured_at", cutoff)
    .order("captured_at", { ascending: true })
    .limit(BULK_PURGE_BATCH);
  if (error) { console.error("[purge-market-history] query", error.message); out.errors += 1; return out; }

  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  out.candidates = ids.length;
  if (dry || ids.length === 0) return out;

  const del = await admin.from("product_market_history").delete().in("id", ids);
  if (del?.error) { console.error("[purge-market-history] delete", del.error.message); out.errors += 1; return out; }
  out.purged = ids.length;
  return out;
}
