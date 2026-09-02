/**
 * Admin sequences API for the email marketing engine (custom drip funnels).
 *
 * GET   /api/admin/emails/sequences
 *   Latest sequences with their steps (plus per-step email_sends category
 *   keys) and enrollment counts.
 * POST  { name, trigger?, steps, sendsPerHour? }  create (paused by default)
 * PATCH { id, action, ... } where action is one of:
 *   "update"   { name?, trigger?, steps?, sendsPerHour? }  edit; steps replace all
 *   "pause" / "activate"                    flip status (activate clears auto-pause)
 *   "stop"                                  pause AND cancel all open enrollments
 *   "enroll"   { emails? } or { tag? }      bulk-enroll addresses
 *   "unenroll" { emails }                   cancel open enrollments
 *
 * sendsPerHour caps this sequence's drip rate (throttle/warmup); null uses the
 * cron default. auto_paused_at / pause_reason are set by the cron's health
 * monitor when it pauses a sequence on a bounce/complaint spike.
 *
 * Depends on the 20260817_email_marketing migration; responses degrade with
 * migrationPending until it is applied.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_RE, normalizeTag, parseEmailList, resolveAudience } from "@/lib/email-audience";
import {
  enrollEmails,
  stepCategory,
  tagRecipientsAsContacts,
  sequenceContactTag,
  sequencePlatformTags,
  DEFAULT_SENDS_PER_HOUR,
  MARKETING_FROM,
  plainTextToTrackableHtml,
} from "@/lib/email-marketing";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { personalizeReviewBody } from "@/lib/extension-review";
import { personalizePathBody } from "@/lib/email-path-select";
import { personalizeBundleSubmitBody } from "@/lib/grow-together-submit";
import { isMissingTable } from "@/lib/growth-goals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_LIMIT = 100;
const COUNT_PAGE = 1000;
const COUNT_CAP = 20000;
const MAX_STEPS = 20;
const MAX_DAY_OFFSET = 365;
// Ceiling on a single paste-enroll. enrollEmails batches inserts at 200/chunk,
// so it handles this volume; anything beyond is reported back as `capped` rather
// than silently dropped (the bug that hid a 2000 cap).
const MAX_EMAILS = 50000;
const MAX_SENDS_PER_HOUR = 5000;

type SequenceRow = {
  id: string;
  name: string;
  status: string;
  trigger: unknown;
  created_by: string;
  created_at: string;
};

type StepRow = {
  id: string;
  sequence_id: string;
  position: number;
  day_offset: number;
  subject: string;
  body: string;
};

type EnrollmentCounts = { active: number; completed: number; cancelled: number };

type Trigger = { kind: "tag_added"; tag: string } | { kind: "source"; source: string } | null;

type StepInput = { day_offset: number; subject: string; body: string };

function getDb(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

/** Validates an untrusted trigger payload. Undefined = invalid. */
function parseTrigger(input: unknown): Trigger | undefined {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  if (raw.kind === "tag_added") {
    if (typeof raw.tag !== "string") return undefined;
    const tag = normalizeTag(raw.tag);
    return tag ? { kind: "tag_added", tag } : undefined;
  }
  if (raw.kind === "source") {
    if (typeof raw.source !== "string") return undefined;
    const source = raw.source.trim().slice(0, 60);
    return source.length > 0 ? { kind: "source", source } : undefined;
  }
  return undefined;
}

/**
 * Validates an untrusted sends_per_hour value.
 * Returns undefined for "not provided / leave unchanged", null to clear it
 * (use the default rate), a positive int to set it, or the string "invalid".
 */
function parseSendsPerHour(input: unknown): number | null | undefined | "invalid" {
  if (input === undefined) return undefined;
  if (input === null || input === "") return null;
  const n = Number(input);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SENDS_PER_HOUR) return "invalid";
  return n;
}

/**
 * Validates an untrusted send_hour value.
 * Returns undefined for "not provided / leave unchanged", null to clear it
 * (send at each person's enrollment minute), an int 0-23 to pin the hour, or
 * the string "invalid".
 */
function parseSendHour(input: unknown): number | null | undefined | "invalid" {
  if (input === undefined) return undefined;
  if (input === null || input === "") return null;
  const n = Number(input);
  if (!Number.isInteger(n) || n < 0 || n > 23) return "invalid";
  return n;
}

/**
 * True when the write failed only because an optional, migration-added column
 * (send_hour or track_opens) is not there yet (migration lags the deploy, per
 * repo convention). Postgres undefined column is 42703; PostgREST's stale schema
 * cache reports PGRST204. Lets the caller retry the write without those columns
 * so sequence create/edit keeps working until 20260831_sequence_send_hour.sql /
 * 20260902_sequence_track_opens.sql are applied.
 */
function isMissingOptionalColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return (
    /send_hour|track_opens/i.test(error.message ?? "") &&
    /column|schema cache/i.test(error.message ?? "")
  );
}

/** Validates an untrusted track_opens value: undefined = leave unchanged. */
function parseTrackOpens(input: unknown): boolean | undefined {
  if (input === undefined) return undefined;
  return Boolean(input);
}

/** Validates an untrusted steps array. Null = invalid. */
function parseSteps(input: unknown): StepInput[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_STEPS) return null;
  const steps: StepInput[] = [];
  let lastOffset = 0;
  for (const entry of input) {
    if (!entry || typeof entry !== "object") return null;
    const raw = entry as Record<string, unknown>;
    const dayOffset = raw.dayOffset;
    if (typeof dayOffset !== "number" || !Number.isInteger(dayOffset)) return null;
    if (dayOffset < 0 || dayOffset > MAX_DAY_OFFSET) return null;
    // Offsets count from enrollment, so a later step can never be earlier.
    if (dayOffset < lastOffset) return null;
    lastOffset = dayOffset;
    steps.push({
      day_offset: dayOffset,
      subject: typeof raw.subject === "string" ? raw.subject.trim().slice(0, 200) : "",
      body: typeof raw.body === "string" ? raw.body.slice(0, 10000) : "",
    });
  }
  return steps;
}

/** Validates an untrusted emails array: lowercased, deduped, capped. */
function cleanEmailArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const email = entry.trim().toLowerCase();
    if (email && seen.size < MAX_EMAILS) seen.add(email);
  }
  return [...seen];
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data, error } = await db
    .from("email_sequences")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) {
    console.error("admin emails/sequences: query failed", error);
    return NextResponse.json({ sequences: [], migrationPending: true });
  }

  const sequences = (data ?? []) as SequenceRow[];
  const stepsById = new Map<string, StepRow[]>();
  const countsById = new Map<string, EnrollmentCounts>();
  // Per sequence, how many open enrollments are parked at each last_step_sent
  // value. A step at position p is "queued to send" for everyone whose next step
  // is it, i.e. last_step_sent = p - 1 (the same rule the step drawer uses for
  // its Scheduled list). Keyed sequence_id -> lastStepSent -> count.
  const queuedById = new Map<string, Map<number, number>>();

  if (sequences.length > 0) {
    const ids = sequences.map((s) => s.id);

    const { data: stepData, error: stepErr } = await db
      .from("email_sequence_steps")
      .select("id, sequence_id, position, day_offset, subject, body")
      .in("sequence_id", ids)
      .order("position", { ascending: true });
    if (stepErr) {
      console.error("admin emails/sequences: steps query failed", stepErr);
    }
    for (const step of (stepData ?? []) as StepRow[]) {
      const list = stepsById.get(step.sequence_id) ?? [];
      list.push(step);
      stepsById.set(step.sequence_id, list);
    }

    for (let offset = 0; offset < COUNT_CAP; offset += COUNT_PAGE) {
      const { data: enrollRows, error: enrollErr } = await db
        .from("email_sequence_enrollments")
        .select("sequence_id, completed_at, cancelled_at, last_step_sent")
        .in("sequence_id", ids)
        .range(offset, offset + COUNT_PAGE - 1);
      if (enrollErr) break;
      for (const row of enrollRows ?? []) {
        if (typeof row.sequence_id !== "string") continue;
        const counts = countsById.get(row.sequence_id) ?? { active: 0, completed: 0, cancelled: 0 };
        if (row.cancelled_at) counts.cancelled += 1;
        else if (row.completed_at) counts.completed += 1;
        else {
          counts.active += 1;
          // Open enrollment: park it against the next step it will receive.
          const lastStep = typeof row.last_step_sent === "number" ? row.last_step_sent : 0;
          const perSeq = queuedById.get(row.sequence_id) ?? new Map<number, number>();
          perSeq.set(lastStep, (perSeq.get(lastStep) ?? 0) + 1);
          queuedById.set(row.sequence_id, perSeq);
        }
        countsById.set(row.sequence_id, counts);
      }
      if ((enrollRows ?? []).length < COUNT_PAGE) break;
    }
  }

  return NextResponse.json({
    sequences: sequences.map((row) => {
      const queuedByLastStep = queuedById.get(row.id);
      return {
        ...row,
        steps: (stepsById.get(row.id) ?? []).map((step) => ({
          ...step,
          category: stepCategory(row.id, step.position),
          // People whose next step is this one (last_step_sent = position - 1).
          queued: queuedByLastStep?.get(step.position - 1) ?? 0,
        })),
        enrollmentCounts: countsById.get(row.id) ?? { active: 0, completed: 0, cancelled: 0 },
      };
    }),
    migrationPending: false,
  });
}

export async function POST(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: {
    name?: unknown;
    trigger?: unknown;
    steps?: unknown;
    sendsPerHour?: unknown;
    sendHour?: unknown;
    trackOpens?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  if (name.length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const trigger = parseTrigger(body.trigger);
  if (trigger === undefined) {
    return NextResponse.json({ error: "Invalid trigger" }, { status: 400 });
  }
  const steps = parseSteps(body.steps);
  if (!steps) {
    return NextResponse.json({ error: "Invalid steps" }, { status: 400 });
  }
  const sendsPerHour = parseSendsPerHour(body.sendsPerHour);
  if (sendsPerHour === "invalid") {
    return NextResponse.json({ error: "Invalid sends per hour" }, { status: 400 });
  }
  const sendHour = parseSendHour(body.sendHour);
  if (sendHour === "invalid") {
    return NextResponse.json({ error: "Invalid send hour" }, { status: 400 });
  }
  const trackOpens = parseTrackOpens(body.trackOpens);

  const insertRow: Record<string, unknown> = {
    name,
    trigger,
    status: "paused",
    created_by: actor.email,
  };
  // Default new sequences to the conservative safe rate (visible + editable in
  // the UI) so they are drip-protected by default; only an explicit positive
  // value overrides it.
  insertRow.sends_per_hour = typeof sendsPerHour === "number" ? sendsPerHour : DEFAULT_SENDS_PER_HOUR;
  if (sendHour !== undefined) insertRow.send_hour = sendHour;
  if (trackOpens !== undefined) insertRow.track_opens = trackOpens;

  let { data, error } = await db.from("email_sequences").insert(insertRow).select("id").single();
  if (error && ("send_hour" in insertRow || "track_opens" in insertRow) && isMissingOptionalColumn(error)) {
    // Optional column not applied yet: retry without them so create still works.
    delete insertRow.send_hour;
    delete insertRow.track_opens;
    ({ data, error } = await db.from("email_sequences").insert(insertRow).select("id").single());
  }
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
    }
    console.error("admin emails/sequences: insert failed", error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  const stepRows = steps.map((step, i) => ({ ...step, sequence_id: data.id, position: i + 1 }));
  const { error: stepErr } = await db.from("email_sequence_steps").insert(stepRows);
  if (stepErr) {
    console.error("admin emails/sequences: steps insert failed", stepErr);
    // Best-effort rollback so a half-created sequence doesn't linger.
    await db.from("email_sequences").delete().eq("id", data.id);
    return NextResponse.json({ error: "Failed to save steps" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}

type TestStep = { position: number; subject: string; body: string };

/**
 * Sends one sequence step immediately to a test address, mirroring the cron's
 * per-step build exactly (see src/app/api/cron/email-marketing/route.ts) so the
 * preview lands byte-for-byte like a real drip: same {{...}} placeholder
 * substitution, same text-only-vs-tracked-HTML choice. Unlike the cron this
 * never touches the rate-limit budget (logged under the 'sequence_test'
 * category, which sentInLastHour excludes) and always delivers
 * (bypassSuppression), so a staff member can preview a funnel in their own inbox
 * regardless of subscription or suppression status.
 */
async function sendSequenceStepTest(
  step: TestStep,
  toEmail: string,
  trackOpens: boolean,
): Promise<boolean> {
  const personalizedText = personalizeBundleSubmitBody(
    personalizePathBody(personalizeReviewBody(step.body, toEmail), toEmail),
    toEmail,
  );
  return sendMarketingEmail({
    from: MARKETING_FROM,
    to: toEmail,
    subject: step.subject,
    text: personalizedText,
    ...(trackOpens ? { html: plainTextToTrackableHtml(personalizedText) } : {}),
    category: "sequence_test",
    funnel: "sequence",
    bypassSuppression: true,
  });
}

export async function PATCH(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: {
    id?: unknown;
    action?: unknown;
    name?: unknown;
    trigger?: unknown;
    steps?: unknown;
    sendsPerHour?: unknown;
    sendHour?: unknown;
    trackOpens?: unknown;
    emails?: unknown;
    tag?: unknown;
    position?: unknown;
    toEmail?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  const action = typeof body.action === "string" ? body.action : null;
  if (!id || !action) {
    return NextResponse.json({ error: "id and action are required" }, { status: 400 });
  }

  const { data: found, error: findErr } = await db
    .from("email_sequences")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (findErr) {
    if (isMissingTable(findErr)) {
      return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
    }
    console.error("admin emails/sequences: lookup failed", findErr);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!found) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });

  if (action === "update") {
    const values: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const name = body.name.trim().slice(0, 200);
      if (name.length === 0) return NextResponse.json({ error: "name is required" }, { status: 400 });
      values.name = name;
    }
    if (body.trigger !== undefined) {
      const trigger = parseTrigger(body.trigger);
      if (trigger === undefined) {
        return NextResponse.json({ error: "Invalid trigger" }, { status: 400 });
      }
      values.trigger = trigger;
    }
    if (body.sendsPerHour !== undefined) {
      const sendsPerHour = parseSendsPerHour(body.sendsPerHour);
      if (sendsPerHour === "invalid") {
        return NextResponse.json({ error: "Invalid sends per hour" }, { status: 400 });
      }
      values.sends_per_hour = sendsPerHour;
    }
    if (body.sendHour !== undefined) {
      const sendHour = parseSendHour(body.sendHour);
      if (sendHour === "invalid") {
        return NextResponse.json({ error: "Invalid send hour" }, { status: 400 });
      }
      values.send_hour = sendHour;
    }
    if (body.trackOpens !== undefined) {
      values.track_opens = parseTrackOpens(body.trackOpens);
    }
    let steps: StepInput[] | null = null;
    if (body.steps !== undefined) {
      steps = parseSteps(body.steps);
      if (!steps) return NextResponse.json({ error: "Invalid steps" }, { status: 400 });
    }
    if (Object.keys(values).length === 0 && !steps) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    if (Object.keys(values).length > 0) {
      let { error } = await db.from("email_sequences").update(values).eq("id", id);
      if (
        error &&
        ("send_hour" in values || "track_opens" in values) &&
        isMissingOptionalColumn(error)
      ) {
        // Optional column not applied yet: retry without them so the rest saves.
        delete values.send_hour;
        delete values.track_opens;
        if (Object.keys(values).length > 0) {
          ({ error } = await db.from("email_sequences").update(values).eq("id", id));
        } else {
          error = null;
        }
      }
      if (error) {
        console.error("admin emails/sequences: update failed", error);
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
      }
    }

    if (steps) {
      // Replace all steps. In-flight enrollments keep their last_step_sent
      // pointer: editing step content mid-flight is safe, and removing steps
      // completes those people early - accepted v1 semantics.
      const { error: deleteErr } = await db
        .from("email_sequence_steps")
        .delete()
        .eq("sequence_id", id);
      if (deleteErr) {
        console.error("admin emails/sequences: steps delete failed", deleteErr);
        return NextResponse.json({ error: "Failed to save steps" }, { status: 500 });
      }
      const stepRows = steps.map((step, i) => ({ ...step, sequence_id: id, position: i + 1 }));
      const { error: insertErr } = await db.from("email_sequence_steps").insert(stepRows);
      if (insertErr) {
        console.error("admin emails/sequences: steps insert failed", insertErr);
        return NextResponse.json({ error: "Failed to save steps" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "pause" || action === "activate") {
    const values: Record<string, unknown> =
      action === "pause"
        ? { status: "paused" }
        : // Activating (or resuming) clears any prior auto-pause record so the
          // banner and reason disappear and monitoring starts fresh.
          { status: "active", auto_paused_at: null, pause_reason: null };
    const { error } = await db.from("email_sequences").update(values).eq("id", id);
    if (error) {
      console.error("admin emails/sequences: status update failed", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "stop") {
    // Hard stop: pause the sequence AND cancel every open enrollment so no one
    // mid-drip receives another step. Use this to abort a send in progress.
    const { error: statusErr } = await db
      .from("email_sequences")
      .update({ status: "paused" })
      .eq("id", id);
    if (statusErr) {
      console.error("admin emails/sequences: stop status update failed", statusErr);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    const { error: cancelErr, count } = await db
      .from("email_sequence_enrollments")
      .update({ cancelled_at: new Date().toISOString() }, { count: "exact" })
      .eq("sequence_id", id)
      .is("cancelled_at", null)
      .is("completed_at", null);
    if (cancelErr) {
      console.error("admin emails/sequences: stop cancel-all failed", cancelErr);
      return NextResponse.json({ error: "Could not cancel pending enrollments" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, cancelled: count ?? 0 });
  }

  if (action === "enroll") {
    let list: string[] = [];
    // How many valid, unique addresses were dropped for exceeding MAX_EMAILS.
    // Reported back so the admin sees "N over the limit not enrolled" instead
    // of the list being silently truncated (the bug that hid a 2000 cap).
    let capped = 0;
    if (Array.isArray(body.emails)) {
      const uniqueAll = new Set<string>();
      for (const entry of body.emails) {
        if (typeof entry !== "string") continue;
        const email = entry.trim().toLowerCase();
        if (email) uniqueAll.add(email);
      }
      list = [...uniqueAll].slice(0, MAX_EMAILS);
      capped = uniqueAll.size - list.length;
    } else if (typeof body.emails === "string" && body.emails.trim().length > 0) {
      const parsed = parseEmailList(body.emails, Number.MAX_SAFE_INTEGER);
      list = parsed.emails.slice(0, MAX_EMAILS);
      capped = parsed.emails.length - list.length;
    } else if (typeof body.tag === "string") {
      const tag = normalizeTag(body.tag);
      if (!tag) return NextResponse.json({ error: "A valid tag is required" }, { status: 400 });
      const resolved = await resolveAudience(db, { kind: "tag", tag });
      if (resolved.migrationPending) {
        return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
      }
      list = resolved.emails;
    } else {
      return NextResponse.json({ error: "emails or tag is required" }, { status: 400 });
    }
    // Manual Enroll reactivates: re-adding a cancelled/completed address restarts
    // it at Step 1 (an already-active address is left alone, no double-send).
    const result = await enrollEmails(db, id, list, { reactivate: true });
    // Mirror enrollees into the contacts list so pasted addresses show up on the
    // Contacts tab (not just as an enrollment count), tagged by which sequence
    // enrolled them so you can tell them apart and filter. Idempotent; unions
    // the tag onto existing contacts without replacing their other tags.
    const seqTag = typeof found.name === "string" ? sequenceContactTag(found.name) : "seq-drip";
    await tagRecipientsAsContacts(db, list, seqTag, "sequence-enroll");
    // Also union a platform tag (instagram/tiktok) implied by the sequence name,
    // so contacts can be segmented by platform across every IG/TikTok sequence,
    // not just per-sequence. No-op for sequences whose name names no platform.
    if (typeof found.name === "string") {
      for (const platformTag of sequencePlatformTags(found.name)) {
        await tagRecipientsAsContacts(db, list, platformTag, "sequence-enroll");
      }
    }
    return NextResponse.json({ ok: true, ...result, ...(capped > 0 ? { capped } : {}) });
  }

  if (action === "unenroll") {
    const emails = cleanEmailArray(body.emails);
    if (emails.length === 0) {
      return NextResponse.json({ error: "emails is required" }, { status: 400 });
    }
    const { error } = await db
      .from("email_sequence_enrollments")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("sequence_id", id)
      .in("email", emails)
      .is("cancelled_at", null);
    if (error) {
      console.error("admin emails/sequences: unenroll failed", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "test" || action === "test-all") {
    const toEmail =
      typeof body.toEmail === "string" ? body.toEmail.trim().toLowerCase() : "";
    if (!toEmail || !EMAIL_RE.test(toEmail)) {
      return NextResponse.json({ error: "A valid toEmail is required" }, { status: 400 });
    }
    const trackOpens = Boolean((found as { track_opens?: unknown }).track_opens);

    if (action === "test") {
      const position =
        typeof body.position === "number" ? body.position : Number(body.position);
      if (!Number.isInteger(position) || position < 1) {
        return NextResponse.json({ error: "A valid position is required" }, { status: 400 });
      }
      const { data: step, error: stepErr } = await db
        .from("email_sequence_steps")
        .select("position, subject, body")
        .eq("sequence_id", id)
        .eq("position", position)
        .maybeSingle();
      if (stepErr) {
        console.error("admin emails/sequences: test step lookup failed", stepErr);
        return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
      }
      if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });
      const ok = await sendSequenceStepTest(step as TestStep, toEmail, trackOpens);
      return NextResponse.json({ ok });
    }

    // action === "test-all": send every step now, back-to-back, so the whole
    // funnel lands in the test inbox at once (a real recipient gets them spread
    // over days).
    const { data: stepData, error: stepErr } = await db
      .from("email_sequence_steps")
      .select("position, subject, body")
      .eq("sequence_id", id)
      .order("position", { ascending: true });
    if (stepErr) {
      console.error("admin emails/sequences: test-all steps lookup failed", stepErr);
      return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
    }
    const steps = (stepData ?? []) as TestStep[];
    if (steps.length === 0) {
      return NextResponse.json({ error: "This sequence has no steps" }, { status: 400 });
    }
    let sent = 0;
    for (const step of steps) {
      const ok = await sendSequenceStepTest(step, toEmail, trackOpens);
      if (ok) sent += 1;
    }
    return NextResponse.json({ ok: sent === steps.length, sent, total: steps.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
