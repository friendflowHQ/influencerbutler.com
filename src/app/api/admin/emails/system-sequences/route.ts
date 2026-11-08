/**
 * Admin API for the built-in (code-defined) email funnels shown in the
 * Sequences tab as read-and-edit "system sequences".
 *
 * GET   returns every funnel with its steps, each step's editable copy
 *       (override or code default), timing and tag; per content key (Funnels
 *       v2 tracks and modules) a preview, last-updated stamp and override flag;
 *       per funnel all-history enter/convert counts, activation % and paid %
 *       against their targets, a staleness flag and an A/B experiments summary;
 *       plus a global unsubscribe count.
 * PATCH actions (permission marketing.send):
 *       save           upsert an override for a bare tier or content key
 *       reset          blank the override's copy (row kept so its history survives)
 *       mark-reviewed  stamp reviewed_at / reviewed_by (needs 20261110)
 *       set-target     set an activation or paid target in app_config
 *
 * Every optional table/column degrades: without email_funnel_overrides GET
 * returns code defaults and PATCH reports migrationPending; metrics show
 * rate null ("needs migration"); experiments show [] without their tables.
 * Sends always fall back to code copy.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTag } from "@/lib/email-audience";
import {
  isOverrideActive,
  loadFunnelOverrides,
  resolveFunnelCopy,
  resolveFunnelCopyForKey,
  type FunnelOverride,
} from "@/lib/funnel-copy";
import {
  SYSTEM_FUNNELS,
  previewVars,
  funnelDefaults,
  funnelDefaultsForKey,
  isValidContentKey,
  makeCodeDefaultForKey,
} from "@/lib/system-funnels";
import { isBareKey, parseContentKey, type FunnelKey } from "@/lib/funnel-types";
import {
  computeFunnelMetrics,
  countFunnelTotals,
  isMetricFunnel,
  isMissingSchema,
  loadOutcomeTimes,
  outcomeWithinWindow,
  type FunnelMetrics,
} from "@/lib/funnel-metrics";
import { getFunnelTargets, setFunnelTarget, systemTargetKey, targetFor } from "@/lib/funnel-targets";
import { copyUpdatedFor } from "@/lib/funnel-copy-dates";
import { latestStamp, staleness, toMs, type Stamp } from "@/lib/funnel-staleness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const EXPERIMENT_DECIDED_LOOKBACK_DAYS = 31;

function getDb(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

function errCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null ? (error as { code?: string }).code : undefined;
}

function missingColumn(error: unknown): boolean {
  const c = errCode(error);
  return c === "42703" || c === "PGRST204";
}

function missingTable(error: unknown): boolean {
  const c = errCode(error);
  return c === "42P01" || c === "PGRST205";
}

// ---------------------------------------------------------------------------
// Content-key labels
// ---------------------------------------------------------------------------

const BASE_LABELS: Record<string, string> = {
  beginner: "Beginner",
  power: "Power User",
  unknown: "Plan unknown",
  starter: "Brand new",
};

const MODULE_LABELS: Record<string, string> = {
  "cc-auto": "Creator Connections auto-accept",
  walmart: "Walmart",
  deals: "Deal Posting",
  social: "Social posting",
  video: "Video",
  "amazon-offsite": "Amazon offsite",
  "amazon-onsite": "Amazon onsite",
  photo: "Photo",
  benable: "Benable",
  youtube: "YouTube",
  "starter-offsite": "Starter offsite",
  "starter-onsite": "Starter onsite",
};

function contentKeyLabel(key: string): string {
  const p = parseContentKey(key);
  if (!p || (!p.base && !p.module)) return "Default";
  const base = p.base ? BASE_LABELS[p.base] ?? p.base : "";
  if (!p.module) return base;
  const mod = `${MODULE_LABELS[p.module] ?? p.module} module`;
  return base ? `${mod} (${base})` : mod;
}

/** Sample vars for one key: Power-only vars blank for other bases, matching
 * what funnel-personalize sends. */
function varsForKey(sample: Record<string, unknown>, key: string): Record<string, unknown> {
  const p = parseContentKey(key);
  if (p?.base && p.base !== "power" && "bookCallUrl" in sample) return { ...sample, bookCallUrl: "" };
  return sample;
}

function nonBlank(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Experiments summary (tables from 20261110; [] without them)
// ---------------------------------------------------------------------------

type ExperimentMetric = "click" | "paid" | "activation";
type ArmSummary = {
  arm: "a" | "b";
  subject: string | null;
  body: string | null;
  sends: number;
  clicks: number;
  conversions: number;
  clickRate: number | null;
  conversionRate: number | null;
};
type ExperimentSummary = {
  id: string;
  funnel: string | null;
  tier: string | null;
  contentKey: string | null;
  segment: string | null;
  name: string;
  status: "draft" | "running" | "decided" | "stopped";
  primaryMetric: ExperimentMetric;
  guardrailMetric: ExperimentMetric | null;
  minSendsPerArm: number;
  maxDays: number;
  looksDone: number;
  lastLookAt: string | null;
  startedAt: string | null;
  decidedAt: string | null;
  winnerArm: "a" | "b" | null;
  decision: Record<string, unknown> | null;
  arms: ArmSummary[];
};

type Row = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function metricOf(v: unknown): ExperimentMetric | null {
  return v === "click" || v === "paid" || v === "activation" ? v : null;
}
function statusOf(v: unknown): ExperimentSummary["status"] {
  return v === "running" || v === "decided" || v === "stopped" ? v : "draft";
}

async function loadExperimentSummaries(db: SupabaseClient, now: number): Promise<Map<string, ExperimentSummary[]>> {
  const byFunnel = new Map<string, ExperimentSummary[]>();
  try {
    const since = new Date(now - EXPERIMENT_DECIDED_LOOKBACK_DAYS * DAY_MS).toISOString();
    const { data: expData, error: expErr } = await db
      .from("email_experiments")
      .select("*")
      .eq("kind", "funnel_step")
      .or(`status.eq.running,and(status.eq.decided,decided_at.gte.${since})`)
      .order("created_at", { ascending: false })
      .limit(100);
    if (expErr) {
      if (!isMissingSchema(expErr)) console.error("system-sequences: experiments query failed", expErr);
      return byFunnel;
    }
    const exps = (expData ?? []) as Row[];
    if (exps.length === 0) return byFunnel;
    const ids = exps.map((e) => String(e.id));

    const armsByExp = new Map<string, Row[]>();
    const { data: armData, error: armErr } = await db
      .from("email_experiment_arms")
      .select("experiment_id, arm, subject, body")
      .in("experiment_id", ids);
    if (!armErr) {
      for (const a of (armData ?? []) as Row[]) {
        const k = String(a.experiment_id);
        armsByExp.set(k, [...(armsByExp.get(k) ?? []), a]);
      }
    }

    // Distinct recipients per (experiment, arm): first send time + clicked.
    type Recip = { sentAt: string | null; clicked: boolean };
    const recips = new Map<string, Map<string, Recip>>(); // `${exp}:${arm}` -> email -> Recip
    const PAGE = 1000;
    for (let offset = 0; offset < 50_000; offset += PAGE) {
      const { data, error } = await db
        .from("email_sends")
        .select("experiment_id, variant, recipient, clicked_at, created_at")
        .in("experiment_id", ids)
        .eq("status", "sent")
        .range(offset, offset + PAGE - 1);
      if (error) {
        if (!isMissingSchema(error)) console.error("system-sequences: experiment sends query failed", error);
        break;
      }
      const rows = (data ?? []) as Row[];
      for (const r of rows) {
        const arm = r.variant === "a" || r.variant === "b" ? r.variant : null;
        const email = typeof r.recipient === "string" ? r.recipient.trim().toLowerCase() : "";
        if (!arm || !email) continue;
        const k = `${String(r.experiment_id)}:${arm}`;
        const m = recips.get(k) ?? new Map<string, Recip>();
        const prev = m.get(email);
        const sentAt = str(r.created_at);
        m.set(email, {
          sentAt: prev?.sentAt && (!sentAt || prev.sentAt < sentAt) ? prev.sentAt : sentAt,
          clicked: Boolean(prev?.clicked || r.clicked_at),
        });
        recips.set(k, m);
      }
      if (rows.length < PAGE) break;
    }

    for (const e of exps) {
      const id = String(e.id);
      const funnel = str(e.funnel);
      const primary = metricOf(e.primary_metric) ?? "click";
      const guardrail = metricOf(e.guardrail_metric);
      const convMetric: "paid" | "activation" =
        primary !== "click" ? primary : guardrail && guardrail !== "click" ? guardrail : "paid";
      const windowDays = num(e.conversion_window_days, 14);
      const armRows = armsByExp.get(id) ?? [];
      const arms: ArmSummary[] = [];
      for (const armKey of ["a", "b"] as const) {
        const def = armRows.find((a) => a.arm === armKey);
        const m = recips.get(`${id}:${armKey}`) ?? new Map<string, Recip>();
        const sends = m.size;
        let clicks = 0;
        for (const r of m.values()) if (r.clicked) clicks++;
        let conversions = 0;
        let conversionKnown = false;
        if (funnel && isMetricFunnel(funnel) && sends > 0) {
          const outcomes = await loadOutcomeTimes(db, funnel, convMetric, [...m.keys()]);
          if (outcomes) {
            conversionKnown = true;
            for (const [email, r] of m) {
              if (outcomeWithinWindow(r.sentAt, outcomes.get(email) ?? null, windowDays)) conversions++;
            }
          }
        }
        if (!def && sends === 0) continue;
        arms.push({
          arm: armKey,
          subject: str(def?.subject),
          body: str(def?.body),
          sends,
          clicks,
          conversions,
          clickRate: sends > 0 ? clicks / sends : null,
          conversionRate: sends > 0 && conversionKnown ? conversions / sends : null,
        });
      }
      const summary: ExperimentSummary = {
        id,
        funnel,
        tier: str(e.tier),
        contentKey: str(e.content_key),
        segment: str(e.segment),
        name: typeof e.name === "string" ? e.name : "",
        status: statusOf(e.status),
        primaryMetric: primary,
        guardrailMetric: guardrail,
        minSendsPerArm: num(e.min_sends_per_arm, 200),
        maxDays: num(e.max_days, 45),
        looksDone: num(e.looks_done, 0),
        lastLookAt: str(e.last_look_at),
        startedAt: str(e.started_at),
        decidedAt: str(e.decided_at),
        winnerArm: e.winner_arm === "a" || e.winner_arm === "b" ? e.winner_arm : null,
        decision: e.decision && typeof e.decision === "object" ? (e.decision as Record<string, unknown>) : null,
        arms,
      };
      if (!funnel) continue;
      byFunnel.set(funnel, [...(byFunnel.get(funnel) ?? []), summary]);
    }
  } catch (err) {
    console.error("system-sequences: experiments summary threw", err);
  }
  return byFunnel;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

function overrideStamp(ov: FunnelOverride | undefined): Stamp {
  return { at: ov?.updatedAt ?? null, by: ov?.updatedBy ?? null };
}

function codeStamp(funnel: string, key: string): Stamp {
  const d = copyUpdatedFor(funnel, key);
  return { at: d, by: d ? "code default" : null };
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const now = Date.now();
  const [overrides, targets, experiments] = await Promise.all([
    loadFunnelOverrides(db),
    getFunnelTargets(db),
    loadExperimentSummaries(db, now),
  ]);

  const funnels = await Promise.all(
    SYSTEM_FUNNELS.map(async (f) => {
      const metricKey = isMetricFunnel(f.key) ? (f.key as FunnelKey) : null;
      const [totals, metrics] = await Promise.all([
        metricKey ? countFunnelTotals(db, metricKey) : Promise.resolve(null),
        metricKey ? computeFunnelMetrics(db, metricKey, now) : Promise.resolve(null as FunnelMetrics | null),
      ]);
      const target = targetFor(targets, systemTargetKey(f.key));

      const sampleVars = previewVars(f.key);
      // Editable defaults render each variable AS its {{token}}, so a
      // non-overridden step opens in the editor as a proper template (with
      // {{firstName}} etc.) rather than sample-rendered text that would bake in
      // "Alex" if saved verbatim.
      const tokenVars: Record<string, unknown> = {};
      for (const v of f.vars) tokenVars[v] = `{{${v}}}`;

      const steps = f.steps.map((s) => {
        const ov = overrides.get(`${f.key}:${s.tier}`);
        const templateDefaults = funnelDefaults(f.key, s.tier, tokenVars);
        const sampleDefaults = funnelDefaults(f.key, s.tier, sampleVars);
        // Preview = override rendered against sample vars, else the sample default.
        const resolved = resolveFunnelCopy({
          funnel: f.key,
          tier: s.tier,
          vars: sampleVars,
          defaults: sampleDefaults,
          overrides,
        });
        const rawSubject = ov && nonBlank(ov.subject) ? ov.subject : templateDefaults.subject;
        const rawBody = ov && nonBlank(ov.body) ? ov.body : templateDefaults.body;

        const keys = s.contentKeys.length > 0 ? s.contentKeys : [s.tier];
        const contentKeys = keys.map((key) => {
          const kov = overrides.get(`${f.key}:${key}`);
          const kVars = varsForKey(sampleVars, key);
          const preview = resolveFunnelCopyForKey({
            funnel: f.key,
            contentKey: key,
            vars: kVars,
            overrides,
            codeDefaultForKey: makeCodeDefaultForKey(f.key, kVars),
          });
          const code = funnelDefaultsForKey(f.key, key, tokenVars);
          const stamp = latestStamp(overrideStamp(kov), codeStamp(f.key, key));
          return {
            key,
            label: contentKeyLabel(key),
            subjectPreview: preview.subject,
            // Editor template for this key: its own override, else the code
            // copy the key renders today (which may come from a fallback key).
            subject: kov && nonBlank(kov.subject) ? kov.subject : code.subject,
            body: kov && nonBlank(kov.body) ? kov.body : code.body,
            sourceKey: code.sourceKey,
            apply_tag: kov?.applyTag ?? null,
            // The step editor reads the camelCase name (ContentKeyInfo.applyTag).
            applyTag: kov?.applyTag ?? null,
            updatedAt: stamp.at,
            updatedBy: stamp.by,
            reviewedAt: kov?.reviewedAt ?? null,
            reviewedBy: kov?.reviewedBy ?? null,
            isOverridden: isOverrideActive(kov),
          };
        });

        const stepStamp = latestStamp(...contentKeys.map((k) => ({ at: k.updatedAt, by: k.updatedBy })));
        const reviewedAt = ov?.reviewedAt ?? null;
        const touched = latestStamp(stepStamp, { at: reviewedAt, by: ov?.reviewedBy ?? null });
        return {
          tier: s.tier,
          label: s.label,
          category: s.category,
          day_offset: ov?.dayOffset ?? s.defaultDayOffset,
          subject: rawSubject,
          subjectPreview: resolved.subject,
          body: rawBody,
          apply_tag: ov?.applyTag ?? null,
          isOverridden: isOverrideActive(ov),
          slot: s.slot,
          moduleIndex: s.moduleIndex ?? null,
          contentKeys,
          updatedAt: stepStamp.at,
          updatedBy: stepStamp.by,
          reviewedAt,
          reviewedBy: ov?.reviewedBy ?? null,
          lastTouchedAt: touched.at,
          stale: staleness(touched.at, now),
        };
      });

      // Funnel freshness: newest of its steps' (updated, reviewed); oldest too,
      // so the UI and the monthly reminder can point at the step to review.
      let newest: Stamp = { at: null, by: null };
      let oldestAt: string | null = null;
      let oldestMs = Infinity;
      for (const st of steps) {
        newest = latestStamp(newest, { at: st.lastTouchedAt, by: st.updatedBy });
        const t = toMs(st.lastTouchedAt);
        const tm = t === null ? -Infinity : t;
        if (tm < oldestMs) {
          oldestMs = tm;
          oldestAt = st.lastTouchedAt;
        }
      }

      return {
        funnel: f.key,
        name: f.name,
        description: f.description,
        tooltip: f.tooltip,
        vars: f.vars,
        entered: totals?.entered ?? null,
        converted: totals?.converted ?? null,
        convertedLabel: totals?.convertedLabel ?? null,
        steps,
        metrics: metrics
          ? {
              activation: { ...metrics.activation, target: target.activation },
              paid: { ...metrics.paid, target: target.paid },
            }
          : {
              activation: { num: 0, den: 0, rate: null, measurable: true, target: target.activation },
              paid: { num: 0, den: 0, rate: null, measurable: true, target: target.paid },
            },
        targetKey: systemTargetKey(f.key),
        updatedAt: newest.at,
        updatedBy: newest.by,
        oldestStepAt: oldestAt,
        stale: staleness(newest.at, now),
        staleSteps: steps.filter((st) => st.stale !== "fresh").length,
        experiments: experiments.get(f.key) ?? [],
      };
    }),
  );

  const { count: unsubscribes } = await db
    .from("email_suppressions")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({ funnels, unsubscribes: unsubscribes ?? 0, migrationPending: false });
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

function migrationPending() {
  return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
}

export async function PATCH(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: {
    funnel?: unknown;
    tier?: unknown;
    action?: unknown;
    subject?: unknown;
    body?: unknown;
    applyTag?: unknown;
    dayOffset?: unknown;
    key?: unknown;
    metric?: unknown;
    value?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  // Targets are keyed "system:<funnel>" / "seq:<uuid>", not by step.
  if (action === "set-target") {
    const r = await setFunnelTarget(db, body.key, body.metric, body.value, actor.email);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  }

  const funnel = typeof body.funnel === "string" ? body.funnel : "";
  // `tier` is a bare tier ("day5") or a Funnels v2 content key ("day5.beginner").
  const tier = typeof body.tier === "string" ? body.tier : "";
  if (!isValidContentKey(funnel, tier)) {
    return NextResponse.json({ error: "Unknown funnel step" }, { status: 400 });
  }
  const nowIso = new Date().toISOString();

  if (action === "reset") {
    // Blank the copy instead of deleting the row so updated_at / updated_by
    // (and reviewed_*) survive. resolveFunnelCopy / resolveFunnelCopyForKey
    // skip blank fields, and tierThresholdMs ignores a null day_offset, so a
    // blank row sends exactly the code default.
    const { error } = await db.from("email_funnel_overrides").upsert(
      {
        funnel,
        tier,
        subject: "",
        body: "",
        apply_tag: null,
        day_offset: null,
        updated_by: actor.email,
        updated_at: nowIso,
      },
      { onConflict: "funnel,tier" },
    );
    if (error) {
      if (missingTable(error) || missingColumn(error)) return migrationPending();
      console.error("system-sequences: reset failed", error);
      return NextResponse.json({ error: "Reset failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "mark-reviewed") {
    // Upsert touches only the review stamps on an existing row; a step with no
    // row gets a blank one (blank copy = code default).
    const { error } = await db
      .from("email_funnel_overrides")
      .upsert(
        { funnel, tier, reviewed_at: nowIso, reviewed_by: actor.email },
        { onConflict: "funnel,tier" },
      );
    if (error) {
      if (missingTable(error) || missingColumn(error)) return migrationPending();
      console.error("system-sequences: mark-reviewed failed", error);
      return NextResponse.json({ error: "Mark reviewed failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action !== "save") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const subject = typeof body.subject === "string" ? body.subject.slice(0, 300) : null;
  const bodyText = typeof body.body === "string" ? body.body.slice(0, 20000) : null;
  let applyTag: string | null = null;
  if (typeof body.applyTag === "string" && body.applyTag.trim().length > 0) {
    applyTag = normalizeTag(body.applyTag);
    if (!applyTag) return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
  }
  let dayOffset: number | null = null;
  if (body.dayOffset !== null && body.dayOffset !== undefined && body.dayOffset !== "") {
    // Timing belongs to the bare tier; a tailored key's day_offset would be ignored.
    if (!isBareKey(tier)) {
      return NextResponse.json({ error: "Timing can only be set on the Default tab" }, { status: 400 });
    }
    const n = Number(body.dayOffset);
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      return NextResponse.json({ error: "Invalid day offset" }, { status: 400 });
    }
    dayOffset = n;
  }

  const { error } = await db.from("email_funnel_overrides").upsert(
    {
      funnel,
      tier,
      subject,
      body: bodyText,
      apply_tag: applyTag,
      day_offset: dayOffset,
      updated_by: actor.email,
      updated_at: nowIso,
    },
    { onConflict: "funnel,tier" },
  );
  if (error) {
    if (missingTable(error) || missingColumn(error)) return migrationPending();
    console.error("system-sequences: save failed", error);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
