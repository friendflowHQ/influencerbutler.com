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
import { normalizeTag, parseEmailList, resolveAudience } from "@/lib/email-audience";
import { enrollEmails, stepCategory } from "@/lib/email-marketing";
import { isMissingTable } from "@/lib/growth-goals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_LIMIT = 100;
const COUNT_PAGE = 1000;
const COUNT_CAP = 20000;
const MAX_STEPS = 20;
const MAX_DAY_OFFSET = 365;
const MAX_EMAILS = 2000;
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
        .select("sequence_id, completed_at, cancelled_at")
        .in("sequence_id", ids)
        .range(offset, offset + COUNT_PAGE - 1);
      if (enrollErr) break;
      for (const row of enrollRows ?? []) {
        if (typeof row.sequence_id !== "string") continue;
        const counts = countsById.get(row.sequence_id) ?? { active: 0, completed: 0, cancelled: 0 };
        if (row.cancelled_at) counts.cancelled += 1;
        else if (row.completed_at) counts.completed += 1;
        else counts.active += 1;
        countsById.set(row.sequence_id, counts);
      }
      if ((enrollRows ?? []).length < COUNT_PAGE) break;
    }
  }

  return NextResponse.json({
    sequences: sequences.map((row) => ({
      ...row,
      steps: (stepsById.get(row.id) ?? []).map((step) => ({
        ...step,
        category: stepCategory(row.id, step.position),
      })),
      enrollmentCounts: countsById.get(row.id) ?? { active: 0, completed: 0, cancelled: 0 },
    })),
    migrationPending: false,
  });
}

export async function POST(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: { name?: unknown; trigger?: unknown; steps?: unknown; sendsPerHour?: unknown };
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

  const insertRow: Record<string, unknown> = {
    name,
    trigger,
    status: "paused",
    created_by: actor.email,
  };
  if (sendsPerHour !== undefined) insertRow.sends_per_hour = sendsPerHour;

  const { data, error } = await db
    .from("email_sequences")
    .insert(insertRow)
    .select("id")
    .single();
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
    }
    console.error("admin emails/sequences: insert failed", error);
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
    emails?: unknown;
    tag?: unknown;
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
    let steps: StepInput[] | null = null;
    if (body.steps !== undefined) {
      steps = parseSteps(body.steps);
      if (!steps) return NextResponse.json({ error: "Invalid steps" }, { status: 400 });
    }
    if (Object.keys(values).length === 0 && !steps) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    if (Object.keys(values).length > 0) {
      const { error } = await db.from("email_sequences").update(values).eq("id", id);
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
    if (typeof body.emails === "string" && body.emails.trim().length > 0) {
      list = parseEmailList(body.emails, MAX_EMAILS).emails;
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
    const enrolled = await enrollEmails(db, id, list);
    return NextResponse.json({ ok: true, enrolled });
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

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
