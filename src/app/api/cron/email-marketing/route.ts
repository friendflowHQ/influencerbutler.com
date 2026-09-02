/**
 * Email marketing engine cron: /api/cron/email-marketing
 *
 * One periodic pass that drains the whole engine, in order:
 *   (a) Materialize: flip due scheduled drafts to 'sending' and resolve each
 *       sending campaign's audience into email_campaign_recipients rows.
 *   (b) Send: work queued campaign recipients under a shared per-run budget,
 *       marking suppressed addresses skipped and closing fully-drained
 *       campaigns as sent.
 *   (c) Advance sequences: send the next due step to every open enrollment
 *       under its own per-run budget; completions stamp completed_at.
 *   (d) Auto-enroll: sequences triggered on a subscriber source pick up
 *       recent email_subscribers rows (idempotent via the unique constraint).
 *
 * Each step runs in its own try/catch so one failure never blocks the others,
 * and a missing table (migration not applied yet) no-ops quietly. Guarded by
 * CRON_SECRET like the other crons.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAudience, resolveAudience, liveSubscriberEmails } from "@/lib/email-audience";
import {
  MARKETING_FROM,
  campaignCategory,
  stepCategory,
  shortId,
  enrollEmails,
  sequenceRunBudget,
  marketingRunBudget,
  DEFAULT_SENDS_PER_HOUR,
  SEQUENCE_RUNS_PER_HOUR,
  nextSendTime,
  plainTextToTrackableHtml,
} from "@/lib/email-marketing";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { EXT_REVIEW_TAG, personalizeReviewBody } from "@/lib/extension-review";
import { personalizePathBody } from "@/lib/email-path-select";
import { personalizeBundleSubmitBody } from "@/lib/grow-together-submit";
import { logSuppressedSkip, sendEmail } from "@/lib/email-send";
import { isEmailSuppressed } from "@/lib/email-unsubscribe";
import { isMissingTable } from "@/lib/growth-goals";
import { buildCampaignEmail } from "@/lib/campaign-email";
import type { NormalizedAttachment } from "@/lib/email-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPAIGN_PER_RUN = 100;
const MAX_ATTEMPTS = 3;
const CANDIDATE_LIMIT = 500;
const CHUNK = 200;
const AUTO_ENROLL_WINDOW_DAYS = 7;
const MATERIALIZE_PER_RUN = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

// Hard ceiling on total sequence sends per run, across all sequences, so no
// rate setting can blow the function's time budget. (Per-sequence throttle math
// lives in sequenceRunBudget in email-marketing.ts.) At 400/run x 12 runs/hr =
// 4800/hr, this stays above the domain-safe hourly headroom so it never clips it.
const SEQUENCE_GLOBAL_CEILING = 400;

// Domain-safe ceiling on TOTAL emails sent per rolling hour (all funnels). Drip
// marketing (campaigns + sequences) yields to it so transactional/system mail
// (sent immediately outside this cron, never gated) always has headroom. Tunable
// in prod via EMAIL_SAFE_HOURLY_SENDS without a deploy; falls back to this default.
const SAFE_HOURLY_SENDS_DEFAULT = 3000;

/** Domain-safe hourly send ceiling, from env or the conservative default. */
function safeHourlySends(): number {
  const raw = Number(process.env.EMAIL_SAFE_HOURLY_SENDS);
  return Number.isFinite(raw) && raw > 0 ? raw : SAFE_HOURLY_SENDS_DEFAULT;
}

/**
 * Counts emails actually sent (status='sent') in the last rolling hour, across
 * every funnel, using the email_sends created_at index. Returns 0 on error so a
 * transient count failure fails open to the per-run ceilings (prior behavior)
 * rather than stalling the drip.
 */
async function sentInLastHour(db: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await db
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    // Admin test sends (a staff member previewing a funnel in their own inbox)
    // must not eat into the domain-safe drip headroom, so they are excluded here.
    .not("category", "in", "(sequence_test,campaign_test)")
    .gte("created_at", since);
  if (error) {
    reportError("sent-last-hour count", error);
    return 0;
  }
  return count ?? 0;
}

// Auto-pause thresholds: once a sequence has sent at least MIN_HEALTH_SAMPLE
// emails (100, so small early batches are not paused on noise), pause it if the
// bounce rate crosses 10% or the complaint rate crosses 0.3%.
const MIN_HEALTH_SAMPLE = 100;
const MAX_BOUNCE_RATE = 0.1; // 10%
const MAX_COMPLAINT_RATE = 0.003; // 0.3%

type DbError = { message?: string; code?: string } | null;

type Summary = {
  ok: true;
  materialized: number;
  campaignSent: number;
  campaignSkipped: number;
  campaignFailed: number;
  sequenceSent: number;
  sequenceStoppedSubscribed: number;
  sequencesAutoPaused: number;
  autoEnrolled: number;
};

type SequenceRow = {
  id: string;
  trigger: unknown;
  sends_per_hour: number | null;
  send_hour: number | null;
  track_opens: boolean;
};

type StepRow = {
  id: string;
  sequence_id: string;
  position: number;
  day_offset: number;
  subject: string;
  body: string;
};

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("cron email-marketing: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

function chunkArr<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Logs a step's query error unless it is just the migration not being applied. */
function reportError(step: string, error: DbError): void {
  if (!error || isMissingTable(error)) return;
  console.error(`cron email-marketing: ${step} failed`, error);
}

/** Fetches active sequences, or null when the table is missing / errored. */
async function activeSequences(db: SupabaseClient): Promise<SequenceRow[] | null> {
  // sends_per_hour / send_hour / track_opens are added by later migrations; fall
  // back to the base columns when those have not been applied yet so the cron
  // keeps running (every sequence then uses the default budget, enrollment-minute
  // timing, and text-only sends).
  const withHour = await db
    .from("email_sequences")
    .select("id, trigger, sends_per_hour, send_hour, track_opens")
    .eq("status", "active");
  if (!withHour.error) return (withHour.data ?? []) as SequenceRow[];

  // send_hour / track_opens not applied yet but sends_per_hour might be: keep
  // the throttle.
  const withRate = await db
    .from("email_sequences")
    .select("id, trigger, sends_per_hour")
    .eq("status", "active");
  if (!withRate.error) {
    return ((withRate.data ?? []) as Omit<SequenceRow, "send_hour" | "track_opens">[]).map((r) => ({
      ...r,
      send_hour: null,
      track_opens: false,
    }));
  }

  const base = await db.from("email_sequences").select("id, trigger").eq("status", "active");
  if (base.error) {
    reportError("active sequences query", base.error);
    return null;
  }
  return ((base.data ?? []) as { id: string; trigger: unknown }[]).map((r) => ({
    ...r,
    sends_per_hour: null,
    send_hour: null,
    track_opens: false,
  }));
}

// ---------------------------------------------------------------------------
// (a) Materialize campaigns
// ---------------------------------------------------------------------------

async function materializeCampaigns(db: SupabaseClient, summary: Summary): Promise<void> {
  const nowIso = new Date().toISOString();

  // Scheduled drafts whose time has come start sending.
  const { error: flipErr } = await db
    .from("email_campaigns")
    .update({ status: "sending" })
    .eq("status", "draft")
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", nowIso);
  if (flipErr) {
    reportError("flip scheduled drafts", flipErr);
    if (isMissingTable(flipErr)) return;
  }

  const { data, error } = await db
    .from("email_campaigns")
    .select("id, audience")
    .eq("status", "sending")
    .is("materialized_at", null)
    .order("created_at", { ascending: true })
    .limit(MATERIALIZE_PER_RUN);
  if (error) {
    reportError("materialize query", error);
    return;
  }

  for (const row of (data ?? []) as { id: string; audience: unknown }[]) {
    const audience = parseAudience(row.audience);
    if (!audience) {
      // Unusable audience payload: park the campaign as cancelled instead of
      // re-resolving it forever.
      console.error("cron email-marketing: campaign has invalid audience", { id: row.id });
      await db
        .from("email_campaigns")
        .update({ materialized_at: new Date().toISOString(), status: "cancelled" })
        .eq("id", row.id);
      continue;
    }

    const { emails, migrationPending } = await resolveAudience(db, audience);
    if (migrationPending) {
      // Contacts table not ready: leave the campaign unmaterialized and retry
      // next run rather than closing it out against an empty list.
      continue;
    }

    for (const slice of chunkArr(emails, CHUNK)) {
      const rows = slice.map((email) => ({ campaign_id: row.id, email, status: "queued" }));
      const { error: upsertErr } = await db
        .from("email_campaign_recipients")
        .upsert(rows, { onConflict: "campaign_id,email", ignoreDuplicates: true });
      if (upsertErr) reportError("recipient upsert", upsertErr);
    }

    const stamp: Record<string, unknown> = { materialized_at: new Date().toISOString() };
    if (emails.length === 0) {
      // Nothing to send: close the campaign immediately.
      stamp.status = "sent";
      stamp.sent_at = new Date().toISOString();
    }
    const { error: stampErr } = await db.from("email_campaigns").update(stamp).eq("id", row.id);
    if (stampErr) {
      reportError("materialized stamp", stampErr);
      continue;
    }
    summary.materialized += 1;
  }
}

// ---------------------------------------------------------------------------
// (b) Send campaign recipients
// ---------------------------------------------------------------------------

type SendingCampaign = {
  id: string;
  subject: string;
  body: string;
  attachments?: NormalizedAttachment[] | null;
  inline_images?: NormalizedAttachment[] | null;
};

async function sendCampaignRecipients(db: SupabaseClient, summary: Summary): Promise<void> {
  // Prefer the media columns; fall back to the base columns when the 20260818
  // migration has not been applied so the send engine keeps draining.
  const withMedia = await db
    .from("email_campaigns")
    .select("id, subject, body, attachments, inline_images")
    .eq("status", "sending")
    .not("materialized_at", "is", null)
    .order("created_at", { ascending: true });
  let rows = withMedia.data as SendingCampaign[] | null;
  let error = withMedia.error;
  if (error) {
    const base = await db
      .from("email_campaigns")
      .select("id, subject, body")
      .eq("status", "sending")
      .not("materialized_at", "is", null)
      .order("created_at", { ascending: true });
    rows = base.data as SendingCampaign[] | null;
    error = base.error;
  }
  if (error) {
    reportError("sending campaigns query", error);
    return;
  }

  // One shared budget across every sending campaign, oldest first, bounded by the
  // rolling-hour headroom so campaigns yield to transactional/system volume.
  let budget = marketingRunBudget(safeHourlySends(), await sentInLastHour(db), CAMPAIGN_PER_RUN);
  if (budget <= 0) return;

  for (const campaign of (rows ?? []) as SendingCampaign[]) {
    if (budget <= 0) break;
    const built = buildCampaignEmail({
      body: campaign.body,
      attachments: campaign.attachments ?? [],
      inlineImages: campaign.inline_images ?? [],
    });

    const { data: recipients, error: recErr } = await db
      .from("email_campaign_recipients")
      .select("id, email, attempts")
      .eq("campaign_id", campaign.id)
      .eq("status", "queued")
      .limit(budget);
    if (recErr) {
      reportError("queued recipients query", recErr);
      continue;
    }

    for (const recipient of (recipients ?? []) as { id: string; email: string; attempts: number }[]) {
      if (budget <= 0) break;
      const email = recipient.email;

      if (await isEmailSuppressed(email)) {
        // Opted out: mark skipped (keeps per-campaign counts honest) and log
        // the skip so it stays visible in the admin Emails dashboard.
        await db.from("email_campaign_recipients").update({ status: "skipped" }).eq("id", recipient.id);
        await logSuppressedSkip({
          to: email,
          subject: campaign.subject,
          category: campaignCategory(campaign.id),
          funnel: "campaign",
        });
        summary.campaignSkipped += 1;
        continue;
      }

      budget -= 1;
      const ok = await sendMarketingEmail({
        from: MARKETING_FROM,
        to: email,
        subject: campaign.subject,
        text: built.text,
        html: built.html,
        attachments: built.attachments,
        category: campaignCategory(campaign.id),
        funnel: "campaign",
      });
      if (ok) {
        await db
          .from("email_campaign_recipients")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", recipient.id);
        summary.campaignSent += 1;
      } else {
        const attempts = (recipient.attempts ?? 0) + 1;
        const update: Record<string, unknown> = { attempts };
        if (attempts >= MAX_ATTEMPTS) {
          update.status = "failed";
          summary.campaignFailed += 1;
        }
        await db.from("email_campaign_recipients").update(update).eq("id", recipient.id);
      }
    }

    // Fully drained? Close the campaign.
    const { count, error: countErr } = await db
      .from("email_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "queued");
    if (!countErr && (count ?? 0) === 0) {
      await db
        .from("email_campaigns")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", campaign.id);
    }
  }
}

// ---------------------------------------------------------------------------
// (c) Advance sequence enrollments
// ---------------------------------------------------------------------------

async function advanceSequences(db: SupabaseClient, summary: Summary): Promise<void> {
  const sequences = await activeSequences(db);
  if (!sequences || sequences.length === 0) return;

  const { data: stepData, error: stepErr } = await db
    .from("email_sequence_steps")
    .select("id, sequence_id, position, day_offset, subject, body")
    .in("sequence_id", sequences.map((s) => s.id))
    .order("position", { ascending: true });
  if (stepErr) {
    reportError("sequence steps query", stepErr);
    return;
  }

  const stepsBySequence = new Map<string, StepRow[]>();
  for (const step of (stepData ?? []) as StepRow[]) {
    const list = stepsBySequence.get(step.sequence_id) ?? [];
    list.push(step);
    stepsBySequence.set(step.sequence_id, list);
  }

  // Stop-on-subscribe: anyone who now has a live subscription (subscribed or
  // started a trial) gets cancelled out of every re-engagement drip so we don't
  // keep nudging a converted customer. Fetched once per run; on error we skip
  // the check (never cancel wrongly).
  const liveEmails = await liveSubscriberEmails(db);

  // Global ceiling bounds total work; each sequence also has its own per-run cap.
  // Bounded by the rolling-hour headroom too, so sequences yield to transactional
  // and campaign volume (transactional is counted but never gated: system first).
  // sentInLastHour here already includes any campaign sends from this same run,
  // since those are logged synchronously before advanceSequences runs.
  let globalRemaining = marketingRunBudget(
    safeHourlySends(),
    await sentInLastHour(db),
    SEQUENCE_GLOBAL_CEILING,
  );

  // Per-sequence fallback when sends_per_hour is null: the conservative default
  // rate, so even a sequence created without an explicit rate stays drip-protected.
  const defaultSeqBudget = Math.max(1, Math.ceil(DEFAULT_SENDS_PER_HOUR / SEQUENCE_RUNS_PER_HOUR));

  for (const seq of sequences) {
    if (globalRemaining <= 0) break;
    const steps = stepsBySequence.get(seq.id) ?? [];
    let seqBudget = Math.min(sequenceRunBudget(seq.sends_per_hour, defaultSeqBudget), globalRemaining);

    // The review-ask sequence deliberately targets HAPPY users, paying ones
    // included, so it opts out of stop-on-subscribe (a converted customer is
    // exactly who we want a review from). Its self-report confirm link is what
    // cancels it. Every other sequence is a re-engagement drip that must stop.
    const trig = (seq.trigger ?? null) as { kind?: string; tag?: string } | null;
    const stopOnSubscribe = !(trig?.kind === "tag_added" && trig.tag === EXT_REVIEW_TAG);

    const { data: enrollData, error: enrollErr } = await db
      .from("email_sequence_enrollments")
      .select("id, email, enrolled_at, last_step_sent")
      .eq("sequence_id", seq.id)
      .is("completed_at", null)
      .is("cancelled_at", null)
      .order("enrolled_at", { ascending: true })
      .limit(CANDIDATE_LIMIT);
    if (enrollErr) {
      reportError("enrollments query", enrollErr);
      continue;
    }

    const enrollments = (enrollData ?? []) as {
      id: string;
      email: string;
      enrolled_at: string;
      last_step_sent: number;
    }[];

    for (const enrollment of enrollments) {
      if (seqBudget <= 0 || globalRemaining <= 0) break;

      // Converted since enrolling? Cancel and move on (does not spend budget).
      // Also record the conversion last-touch: converted_at + the last step they
      // received (converted_step), so the Sequences tab can show which step earns
      // conversions. Degrades gracefully if the 20260906 migration is not applied
      // yet: retry with just cancelled_at so stop-on-subscribe still works.
      if (stopOnSubscribe && liveEmails && liveEmails.has(enrollment.email.trim().toLowerCase())) {
        const now = new Date().toISOString();
        const { error: convErr } = await db
          .from("email_sequence_enrollments")
          .update({
            cancelled_at: now,
            converted_at: now,
            converted_step: enrollment.last_step_sent ?? 0,
          })
          .eq("id", enrollment.id);
        if (convErr) {
          await db
            .from("email_sequence_enrollments")
            .update({ cancelled_at: now })
            .eq("id", enrollment.id);
        }
        summary.sequenceStoppedSubscribed += 1;
        continue;
      }

      const nextStep = steps.find((s) => s.position === (enrollment.last_step_sent ?? 0) + 1);
      if (!nextStep) {
        // No further step exists (steps were removed, or the pointer already
        // walked past the end): the enrollment is done.
        await db
          .from("email_sequence_enrollments")
          .update({ completed_at: new Date().toISOString() })
          .eq("id", enrollment.id);
        continue;
      }

      const dueAt = nextSendTime(enrollment.enrolled_at, nextStep.day_offset, seq.send_hour);
      if (!Number.isFinite(dueAt) || dueAt > Date.now()) continue;

      seqBudget -= 1;
      globalRemaining -= 1;
      // No-op unless the body carries placeholders: {{REVIEW_*}} (the review
      // sequence), {{PATH_*_URL}} (the giveaway welcome fork), or
      // {{BUNDLE_SUBMIT_URL}} (the Grow Together contributor onboarding), each
      // replaced with this recipient's signed links.
      const personalizedText = personalizeBundleSubmitBody(
        personalizePathBody(
          personalizeReviewBody(nextStep.body, enrollment.email),
          enrollment.email,
        ),
        enrollment.email,
      );
      const ok = await sendMarketingEmail({
        from: MARKETING_FROM,
        to: enrollment.email,
        subject: nextStep.subject,
        text: personalizedText,
        // Text-only by default (best cold-outreach deliverability). When this
        // sequence opts into open tracking, also send a minimal HTML body so
        // Resend can inject its open/click pixel: text alone carries none.
        ...(seq.track_opens ? { html: plainTextToTrackableHtml(personalizedText) } : {}),
        category: stepCategory(seq.id, nextStep.position),
        funnel: "sequence",
      });
      // On failure, stamp nothing: the enrollment retries next run.
      if (!ok) continue;

      const isLastStep = !steps.some((s) => s.position === nextStep.position + 1);
      const update: Record<string, unknown> = {
        last_step_sent: nextStep.position,
        last_step_sent_at: new Date().toISOString(),
      };
      if (isLastStep) update.completed_at = new Date().toISOString();
      await db.from("email_sequence_enrollments").update(update).eq("id", enrollment.id);
      summary.sequenceSent += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// (c2) Monitor sequence health: auto-pause on a bounce/complaint spike
// ---------------------------------------------------------------------------

/** Counts email_sends rows for a category prefix, optionally where a column is set. */
async function countSends(
  db: SupabaseClient,
  prefix: string,
  opts: { sentOnly?: boolean; column?: "bounced_at" | "complained_at" } = {},
): Promise<number | null> {
  let q = db
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .like("category", `${prefix}%`);
  if (opts.sentOnly) q = q.eq("status", "sent");
  if (opts.column) q = q.not(opts.column, "is", null);
  const { count, error } = await q;
  if (error) {
    reportError("sequence health count", error);
    return null;
  }
  return count ?? 0;
}

/**
 * For each active sequence, checks its delivered/bounced/complained numbers and
 * pauses the sequence (recording why + emailing the owner) if the bounce or
 * complaint rate crosses a safe threshold once there is a meaningful sample.
 * Protects the sending domain when a stale list is dripping. Depends on the
 * Resend webhook filling bounced_at/complained_at, which needs
 * RESEND_WEBHOOK_SECRET configured; with no bounce data it simply never fires.
 */
async function monitorSequenceHealth(db: SupabaseClient, summary: Summary): Promise<void> {
  const sequences = await activeSequences(db);
  if (!sequences || sequences.length === 0) return;

  for (const seq of sequences) {
    const prefix = `seq_${shortId(seq.id)}_`;
    const sent = await countSends(db, prefix, { sentOnly: true });
    if (sent === null || sent < MIN_HEALTH_SAMPLE) continue;

    const bounced = await countSends(db, prefix, { column: "bounced_at" });
    const complained = await countSends(db, prefix, { column: "complained_at" });
    if (bounced === null || complained === null) continue;

    const bounceRate = bounced / sent;
    const complaintRate = complained / sent;
    if (bounceRate <= MAX_BOUNCE_RATE && complaintRate <= MAX_COMPLAINT_RATE) continue;

    const reason =
      `Auto-paused: ${(bounceRate * 100).toFixed(1)}% bounces, ` +
      `${(complaintRate * 100).toFixed(2)}% complaints over ${sent} sends.`;

    const { error: pauseErr } = await db
      .from("email_sequences")
      .update({ status: "paused", auto_paused_at: new Date().toISOString(), pause_reason: reason })
      .eq("id", seq.id)
      .eq("status", "active"); // only flip if still active (avoid double-alert)
    if (pauseErr) {
      reportError("sequence auto-pause update", pauseErr);
      continue;
    }
    summary.sequencesAutoPaused += 1;

    const to = process.env.OWNER_ALERT_EMAIL ?? "elizabethdean30@gmail.com";
    await sendEmail({
      from: MARKETING_FROM,
      to,
      subject: "A sequence was auto-paused (deliverability)",
      text: [
        `Heads up: an email sequence was automatically paused to protect your sending domain.`,
        ``,
        reason,
        ``,
        `Sequence id: ${seq.id}`,
        ``,
        `Open Emails > Sequences to review the numbers. Fix the list (or verify it) before resuming.`,
      ].join("\n"),
      category: "sequence_auto_pause",
      funnel: "transactional",
    });
  }
}

// ---------------------------------------------------------------------------
// (d) Auto-enroll source-triggered sequences
// ---------------------------------------------------------------------------

async function autoEnrollFromSources(db: SupabaseClient, summary: Summary): Promise<void> {
  const sequences = await activeSequences(db);
  if (!sequences || sequences.length === 0) return;

  const since = new Date(Date.now() - AUTO_ENROLL_WINDOW_DAYS * DAY_MS).toISOString();

  for (const seq of sequences) {
    const trigger = (seq.trigger ?? null) as { kind?: string; source?: string } | null;
    if (trigger?.kind !== "source" || typeof trigger.source !== "string" || !trigger.source) {
      continue;
    }

    const { data, error } = await db
      .from("email_subscribers")
      .select("email")
      .eq("source", trigger.source)
      .gte("created_at", since)
      .is("unsubscribed_at", null)
      .limit(CANDIDATE_LIMIT);
    if (error) {
      reportError("source subscribers query", error);
      continue;
    }

    const emails: string[] = [];
    for (const row of data ?? []) {
      const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      if (email) emails.push(email);
    }
    if (emails.length === 0) continue;

    // The unique constraint (one row per sequence+email) makes re-scanning the
    // same window every run idempotent: only genuinely new addresses insert. No
    // reactivation here, so a cancelled/completed address is not re-dripped.
    summary.autoEnrolled += (await enrollEmails(db, seq.id, emails)).inserted;
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const summary: Summary = {
    ok: true,
    materialized: 0,
    campaignSent: 0,
    campaignSkipped: 0,
    campaignFailed: 0,
    sequenceSent: 0,
    sequenceStoppedSubscribed: 0,
    sequencesAutoPaused: 0,
    autoEnrolled: 0,
  };

  // Each step is isolated so one blow-up never blocks the others.
  try {
    await materializeCampaigns(db, summary);
  } catch (err) {
    console.error("cron email-marketing: materialize step threw", err);
  }
  try {
    await sendCampaignRecipients(db, summary);
  } catch (err) {
    console.error("cron email-marketing: campaign send step threw", err);
  }
  try {
    await monitorSequenceHealth(db, summary);
  } catch (err) {
    console.error("cron email-marketing: sequence health step threw", err);
  }
  try {
    await advanceSequences(db, summary);
  } catch (err) {
    console.error("cron email-marketing: sequence step threw", err);
  }
  try {
    await autoEnrollFromSources(db, summary);
  } catch (err) {
    console.error("cron email-marketing: auto-enroll step threw", err);
  }

  return NextResponse.json(summary);
}
