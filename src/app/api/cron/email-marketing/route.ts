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
import { parseAudience, resolveAudience } from "@/lib/email-audience";
import {
  MARKETING_FROM,
  campaignCategory,
  stepCategory,
  enrollEmails,
} from "@/lib/email-marketing";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { logSuppressedSkip } from "@/lib/email-send";
import { isEmailSuppressed } from "@/lib/email-unsubscribe";
import { isMissingTable } from "@/lib/growth-goals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPAIGN_PER_RUN = 100;
const SEQUENCE_PER_RUN = 40;
const MAX_ATTEMPTS = 3;
const CANDIDATE_LIMIT = 500;
const CHUNK = 200;
const AUTO_ENROLL_WINDOW_DAYS = 7;
const MATERIALIZE_PER_RUN = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

type DbError = { message?: string; code?: string } | null;

type Summary = {
  ok: true;
  materialized: number;
  campaignSent: number;
  campaignSkipped: number;
  campaignFailed: number;
  sequenceSent: number;
  autoEnrolled: number;
};

type SequenceRow = { id: string; trigger: unknown };

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
  const { data, error } = await db.from("email_sequences").select("id, trigger").eq("status", "active");
  if (error) {
    reportError("active sequences query", error);
    return null;
  }
  return (data ?? []) as SequenceRow[];
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

async function sendCampaignRecipients(db: SupabaseClient, summary: Summary): Promise<void> {
  const { data, error } = await db
    .from("email_campaigns")
    .select("id, subject, body")
    .eq("status", "sending")
    .not("materialized_at", "is", null)
    .order("created_at", { ascending: true });
  if (error) {
    reportError("sending campaigns query", error);
    return;
  }

  // One shared budget across every sending campaign, oldest first.
  let budget = CAMPAIGN_PER_RUN;

  for (const campaign of (data ?? []) as { id: string; subject: string; body: string }[]) {
    if (budget <= 0) break;

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
        text: campaign.body,
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

  let budget = SEQUENCE_PER_RUN;

  for (const seq of sequences) {
    if (budget <= 0) break;
    const steps = stepsBySequence.get(seq.id) ?? [];

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
      if (budget <= 0) break;

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

      const dueAt = new Date(enrollment.enrolled_at).getTime() + nextStep.day_offset * DAY_MS;
      if (!Number.isFinite(dueAt) || dueAt > Date.now()) continue;

      budget -= 1;
      const ok = await sendMarketingEmail({
        from: MARKETING_FROM,
        to: enrollment.email,
        subject: nextStep.subject,
        text: nextStep.body,
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

    // The unique constraint + ignoreDuplicates makes re-scanning the same
    // window every run idempotent.
    summary.autoEnrolled += await enrollEmails(db, seq.id, emails);
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
