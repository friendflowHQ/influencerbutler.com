/**
 * Admin API for built-in funnel A/B tests (Funnels v2, email_experiments).
 *
 * GET   (reports.view)   experiments with live per-arm stats. Optional ?funnel=.
 *                        { experiments: ExperimentSummary[], migrationPending }
 * POST  (marketing.send) create a draft test on one funnel step (+ optional
 *                        segment) with arm 'a' = control and arm 'b' = challenger.
 * PATCH (marketing.send) { id, action: "start" | "stop" | "update-arm" }.
 *
 * Arm copy rules: no em dash, no literal dates or "Nov 29", no
 * {{priceLockLine}} (the price lock is never A/B tested). Arms are immutable
 * once a test leaves draft. The daily evaluation (cron email-marketing) takes
 * the weekly looks and promotes or stops tests.
 *
 * The tables come from 20261110_funnels_v2_measure.sql; without it GET returns
 * an empty list with migrationPending and writes return 409.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidContentKey, isValidStep } from "@/lib/system-funnels";
import {
  armCopyProblem,
  buildExperimentSummary,
  clearExperimentCache,
  isMissingColumn,
  isMissingRelation,
  loadArmStats,
  loadExperiments,
  notifyIfUnreachable,
  tailoredKeysWithCopy,
  type ExperimentSummary,
} from "@/lib/email-experiments";
import { loadFunnelOverrides, type FunnelOverride } from "@/lib/funnel-copy";
import {
  DEFAULT_MAX_DAYS,
  DEFAULT_MIN_SENDS_PER_ARM,
  type AbMetric,
} from "@/lib/ab-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METRICS: AbMetric[] = ["click", "paid", "activation"];
const MAX_SUBJECT = 300;
const MAX_BODY = 20000;

function getDb(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

function migrationPending() {
  return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
}

/** Early steps (day 0 to day 5, and hour-based steps) test clicks; later
 * steps test paid conversion. */
function defaultPrimaryMetric(tier: string): AbMetric {
  const m = /^day(\d+)$/.exec(tier);
  if (m) return Number(m[1]) <= 5 ? "click" : "paid";
  if (/^\d+h$/.test(tier)) return "click";
  return "paid";
}

function parseMetric(v: unknown): AbMetric | null | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  return typeof v === "string" && (METRICS as string[]).includes(v) ? (v as AbMetric) : null;
}

function parseIntIn(v: unknown, min: number, max: number, fallback: number): number | null {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

async function runningConflict(
  db: SupabaseClient,
  funnel: string,
  tier: string,
  segment: string | null,
  excludeId?: string,
): Promise<boolean | null> {
  let q = db
    .from("email_experiments")
    .select("id")
    .eq("status", "running")
    .eq("kind", "funnel_step")
    .eq("funnel", funnel)
    .eq("tier", tier);
  q = segment ? q.eq("segment", segment) : q.is("segment", null);
  const { data, error } = await q.returns<{ id: string }[]>();
  if (error) return isMissingRelation(error) || isMissingColumn(error) ? null : true;
  return (data ?? []).some((r) => r.id !== excludeId);
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const funnel = new URL(request.url).searchParams.get("funnel") || undefined;
  const list = await loadExperiments(db, { funnel });
  if (list === null) return NextResponse.json({ experiments: [], migrationPending: true });

  const now = Date.now();
  const experiments: ExperimentSummary[] = await Promise.all(
    list.map(async (exp) => {
      const stats =
        exp.status === "draft" ? null : await loadArmStats(db, exp, now).catch(() => null);
      return buildExperimentSummary(exp, stats);
    }),
  );
  return NextResponse.json({ experiments, migrationPending: false });
}

export async function POST(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const funnel = typeof body.funnel === "string" ? body.funnel : "";
  const tier = typeof body.tier === "string" ? body.tier : "";
  if (!isValidStep(funnel, tier)) {
    return NextResponse.json({ error: "Unknown funnel step" }, { status: 400 });
  }
  const segmentRaw = typeof body.segment === "string" ? body.segment.trim() : "";
  const segment = segmentRaw.length > 0 ? segmentRaw : null;
  const contentKey = segment ? `${tier}.${segment}` : tier;
  if (segment && !isValidContentKey(funnel, contentKey)) {
    return NextResponse.json({ error: "Unknown segment for this step" }, { status: 400 });
  }

  const primary = parseMetric(body.primaryMetric);
  if (primary === null) return NextResponse.json({ error: "Invalid primary metric" }, { status: 400 });
  const primaryMetric = primary ?? defaultPrimaryMetric(tier);
  const guard = parseMetric(body.guardrailMetric);
  if (guard === null) return NextResponse.json({ error: "Invalid guardrail metric" }, { status: 400 });
  const guardrailMetric: AbMetric | null =
    guard === undefined ? (primaryMetric === "click" ? "paid" : "click") : guard;
  if (guardrailMetric === primaryMetric) {
    return NextResponse.json({ error: "Guardrail must differ from the primary metric" }, { status: 400 });
  }
  const minSendsPerArm = parseIntIn(body.minSendsPerArm, 50, 10000, DEFAULT_MIN_SENDS_PER_ARM);
  if (minSendsPerArm === null) return NextResponse.json({ error: "minSendsPerArm must be 50 to 10000" }, { status: 400 });
  const maxDays = parseIntIn(body.maxDays, 7, 120, DEFAULT_MAX_DAYS);
  if (maxDays === null) return NextResponse.json({ error: "maxDays must be 7 to 120" }, { status: 400 });

  const armB = (body.armB ?? {}) as { subject?: unknown; body?: unknown };
  const subject = typeof armB.subject === "string" ? armB.subject.trim().slice(0, MAX_SUBJECT) : "";
  const armBody = typeof armB.body === "string" ? armB.body.slice(0, MAX_BODY) : "";
  if (!subject && !armBody.trim()) {
    return NextResponse.json({ error: "Arm B needs a subject or a body" }, { status: 400 });
  }
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 120)
      : `${funnel} ${contentKey} test`;
  for (const [label, text] of [["Name", name], ["Subject", subject], ["Body", armBody]] as const) {
    const problem = label === "Name" ? (text.includes("\u2014") ? "Remove the em dash." : null) : armCopyProblem(text);
    if (problem) return NextResponse.json({ error: `${label}: ${problem}` }, { status: 400 });
  }

  // A whole-step test (no segment) on a step with tailored copy could never
  // promote: arm B would replace every track's copy while it runs, and a
  // bare-tier override cannot reach the tailored keys afterwards, so
  // promoteWinner always ends in "conflict". Ask for a segment up front.
  if (!segment) {
    let overrides = new Map<string, FunnelOverride>();
    try {
      overrides = await loadFunnelOverrides(db);
    } catch {
      // code copy alone still decides
    }
    const tailored = tailoredKeysWithCopy(funnel, tier, overrides);
    if (tailored.length > 0) {
      return NextResponse.json(
        {
          error: `This step has tailored copy (${tailored.slice(0, 5).join(", ")}${tailored.length > 5 ? ", ..." : ""}). Pick a segment so the winner can be applied.`,
          segmentRequired: true,
          tailoredKeys: tailored,
        },
        { status: 400 },
      );
    }
  }

  const conflict = await runningConflict(db, funnel, tier, segment);
  if (conflict === null) return migrationPending();
  if (conflict) {
    return NextResponse.json({ error: "A test is already running on this step and segment" }, { status: 409 });
  }

  const { data: created, error } = await db
    .from("email_experiments")
    .insert({
      kind: "funnel_step",
      name,
      funnel,
      tier,
      content_key: contentKey,
      segment,
      primary_metric: primaryMetric,
      guardrail_metric: guardrailMetric,
      status: "draft",
      min_sends_per_arm: minSendsPerArm,
      max_days: maxDays,
      created_by: actor.email,
      updated_by: actor.email,
    })
    .select("id")
    .single();
  if (error || !created) {
    if (error && (isMissingRelation(error) || isMissingColumn(error))) return migrationPending();
    console.error("admin experiments: create failed", error);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  const id = (created as { id: string }).id;
  const { error: armErr } = await db.from("email_experiment_arms").insert([
    { experiment_id: id, arm: "a", subject: null, body: null },
    { experiment_id: id, arm: "b", subject: subject || null, body: armBody.trim() ? armBody : null },
  ]);
  if (armErr) {
    await db.from("email_experiments").delete().eq("id", id);
    if (isMissingRelation(armErr) || isMissingColumn(armErr)) return migrationPending();
    console.error("admin experiments: arms create failed", armErr);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const found = await loadExperiments(db, { id, limit: 1 });
  if (found === null) return migrationPending();
  const exp = found[0];
  if (!exp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const nowIso = new Date().toISOString();

  if (action === "start") {
    if (exp.status !== "draft") {
      return NextResponse.json({ error: `Only a draft can start (this test is ${exp.status})` }, { status: 409 });
    }
    if (exp.kind !== "funnel_step" || !exp.funnel || !exp.tier || !exp.contentKey ||
        !isValidContentKey(exp.funnel, exp.contentKey)) {
      return NextResponse.json({ error: "The funnel step no longer exists" }, { status: 400 });
    }
    const conflict = await runningConflict(db, exp.funnel, exp.tier, exp.segment, exp.id);
    if (conflict === null) return migrationPending();
    if (conflict) {
      return NextResponse.json({ error: "Another test is already running on this step and segment" }, { status: 409 });
    }
    const { error } = await db
      .from("email_experiments")
      .update({
        status: "running",
        started_at: nowIso,
        looks_done: 0,
        last_look_at: null,
        updated_at: nowIso,
        updated_by: actor.email,
      })
      .eq("id", id)
      .eq("status", "draft");
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Another test is already running on this step and segment" }, { status: 409 });
      }
      console.error("admin experiments: start failed", error);
      return NextResponse.json({ error: "Start failed" }, { status: 500 });
    }
    clearExperimentCache();
    // Warn the founder now if 200/arm is out of reach (best-effort).
    await notifyIfUnreachable(db, { ...exp, status: "running", startedAt: nowIso }).catch(() => false);
    return NextResponse.json({ ok: true });
  }

  if (action === "stop") {
    if (exp.status !== "running") {
      return NextResponse.json({ error: `Only a running test can stop (this test is ${exp.status})` }, { status: 409 });
    }
    const { error } = await db
      .from("email_experiments")
      .update({
        status: "stopped",
        ended_at: nowIso,
        decision: { outcome: "inconclusive", reason: `Stopped by ${actor.email}` },
        updated_at: nowIso,
        updated_by: actor.email,
      })
      .eq("id", id)
      .eq("status", "running");
    if (error) {
      console.error("admin experiments: stop failed", error);
      return NextResponse.json({ error: "Stop failed" }, { status: 500 });
    }
    clearExperimentCache();
    return NextResponse.json({ ok: true });
  }

  if (action === "update-arm") {
    if (exp.status !== "draft") {
      return NextResponse.json({ error: "Arms cannot change once a test has started" }, { status: 409 });
    }
    const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, MAX_SUBJECT) : "";
    const armBody = typeof body.body === "string" ? body.body.slice(0, MAX_BODY) : "";
    if (!subject && !armBody.trim()) {
      return NextResponse.json({ error: "Arm B needs a subject or a body" }, { status: 400 });
    }
    for (const [label, text] of [["Subject", subject], ["Body", armBody]] as const) {
      const problem = armCopyProblem(text);
      if (problem) return NextResponse.json({ error: `${label}: ${problem}` }, { status: 400 });
    }
    const { error } = await db
      .from("email_experiment_arms")
      .update({ subject: subject || null, body: armBody.trim() ? armBody : null })
      .eq("experiment_id", id)
      .eq("arm", "b");
    if (error) {
      console.error("admin experiments: update arm failed", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    await db.from("email_experiments").update({ updated_at: nowIso, updated_by: actor.email }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
