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
  nextSendTime,
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
// Max enrollment rows scanned across ALL sequences when tallying per-sequence
// counts and next-send times. Sized above the current total enrollment volume so
// large lists (e.g. a 26k re-engagement cohort) are not undercounted; sequences
// whose rows fall past this cap would otherwise report a too-low backlog.
const COUNT_CAP = 80000;
const MAX_STEPS = 20;
const MAX_DAY_OFFSET = 365;
// Ceiling on a single paste-enroll. enrollEmails batches inserts at 200/chunk,
// so it handles this volume; anything beyond is reported back as `capped` rather
// than silently dropped (the bug that hid a 2000 cap).
const MAX_EMAILS = 50000;
const MAX_SENDS_PER_HOUR = 5000;
// Batch size for the .in("category", ...) filter on the all-time sent scan, so a
// sequence set with many steps never builds an over-long PostgREST query string.
const CATEGORY_IN_CHUNK = 200;

type SequenceRow = {
  id: string;
  name: string;
  status: string;
  trigger: unknown;
  created_by: string;
  created_at: string;
  auto_pause_enabled?: boolean;
  health_alerted_at?: string | null;
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

// Loosely-typed enrollment row for the counts scan. converted_* are optional so
// the same type covers the pre-migration (BASE_COLS) select too.
type CountEnrollRow = {
  sequence_id: string;
  completed_at: string | null;
  cancelled_at: string | null;
  last_step_sent: number | null;
  enrolled_at: string;
  converted_at?: string | null;
  converted_step?: number | null;
};

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
 * (send_hour, track_opens, or auto_pause_enabled) is not there yet (migration
 * lags the deploy, per repo convention). Postgres undefined column is 42703;
 * PostgREST's stale schema cache reports PGRST204. Lets the caller retry the
 * write without those columns so sequence create/edit keeps working until
 * 20260831_sequence_send_hour.sql / 20260902_sequence_track_opens.sql /
 * 20260903_sequence_auto_pause_override.sql are applied.
 */
function isMissingOptionalColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return (
    /send_hour|track_opens|auto_pause_enabled|health_alerted_at/i.test(error.message ?? "") &&
    /column|schema cache/i.test(error.message ?? "")
  );
}

/** Validates an untrusted track_opens value: undefined = leave unchanged. */
function parseTrackOpens(input: unknown): boolean | undefined {
  if (input === undefined) return undefined;
  return Boolean(input);
}

/** Validates an untrusted auto_pause_enabled value: undefined = leave unchanged. */
function parseAutoPauseEnabled(input: unknown): boolean | undefined {
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

  // Export-all-emails mode: ?emailsFor=<sequenceId> returns every enrolled
  // address (all statuses), deduped, so the card's "Copy emails" button can drop
  // the whole list on the clipboard in one call instead of paging like the
  // per-step "Copy all". Pages through the enrollment table up to COUNT_CAP, then
  // drops any suppressed address (bounce, unsubscribe, complaint, or manual) so a
  // dead or opted-out inbox is never re-pasted into another campaign or an ad
  // audience. The suppression list is precisely the "do not email" set.
  const emailsFor = new URL(request.url).searchParams.get("emailsFor");
  if (emailsFor) {
    const seen = new Set<string>();
    const emails: string[] = [];
    for (let offset = 0; offset < COUNT_CAP; offset += COUNT_PAGE) {
      const { data: rows, error: rowsErr } = await db
        .from("email_sequence_enrollments")
        .select("email")
        .eq("sequence_id", emailsFor)
        .order("enrolled_at", { ascending: true })
        .range(offset, offset + COUNT_PAGE - 1)
        .returns<{ email: string | null }[]>();
      if (rowsErr) {
        if (isMissingTable(rowsErr)) {
          return NextResponse.json({ emails: [], migrationPending: true });
        }
        console.error("admin emails/sequences: emails export failed", rowsErr);
        return NextResponse.json({ error: "Export failed" }, { status: 500 });
      }
      const batch = rows ?? [];
      for (const r of batch) {
        const email = (r.email ?? "").trim();
        const key = email.toLowerCase();
        if (email && !seen.has(key)) {
          seen.add(key);
          emails.push(email);
        }
      }
      if (batch.length < COUNT_PAGE) break;
    }

    // Look up which of these addresses are suppressed and drop them. Chunk the
    // .in() filter (query string length) and match the enrolled list, not the
    // whole suppressions table. Fail open per chunk: a transient read error
    // should shrink the excluded set, never break the copy.
    const suppressed = new Set<string>();
    for (let i = 0; i < emails.length; i += CATEGORY_IN_CHUNK) {
      const chunk = emails.slice(i, i + CATEGORY_IN_CHUNK).map((e) => e.toLowerCase());
      const { data: sup, error: supErr } = await db
        .from("email_suppressions")
        .select("email")
        .in("email", chunk)
        .returns<{ email: string | null }[]>();
      if (supErr) {
        console.error("admin emails/sequences: suppression filter failed", supErr);
        continue;
      }
      for (const r of sup ?? []) {
        const e = (r.email ?? "").trim().toLowerCase();
        if (e) suppressed.add(e);
      }
    }
    const filtered =
      suppressed.size > 0 ? emails.filter((e) => !suppressed.has(e.toLowerCase())) : emails;
    return NextResponse.json({ emails: filtered });
  }

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
  // Soonest upcoming (or overdue) send across a sequence's open enrollments, as
  // a UTC epoch ms. Powers the "next send" readout on each card: computed with
  // the same nextSendTime() the cron uses, so the two never disagree.
  const nextSendById = new Map<string, number>();
  // send_hour per sequence, for the nextSendTime math (select("*") returns it).
  const sendHourById = new Map<string, number | null>();
  for (const s of sequences) {
    const hour = (s as unknown as { send_hour?: number | null }).send_hour;
    sendHourById.set(s.id, typeof hour === "number" ? hour : null);
  }
  // Conversions attributed last-touch to the step the enrollee last received
  // (converted_step) when they became a live subscriber. Keyed
  // sequence_id -> convertedStep -> count, plus a per-sequence total. Empty until
  // the 20260906 migration is applied and the cron records the first conversion.
  const convertedById = new Map<string, Map<number, number>>();
  const convertedTotalById = new Map<string, number>();
  // All-time emails sent per sequence, summed from email_sends across every
  // step's category. Unlike the windowed per-step readouts (which follow the
  // dashboard's 7/30/90-day selector via the summary endpoint), this is a
  // lifetime total. Populated by the scan below; 0 for sequences with no sends.
  const sentTotalById = new Map<string, number>();

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

    // converted_at / converted_step are added by the 20260906 migration. Select
    // them when present; if that errors as a missing column, drop to the base
    // columns for the rest of the scan so counts still work pre-migration.
    // Typed as string (not a literal) so the PostgREST type parser does not try
    // to resolve the dynamic select and returns loosely-typed rows.
    const BASE_COLS: string = "sequence_id, completed_at, cancelled_at, last_step_sent, enrolled_at";
    const CONV_COLS: string = `${BASE_COLS}, converted_at, converted_step`;
    const isMissingConvCol = (e: { code?: string; message?: string } | null): boolean => {
      if (!e) return false;
      if (e.code === "42703" || e.code === "PGRST204") return true;
      const msg = e.message ?? "";
      return /converted_at|converted_step/i.test(msg) && /column|schema cache/i.test(msg);
    };
    let convColsMissing = false;

    for (let offset = 0; offset < COUNT_CAP; offset += COUNT_PAGE) {
      let { data: enrollRows, error: enrollErr } = await db
        .from("email_sequence_enrollments")
        .select(convColsMissing ? BASE_COLS : CONV_COLS)
        .in("sequence_id", ids)
        .range(offset, offset + COUNT_PAGE - 1)
        .returns<CountEnrollRow[]>();
      if (enrollErr && !convColsMissing && isMissingConvCol(enrollErr)) {
        convColsMissing = true;
        ({ data: enrollRows, error: enrollErr } = await db
          .from("email_sequence_enrollments")
          .select(BASE_COLS)
          .in("sequence_id", ids)
          .range(offset, offset + COUNT_PAGE - 1)
          .returns<CountEnrollRow[]>());
      }
      if (enrollErr) break;
      for (const row of enrollRows ?? []) {
        if (typeof row.sequence_id !== "string") continue;
        const counts = countsById.get(row.sequence_id) ?? { active: 0, completed: 0, cancelled: 0 };
        // A converted enrollment is also cancelled; tally it before the shared
        // cancelled/completed/open branching (last-touch to converted_step).
        if (row.converted_at) {
          const step = typeof row.converted_step === "number" ? row.converted_step : 0;
          const perSeq = convertedById.get(row.sequence_id) ?? new Map<number, number>();
          perSeq.set(step, (perSeq.get(step) ?? 0) + 1);
          convertedById.set(row.sequence_id, perSeq);
          convertedTotalById.set(
            row.sequence_id,
            (convertedTotalById.get(row.sequence_id) ?? 0) + 1,
          );
        }
        if (row.cancelled_at) counts.cancelled += 1;
        else if (row.completed_at) counts.completed += 1;
        else {
          counts.active += 1;
          // Open enrollment: park it against the next step it will receive.
          const lastStep = typeof row.last_step_sent === "number" ? row.last_step_sent : 0;
          const perSeq = queuedById.get(row.sequence_id) ?? new Map<number, number>();
          perSeq.set(lastStep, (perSeq.get(lastStep) ?? 0) + 1);
          queuedById.set(row.sequence_id, perSeq);

          // Track the soonest due time for this open enrollment's next step.
          const nextStep = (stepsById.get(row.sequence_id) ?? []).find(
            (st) => st.position === lastStep + 1,
          );
          if (nextStep && typeof row.enrolled_at === "string") {
            const due = nextSendTime(
              row.enrolled_at,
              nextStep.day_offset,
              sendHourById.get(row.sequence_id) ?? null,
            );
            if (Number.isFinite(due)) {
              const cur = nextSendById.get(row.sequence_id);
              if (cur === undefined || due < cur) nextSendById.set(row.sequence_id, due);
            }
          }
        }
        countsById.set(row.sequence_id, counts);
      }
      if ((enrollRows ?? []).length < COUNT_PAGE) break;
    }

    // All-time sent per sequence, from email_sends keyed by each step's category
    // (seq_<shortId>_s<position>). Scan only these sequences' step categories and
    // only genuine sends (status not suppressed/failed), so this touches far
    // fewer rows than the full table. Best-effort: any failure leaves totals at 0
    // and the rest of the response still renders.
    const categoryToSeq = new Map<string, string>();
    for (const [seqId, steps] of stepsById) {
      for (const step of steps) categoryToSeq.set(stepCategory(seqId, step.position), seqId);
    }
    const categories = [...categoryToSeq.keys()];
    try {
      for (let i = 0; i < categories.length; i += CATEGORY_IN_CHUNK) {
        const chunk = categories.slice(i, i + CATEGORY_IN_CHUNK);
        for (let offset = 0; ; offset += COUNT_PAGE) {
          const { data: sendRows, error: sendErr } = await db
            .from("email_sends")
            .select("category")
            .in("category", chunk)
            .not("status", "in", "(suppressed,failed)")
            .range(offset, offset + COUNT_PAGE - 1)
            .returns<{ category: string }[]>();
          if (sendErr) {
            console.error("admin emails/sequences: sent scan failed", sendErr);
            break;
          }
          for (const row of sendRows ?? []) {
            const seqId = categoryToSeq.get(row.category);
            if (seqId) sentTotalById.set(seqId, (sentTotalById.get(seqId) ?? 0) + 1);
          }
          if ((sendRows ?? []).length < COUNT_PAGE) break;
        }
      }
    } catch (err) {
      console.error("admin emails/sequences: sent scan threw", err);
    }
  }

  return NextResponse.json({
    sequences: sequences.map((row) => {
      const queuedByLastStep = queuedById.get(row.id);
      const nextMs = nextSendById.get(row.id);
      const convertedByStep = convertedById.get(row.id);
      return {
        ...row,
        steps: (stepsById.get(row.id) ?? []).map((step) => ({
          ...step,
          category: stepCategory(row.id, step.position),
          // People whose next step is this one (last_step_sent = position - 1).
          queued: queuedByLastStep?.get(step.position - 1) ?? 0,
          // Conversions attributed last-touch to this step (they became a live
          // subscriber after receiving it, i.e. converted_step = position).
          converted: convertedByStep?.get(step.position) ?? 0,
        })),
        enrollmentCounts: countsById.get(row.id) ?? { active: 0, completed: 0, cancelled: 0 },
        // Total conversions across this sequence (all steps + pre-first-step).
        convertedTotal: convertedTotalById.get(row.id) ?? 0,
        // All-time emails sent across this sequence (summed over its steps).
        sentTotal: sentTotalById.get(row.id) ?? 0,
        // Soonest next send across open enrollments (null when none are pending).
        next_send_at:
          typeof nextMs === "number" && Number.isFinite(nextMs)
            ? new Date(nextMs).toISOString()
            : null,
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
    autoPauseEnabled?: unknown;
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
  const autoPauseEnabled = parseAutoPauseEnabled(body.autoPauseEnabled);

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
  // Omitted = column default (true, auto-pause on); only set when explicitly given.
  if (autoPauseEnabled !== undefined) insertRow.auto_pause_enabled = autoPauseEnabled;

  let { data, error } = await db.from("email_sequences").insert(insertRow).select("id").single();
  if (
    error &&
    ("send_hour" in insertRow || "track_opens" in insertRow || "auto_pause_enabled" in insertRow) &&
    isMissingOptionalColumn(error)
  ) {
    // Optional column not applied yet: retry without them so create still works.
    delete insertRow.send_hour;
    delete insertRow.track_opens;
    delete insertRow.auto_pause_enabled;
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
    enabled?: unknown;
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

  if (action === "auto-pause") {
    // Quick per-sequence override toggle (card control). enabled=false exempts the
    // sequence from the deliverability auto-pause: the monitor alerts but never
    // pauses it. enabled=true restores the default protective behavior.
    const enabled = parseAutoPauseEnabled(body.enabled);
    if (enabled === undefined) {
      return NextResponse.json({ error: "enabled is required" }, { status: 400 });
    }
    const { error } = await db
      .from("email_sequences")
      .update({ auto_pause_enabled: enabled })
      .eq("id", id);
    if (error) {
      if (isMissingOptionalColumn(error)) {
        return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
      }
      console.error("admin emails/sequences: auto-pause toggle failed", error);
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
