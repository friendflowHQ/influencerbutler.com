/**
 * GET /api/cron/funnel-review-reminder
 *
 * Monthly nudge to the founder (1st of the month, ~8-9am Mountain): a plain
 * text email listing built-in funnel steps and active sequences whose copy has
 * not been updated or reviewed in over 30 days (oldest first), funnels below
 * their activation / paid targets, A/B decisions from the last month plus
 * running and stalled tests, and a price-change note while one is ahead.
 *
 * Scheduling: vercel.json fires this at 15:00 UTC on day 1 (8am MST / 9am MDT).
 * The route keeps only the invocation whose America/Denver date is the 1st.
 *
 * Always sends (an empty month says "All funnels fresh"). An app_config marker
 * (funnel_review_reminder_<YYYY-MM>) stops a retry from double-emailing.
 * ?dry=1 returns the data and the rendered email as JSON without sending (and
 * without the dedupe check); ?force=1 skips the 1st-of-month gate; an
 * x-review-to: <email> request header sends
 * to one address instead of the founder list (testing). Gated on CRON_SECRET.
 *
 * Degrades on prod schema lag: missing 20261110 columns or tables
 * (email_experiments, email_sequences.content_updated_at, reviewed_at on
 * overrides) just drop that part of the report instead of failing.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyBearer } from "@/lib/auth-secret";
import { localParts, DEFAULT_DIGEST_TIMEZONE } from "@/lib/daily-digest";
import { SYSTEM_FUNNELS, findFunnel, findStep } from "@/lib/system-funnels";
import { loadFunnelOverrides } from "@/lib/funnel-copy";
import { copyUpdatedFor } from "@/lib/funnel-copy-dates";
import { computeFunnelMetrics, isMetricFunnel, isMissingSchema } from "@/lib/funnel-metrics";
import { getFunnelTargets, systemTargetKey, targetFor } from "@/lib/funnel-targets";
import { PRICE_CHANGE, priceChangeActive } from "@/lib/pricing-constants";
import {
  belowTargetRow,
  buildFunnelReviewReminder,
  collectFunnelStaleItems,
  sendFunnelReviewReminder,
  type FunnelReviewReminderInput,
  type ReviewBelowTarget,
  type ReviewExperiment,
  type ReviewStaleItem,
} from "@/lib/funnel-review-reminder-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEDUPE_PREFIX = "funnel_review_reminder_";
const DAY_MS = 86_400_000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

type Row = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function alreadyRan(db: SupabaseClient, monthKey: string): Promise<boolean> {
  try {
    const { data } = await db
      .from("app_config")
      .select("value")
      .eq("key", `${DEDUPE_PREFIX}${monthKey}`)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

async function markRan(db: SupabaseClient, monthKey: string, summary: Record<string, unknown>): Promise<void> {
  try {
    await db.from("app_config").upsert(
      {
        key: `${DEDUPE_PREFIX}${monthKey}`,
        value: { ran_at: new Date().toISOString(), ...summary },
        updated_at: new Date().toISOString(),
        updated_by: "cron:funnel-review-reminder",
      },
      { onConflict: "key" },
    );
  } catch (err) {
    console.error("[funnel-review-reminder] markRan failed", err);
  }
}

/** Active sequences, dated by their last content change. Falls back to
 * created_at / created_by before 20261110 adds the content_updated_* columns. */
async function loadSequenceStaleItems(db: SupabaseClient): Promise<ReviewStaleItem[]> {
  const selects = [
    "id, name, status, created_at, created_by, updated_at, updated_by, content_updated_at, content_updated_by",
    "id, name, status, created_at, created_by",
  ];
  for (const cols of selects) {
    try {
      const { data, error } = await db.from("email_sequences").select(cols).eq("status", "active");
      if (error) {
        if (isMissingSchema(error)) continue;
        console.error("[funnel-review-reminder] sequences load failed", error);
        return [];
      }
      return ((data ?? []) as unknown as Row[]).map((r) => {
        const at = str(r.content_updated_at) ?? str(r.created_at);
        const by = str(r.content_updated_at) ? str(r.content_updated_by) : str(r.created_by);
        return {
          kind: "sequence" as const,
          label: `Sequence: ${str(r.name) ?? String(r.id)}`,
          updatedAt: at,
          updatedBy: by,
        };
      });
    } catch (err) {
      console.error("[funnel-review-reminder] sequences load threw", err);
      return [];
    }
  }
  return [];
}

function experimentWhere(r: Row): string | null {
  const funnel = str(r.funnel);
  const tier = str(r.tier);
  const segment = str(r.segment);
  if (funnel && tier) {
    const f = findFunnel(funnel);
    const step = findStep(funnel, tier);
    const base = `${f?.name ?? funnel}: ${step?.label ?? tier}`;
    return segment ? `${base}, ${segment}` : base;
  }
  return str(r.base_tag) ? `sequence group ${str(r.base_tag)}` : null;
}

async function countArmSends(db: SupabaseClient, id: string, arm: "a" | "b"): Promise<number> {
  try {
    const { count, error } = await db
      .from("email_sends")
      .select("id", { count: "exact", head: true })
      .eq("experiment_id", id)
      .eq("variant", arm);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Running tests and tests decided in the last 31 days. [] before 20261110. */
async function loadExperiments(db: SupabaseClient, now: Date): Promise<ReviewExperiment[]> {
  let rows: Row[] = [];
  try {
    const { data, error } = await db
      .from("email_experiments")
      .select(
        "id, kind, name, funnel, tier, segment, base_tag, status, primary_metric, min_sends_per_arm, max_days, started_at, decided_at, winner_arm, decision",
      )
      .in("status", ["running", "decided"]);
    if (error) {
      if (!isMissingSchema(error)) console.error("[funnel-review-reminder] experiments load failed", error);
      return [];
    }
    rows = (data ?? []) as unknown as Row[];
  } catch (err) {
    console.error("[funnel-review-reminder] experiments load threw", err);
    return [];
  }

  const cutoff = now.getTime() - 31 * DAY_MS;
  const out: ReviewExperiment[] = [];
  for (const r of rows) {
    const status = r.status === "decided" ? "decided" : "running";
    const decidedAt = str(r.decided_at);
    if (status === "decided" && (!decidedAt || Date.parse(decidedAt) < cutoff)) continue;
    const decision = (r.decision && typeof r.decision === "object" ? r.decision : {}) as Row;
    const dRates = (decision.rates && typeof decision.rates === "object" ? decision.rates : null) as Row | null;
    const dSends = (decision.sends && typeof decision.sends === "object" ? decision.sends : null) as Row | null;
    const id = String(r.id);
    const sends =
      status === "decided" && dSends
        ? { a: num(dSends.a, 0), b: num(dSends.b, 0) }
        : { a: await countArmSends(db, id, "a"), b: await countArmSends(db, id, "b") };
    const winner = r.winner_arm === "a" || r.winner_arm === "b" ? r.winner_arm : null;
    out.push({
      name: str(r.name) ?? "Untitled test",
      where: experimentWhere(r),
      status,
      primaryMetric: str(r.primary_metric) ?? "click",
      startedAt: str(r.started_at),
      decidedAt,
      winnerArm: winner,
      outcome: str(decision.outcome),
      rates: dRates
        ? {
            a: typeof dRates.a === "number" ? dRates.a : null,
            b: typeof dRates.b === "number" ? dRates.b : null,
          }
        : null,
      p: typeof decision.p === "number" ? decision.p : null,
      sends,
      minSendsPerArm: num(r.min_sends_per_arm, 200),
      maxDays: num(r.max_days, 45),
    });
  }
  return out;
}

async function loadBelowTargetCandidates(db: SupabaseClient, now: Date): Promise<ReviewBelowTarget[]> {
  const targets = await getFunnelTargets(db);
  const out: ReviewBelowTarget[] = [];
  for (const f of SYSTEM_FUNNELS) {
    if (!isMetricFunnel(f.key)) continue;
    try {
      const m = await computeFunnelMetrics(db, f.key, now.getTime());
      out.push(belowTargetRow(f.name, m, targetFor(targets, systemTargetKey(f.key))));
    } catch (err) {
      console.error(`[funnel-review-reminder] metrics for ${f.key} threw`, err);
    }
  }
  return out;
}

export async function GET(request: Request) {
  if (!verifyBearer(request, "CRON_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const dry = params.get("dry") === "1";
  const force = params.get("force") === "1";
  // Test recipient comes from a header, never the query string, so an email
  // address does not land in Vercel / Cloudflare request logs.
  const toOverride = str(request.headers.get("x-review-to"))?.trim() || null;
  if (toOverride && !toOverride.includes("@")) {
    return NextResponse.json({ error: "Invalid to" }, { status: 400 });
  }

  const now = new Date();
  const parts = localParts(now, DEFAULT_DIGEST_TIMEZONE);
  if (!force && parts.day !== 1) {
    return NextResponse.json({ ok: true, ran: false, reason: "not-first-of-month" });
  }

  const monthKey = `${parts.year}-${pad2(parts.month)}`;
  const db = createAdminClient() as unknown as SupabaseClient | null;
  if (!db) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // An x-review-to test send never consumes (or is blocked by) the monthly marker.
  if (!dry && !toOverride && (await alreadyRan(db, monthKey))) {
    return NextResponse.json({ ok: true, ran: false, reason: "already-ran", monthKey });
  }

  const overrides = await loadFunnelOverrides(db);
  const stepItems = collectFunnelStaleItems({
    funnels: SYSTEM_FUNNELS,
    overrides,
    codeDateFor: copyUpdatedFor,
    now,
  });
  const [sequenceItems, belowTarget, experiments] = await Promise.all([
    loadSequenceStaleItems(db),
    loadBelowTargetCandidates(db, now),
    loadExperiments(db, now),
  ]);

  const input: FunnelReviewReminderInput = {
    now,
    stale: [...stepItems, ...sequenceItems],
    belowTarget,
    experiments,
    priceChange: priceChangeActive(now.getTime()) ? { effectiveAt: PRICE_CHANGE.effectiveAt } : null,
  };
  const email = buildFunnelReviewReminder(input);

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      monthKey,
      count: email.count,
      subject: email.subject,
      text: email.text,
      input,
    });
  }

  const sent = await sendFunnelReviewReminder(input, toOverride);
  if (!toOverride && sent > 0) {
    await markRan(db, monthKey, { sent, count: email.count });
  }

  return NextResponse.json({ ok: true, ran: true, monthKey, sent, count: email.count, to: toOverride ?? undefined });
}
