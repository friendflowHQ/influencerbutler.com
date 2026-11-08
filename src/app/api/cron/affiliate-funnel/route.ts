import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { approveAffiliate } from "@/lib/affiliates-approve";
import { sendConversionEmail, type ConversionTier } from "@/lib/conversion-emails";
import { createUniqueDiscount } from "@/lib/lemonsqueezy-discounts";
import { sendTrialEmail, type TrialTier } from "@/lib/trial-emails";
import { mintTrialDiscounts, trialDiscountPercents } from "@/lib/trial-discounts";
import { hasRedeemedDiscount } from "@/lib/discount-eligibility";
import { sendProEmail, type ProTier } from "@/lib/pro-emails";
import { sendOnboardingEmail, type OnboardingTier } from "@/lib/free-onboarding-emails";
import { sendAppTrialEmail, type AppTrialTier } from "@/lib/app-trial-emails";
import { isUndeliverableTestEmail } from "@/lib/email-address";
import { runSwipeKitBroadcast, type SwipeKitDb } from "@/lib/affiliate-swipe-kit";
import { TRIAL_LENGTH_DAYS } from "@/lib/pricing-constants";
import { getFunnelOverrides, tierThresholdMs, type FunnelOverride } from "@/lib/funnel-copy";
import { verifyBearer } from "@/lib/auth-secret";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  funnelsV2Enabled,
  funnelsV2StartMs,
  type ModuleKey,
  type PlanLevelValue,
} from "@/lib/funnel-types";
import { findStep } from "@/lib/system-funnels";
import {
  buildTrackVars,
  buildUpgradeToolsLine,
  contentKeyForStep,
  exitAssignment,
  getAssignment,
  isInFlight,
  loadNextEvent,
  loadSubscriberSignals,
  lockAssignment,
  rankModules,
  selectBase,
  type NextEventInfo,
  type TrackVars,
} from "@/lib/funnel-personalize";
import { canSendLifecycle, isCadenceExemptStep } from "@/lib/email-cadence";
import {
  loadUpgradeStepsSent,
  selectUpgradeTier,
  sendUpgradeEmail,
  UPGRADE_FUNNEL,
  UPGRADE_TIERS,
  type UpgradeTier,
} from "@/lib/upgrade-emails";
import { planForVariantId, planLevelForVariantId } from "@/lib/lemonsqueezy";
import { parseLevelPlan, type Interval, type Tier } from "@/lib/pricing-constants";
import type { EmailFunnel } from "@/lib/email-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Applies admin day_offset overrides to a funnel's tier thresholds and re-sorts
 * most-aged-first, so an edited step reschedules while unedited steps keep their
 * exact code timing. Returns a fresh array (the module TIERS consts are const).
 */
function withOverrides<T extends { tier: string; thresholdMs: number }>(
  base: ReadonlyArray<T>,
  funnel: string,
  overrides: Map<string, FunnelOverride>,
): T[] {
  return base
    .map((t) => ({ ...t, thresholdMs: tierThresholdMs(overrides, funnel, t.tier, t.thresholdMs) }) as T)
    .sort((a, b) => b.thresholdMs - a.thresholdMs);
}

// --- Constants ------------------------------------------------------------

const APPROVAL_DELAY_MINUTES = 10;
const PER_RUN_LIMIT = 50;

const TIERS: ReadonlyArray<{
  tier: ConversionTier;
  thresholdMs: number;
  sentCol: string;
}> = [
  // Most-aged first - we send the highest tier that's due but not yet sent.
  { tier: "5d", thresholdMs: 5 * 24 * 60 * 60 * 1000, sentCol: "conversion_email_5d_sent_at" },
  { tier: "3d", thresholdMs: 3 * 24 * 60 * 60 * 1000, sentCol: "conversion_email_3d_sent_at" },
  { tier: "1h", thresholdMs: 60 * 60 * 1000, sentCol: "conversion_email_1h_sent_at" },
];

const STATIC_CODES: Record<Exclude<ConversionTier, "5d">, string> = {
  "1h": "AFFNEWBIE20",
  "3d": "AFFBOOST30",
};

// --- Supabase client shape ------------------------------------------------

type SelectChain<T> = {
  eq: (col: string, value: unknown) => SelectChain<T>;
  is: (col: string, value: null) => SelectChain<T>;
  not: (col: string, op: string, value: unknown) => SelectChain<T>;
  lte: (col: string, value: string) => SelectChain<T>;
  limit: (n: number) => Promise<{ data: T[] | null; error: unknown }>;
  maybeSingle: () => Promise<{ data: T | null; error: unknown }>;
} & Promise<{ data: T[] | null; error: unknown }>;

type CronClient = {
  from: (table: string) => {
    select: (cols: string) => SelectChain<Record<string, unknown>>;
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, value: string) => Promise<{ error: unknown }>;
    };
  };
};

function getServiceClient(): CronClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("cron: missing Supabase service-role configuration");
    return null;
  }
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // stateless
      },
    },
  }) as unknown as CronClient;
}

// --- Funnels v2 (FUNNELS_V2=1) ----------------------------------------------
//
// With the flag off none of this runs and every funnel below behaves exactly
// as before. With it on, the trial / pro / onboarding / apptrial steps:
//   1. load the person's walkthrough tags + plan level and their sticky
//      assignment (email_funnel_assignments; in-memory "unknown" if missing),
//   2. pick the step's content key (module slots consume modules[0..2]),
//   3. apply the 44h cadence cap (a deferred step is NOT stamped, so the next
//      run reconsiders it),
//   4. hand the content key + track vars to the funnel's own send function
//      (sendTrialEmail etc. resolve copy with resolveFunnelCopyForKey); a
//      module slot locks the assignment once it sends.

type V2Ctx = {
  db: SupabaseClient;
  now: number;
  v2StartMs: number;
  base: string;
  nextEvent: NextEventInfo | null;
};

type V2Counts = { deferred: number; exited: number };

async function v2Context(supabase: CronClient): Promise<V2Ctx> {
  const db = supabase as unknown as SupabaseClient;
  const siteUrl =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  const now = Date.now();
  return {
    db,
    now,
    v2StartMs: funnelsV2StartMs(),
    base: siteUrl.replace(/\/$/, ""),
    nextEvent: await loadNextEvent(db, now),
  };
}

/** Plan level, seat tier and billing interval for an LS variant id. */
function planFromVariant(variantId: string | null | undefined): {
  level: PlanLevelValue | null;
  seatTier: Tier | null;
  interval: Interval | null;
} {
  if (!variantId) return { level: null, seatTier: null, interval: null };
  const parsed = parseLevelPlan(planForVariantId(variantId));
  return {
    level: planLevelForVariantId(variantId),
    seatTier: parsed?.tier ?? null,
    interval: parsed?.interval ?? null,
  };
}

type V2Step = {
  funnel: EmailFunnel;
  tier: string;
  email: string;
  /** Funnel entry time (ms), for the in-flight rule. */
  entryAtMs: number | null;
  /** How long ago the step became due (age - threshold), for the overdue exemption. */
  overdueMs: number;
  /** Plan level from Lemon Squeezy (trial/pro/upgrade); otherwise read from the subscriber row. */
  lsLevel?: PlanLevelValue | null;
  seatTier?: Tier | null;
  interval?: Interval | null;
  /** Force a base track (upgrade = beginner). */
  forceTrack?: "beginner" | "power";
};

/** What the per-funnel send function gets on top of its normal payload. */
type V2Personal = { contentKey: string; trackVars: TrackVars; modules: ModuleKey[] };

type V2Plan =
  | {
      kind: "send";
      isModuleSlot: boolean;
    } & V2Personal
  | { kind: "exited" }
  | { kind: "deferred" };

/** Steps 1-3: assignment, content key, cadence cap. */
async function v2PlanStep(ctx: V2Ctx, s: V2Step): Promise<V2Plan> {
  const step = findStep(s.funnel, s.tier);
  const slot = step?.slot ?? "base";
  const signals = await loadSubscriberSignals(ctx.db, s.email);
  // A real Beginner/Power variant wins. "legacy" from the variant (pre-split
  // plan, or an id this env does not map) yields to a stored plan_level.
  // For a paying "legacy" subscriber only a strong stored source (ls / comp)
  // may override: a desktop "intent" or inferred level is unauthenticated
  // intake and must never turn a paying customer's copy into Beginner copy.
  const strongStored =
    signals.planLevelSource === "ls" || signals.planLevelSource === "comp" ? signals.planLevel : null;
  const planLevel =
    s.lsLevel && s.lsLevel !== "legacy"
      ? s.lsLevel
      : s.lsLevel === "legacy"
        ? (strongStored ?? "legacy")
        : (signals.planLevel ?? null);
  const track =
    s.forceTrack ??
    selectBase({
      planLevel,
      planLevelSource: s.lsLevel ? "ls" : signals.planLevelSource,
      tags: signals.tags,
      paid: Boolean(s.lsLevel),
    });
  const assignment = await getAssignment(ctx.db, {
    email: s.email,
    funnel: s.funnel,
    computed: { track, modules: rankModules(signals.tags) },
    inFlight: isInFlight(s.entryAtMs, ctx.v2StartMs),
    now: ctx.now,
  });
  if (assignment.exitedAt) return { kind: "exited" };

  const cadence = await canSendLifecycle(ctx.db, s.email, ctx.now, {
    tierIsExempt: isCadenceExemptStep(s.funnel, s.tier, slot),
    overdueMs: s.overdueMs,
  });
  if (!cadence.ok) return { kind: "deferred" };

  const key = contentKeyForStep(
    { tier: s.tier, slot, moduleIndex: step?.moduleIndex },
    { track: assignment.track, modules: assignment.modules },
  );
  const trackVars = buildTrackVars({
    base: assignment.track,
    tags: signals.tags,
    seatTier: s.seatTier ?? null,
    interval: s.interval ?? null,
    nextEvent: ctx.nextEvent,
    site: ctx.base,
    now: ctx.now,
  });
  return {
    kind: "send",
    contentKey: key,
    isModuleSlot: slot === "module",
    trackVars,
    modules: assignment.modules,
  };
}

type V2Outcome = "sent" | "failed" | "deferred" | "exited";

/**
 * Steps 1-4 for one person and step. `send` is the funnel's own send function
 * called with the chosen content key and track vars; it returns true when the
 * send was handled. "deferred" / "exited" mean nothing was sent and the step
 * must NOT be stamped.
 */
async function v2Deliver(
  ctx: V2Ctx,
  s: V2Step,
  send: (personal: V2Personal) => Promise<boolean>,
): Promise<V2Outcome> {
  const plan = await v2PlanStep(ctx, s);
  if (plan.kind !== "send") return plan.kind;
  const ok = await send({ contentKey: plan.contentKey, trackVars: plan.trackVars, modules: plan.modules });
  if (ok && plan.isModuleSlot) await lockAssignment(ctx.db, s.email, s.funnel, ctx.now);
  return ok ? "sent" : "failed";
}

function msOrNull(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// --- Auth ----------------------------------------------------------------

function isAuthorized(request: Request): boolean {
  return verifyBearer(request, "CRON_SECRET");
}

// --- Step A: auto-approve -------------------------------------------------

async function autoApprovePending(supabase: CronClient): Promise<{ approved: number; failed: number }> {
  const cutoff = new Date(Date.now() - APPROVAL_DELAY_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("affiliate_applications")
    .select("user_id")
    .eq("status", "pending")
    .lte("created_at", cutoff)
    .limit(PER_RUN_LIMIT);

  if (error) {
    console.error("cron: pending query failed", error);
    return { approved: 0, failed: 0 };
  }

  const rows = (data ?? []) as { user_id: string }[];
  let approved = 0;
  let failed = 0;

  for (const row of rows) {
    const result = await approveAffiliate({ userId: row.user_id, actor: "auto-cron" });
    if (result.ok) {
      approved += 1;
    } else {
      failed += 1;
      console.error("cron: auto-approve failed", { userId: row.user_id, error: result.error });
    }
  }

  return { approved, failed };
}

// --- Step B: conversion emails -------------------------------------------

type ApprovedAppRow = {
  user_id: string;
  email: string;
  full_name: string;
  reviewed_at: string | null;
  conversion_email_1h_sent_at: string | null;
  conversion_email_3d_sent_at: string | null;
  conversion_email_5d_sent_at: string | null;
  unique_discount_code_50: string | null;
};

async function hasPurchased(supabase: CronClient, userId: string): Promise<boolean> {
  const { data: subData } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("user_id", userId)
    .limit(1);
  if (Array.isArray(subData) && subData.length > 0) return true;

  const { data: orderData } = await supabase
    .from("orders")
    .select("user_id")
    .eq("user_id", userId)
    .limit(1);
  if (Array.isArray(orderData) && orderData.length > 0) return true;

  return false;
}

/**
 * Stamps affiliate_applications.conversion_purchased_at (20261110) with the
 * affiliate's first real purchase after the 1h conversion email: a paid order
 * with a positive total that is not a comp. Trials and free comps never count.
 * Returns how many rows were stamped; 0 when the column is missing or any read
 * fails. Never throws.
 */
async function stampConversionPurchases(supabase: CronClient): Promise<number> {
  const db = supabase as unknown as SupabaseClient;
  try {
    const { data, error } = await db
      .from("affiliate_applications")
      .select("user_id,conversion_email_1h_sent_at")
      .not("conversion_email_1h_sent_at", "is", null)
      .is("conversion_purchased_at", null)
      .gte("conversion_email_1h_sent_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .limit(PER_RUN_LIMIT);
    if (error) return 0; // 20261110 not applied (or transient): skip
    let stamped = 0;
    for (const row of (data ?? []) as { user_id: string | null; conversion_email_1h_sent_at: string }[]) {
      if (!row.user_id) continue;
      const { data: orders, error: oErr } = await db
        .from("orders")
        .select("created_at,total,ls_subscription_id")
        .eq("user_id", row.user_id)
        .eq("status", "paid")
        .gte("created_at", row.conversion_email_1h_sent_at)
        .order("created_at", { ascending: true })
        .limit(10);
      if (oErr) continue;
      const first = ((orders ?? []) as { created_at: string; total: number | string | null; ls_subscription_id: string | null }[]).find(
        (o) => Number(o.total ?? 0) > 0 && !String(o.ls_subscription_id ?? "").startsWith("comp:"),
      );
      if (!first) continue;
      const { error: upErr } = await db
        .from("affiliate_applications")
        .update({ conversion_purchased_at: first.created_at })
        .eq("user_id", row.user_id)
        .is("conversion_purchased_at", null);
      if (!upErr) stamped += 1;
    }
    return stamped;
  } catch (err) {
    console.error("cron: conversion purchase stamp threw", err);
    return 0;
  }
}

function selectTier(
  row: ApprovedAppRow,
  tiers: ReadonlyArray<(typeof TIERS)[number]>,
): (typeof TIERS)[number] | null {
  if (!row.reviewed_at) return null;
  const approvedAt = new Date(row.reviewed_at).getTime();
  if (!Number.isFinite(approvedAt)) return null;
  const age = Date.now() - approvedAt;

  for (const t of tiers) {
    if (age < t.thresholdMs) continue;
    const sent = row[t.sentCol as keyof ApprovedAppRow];
    if (sent) continue;
    return t;
  }
  return null;
}

async function sendTierEmails(supabase: CronClient): Promise<Record<ConversionTier, number>> {
  const counts: Record<ConversionTier, number> = { "1h": 0, "3d": 0, "5d": 0 };

  // Pull approved applications that have at least one pending tier (reviewed
  // longer ago than the smallest effective threshold).
  const overrides = await getFunnelOverrides();
  const tiers = withOverrides(TIERS, "conversion", overrides);
  const oldestPossible = new Date(
    Date.now() - Math.min(...tiers.map((t) => t.thresholdMs)),
  ).toISOString();

  const { data, error } = await supabase
    .from("affiliate_applications")
    .select(
      "user_id,email,full_name,reviewed_at,conversion_email_1h_sent_at,conversion_email_3d_sent_at,conversion_email_5d_sent_at,unique_discount_code_50",
    )
    .eq("status", "approved")
    .lte("reviewed_at", oldestPossible)
    .limit(PER_RUN_LIMIT);

  if (error) {
    console.error("cron: approved query failed", error);
    return counts;
  }

  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const rows = (data ?? []) as ApprovedAppRow[];
  // Funnels v2: step tracking, A/B overlay, track vars and the cadence cap,
  // like every other built-in funnel. Off = the exact pre-v2 payload.
  const v2 = funnelsV2Enabled() ? await v2Context(supabase) : null;

  for (const row of rows) {
    const tier = selectTier(row, tiers);
    if (!tier) continue;

    // Skip if the affiliate has already purchased.
    const purchased = await hasPurchased(supabase, row.user_id);
    if (purchased) continue;

    // Resolve the code for this tier.
    let code: string | null = null;
    const updatePayload: Record<string, unknown> = {
      [tier.sentCol]: new Date().toISOString(),
    };

    if (tier.tier === "5d") {
      // Reuse a previously generated unique code if we have one (idempotency
      // across retries), otherwise mint a new one.
      if (row.unique_discount_code_50) {
        code = row.unique_discount_code_50;
      } else {
        if (!storeId) {
          console.error("cron: LEMONSQUEEZY_STORE_ID not set - skipping 5d for", row.user_id);
          continue;
        }
        const created = await createUniqueDiscount({
          storeId,
          percentOff: 50,
          namePrefix: "AFF50",
        });
        if (!created) {
          console.error("cron: unique discount create failed for", row.user_id);
          continue;
        }
        code = created.code;
        updatePayload.unique_discount_code_50 = code;
      }
    } else {
      code = STATIC_CODES[tier.tier];
    }

    if (!code) continue;

    const conversionPayload = {
      tier: tier.tier,
      to: row.email,
      name: row.full_name,
      code,
    };
    let sent: boolean;
    if (v2) {
      const approvedMs = msOrNull(row.reviewed_at);
      const outcome = await v2Deliver(
        v2,
        {
          funnel: "conversion",
          tier: tier.tier,
          email: row.email,
          entryAtMs: approvedMs,
          overdueMs: approvedMs == null ? 0 : v2.now - approvedMs - tier.thresholdMs,
        },
        (p) => sendConversionEmail({ ...conversionPayload, contentKey: p.contentKey, trackVars: p.trackVars }),
      );
      // "deferred" (cadence cap) / "exited" send nothing and stamp nothing.
      sent = outcome === "sent";
    } else {
      sent = await sendConversionEmail(conversionPayload);
    }

    if (!sent) {
      // If email send failed, don't record the sent-at so we retry next run.
      // But if we minted a new LS discount, still persist it so we don't create
      // a second one.
      if (updatePayload.unique_discount_code_50) {
        await supabase
          .from("affiliate_applications")
          .update({ unique_discount_code_50: updatePayload.unique_discount_code_50 })
          .eq("user_id", row.user_id);
      }
      continue;
    }

    const { error: updateError } = await supabase
      .from("affiliate_applications")
      .update(updatePayload)
      .eq("user_id", row.user_id);

    if (updateError) {
      console.error("cron: tier update failed", { userId: row.user_id, tier: tier.tier, updateError });
      continue;
    }

    counts[tier.tier] += 1;
  }

  return counts;
}

// --- Step C: trial conversion emails --------------------------------------

const TRIAL_DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_TIERS: ReadonlyArray<{
  tier: TrialTier;
  thresholdMs: number;
  sentCol: string;
}> = [
  // Most-aged first so we send the highest matured tier that's still pending.
  // Thresholds derive from TRIAL_LENGTH_DAYS: day13/day14 are the "24 hours
  // left" and "ends tonight" urgency emails; day11 is the personal "3 days left"
  // founder nudge that lands a couple of days before them.
  { tier: "day14", thresholdMs: TRIAL_LENGTH_DAYS * TRIAL_DAY_MS, sentCol: "trial_email_day14_sent_at" },
  { tier: "day13", thresholdMs: (TRIAL_LENGTH_DAYS - 1) * TRIAL_DAY_MS, sentCol: "trial_email_day13_sent_at" },
  { tier: "day11", thresholdMs: (TRIAL_LENGTH_DAYS - 3) * TRIAL_DAY_MS, sentCol: "trial_email_day11_sent_at" },
  { tier: "day7", thresholdMs: 7 * TRIAL_DAY_MS, sentCol: "trial_email_day7_sent_at" },
  { tier: "day3", thresholdMs: 3 * TRIAL_DAY_MS, sentCol: "trial_email_day3_sent_at" },
  { tier: "day1", thresholdMs: 24 * 60 * 60 * 1000, sentCol: "trial_email_day1_sent_at" },
  { tier: "day0", thresholdMs: 5 * 60 * 1000, sentCol: "trial_email_day0_sent_at" },
];

type TrialSubRow = {
  user_id: string;
  status: string | null;
  ls_variant_id: string | null;
  trial_started_at: string | null;
  trial_discount_code_monthly: string | null;
  trial_discount_code_annual: string | null;
  ls_discount_id_monthly: string | null;
  ls_discount_id_annual: string | null;
  trial_email_day0_sent_at: string | null;
  trial_email_day1_sent_at: string | null;
  trial_email_day3_sent_at: string | null;
  trial_email_day7_sent_at: string | null;
  trial_email_day11_sent_at: string | null;
  trial_email_day13_sent_at: string | null;
  trial_email_day14_sent_at: string | null;
};

function selectTrialTier(
  row: TrialSubRow,
  tiers: ReadonlyArray<(typeof TRIAL_TIERS)[number]>,
): (typeof TRIAL_TIERS)[number] | null {
  if (!row.trial_started_at) return null;
  const startedAt = new Date(row.trial_started_at).getTime();
  if (!Number.isFinite(startedAt)) return null;
  const age = Date.now() - startedAt;

  for (const t of tiers) {
    if (age < t.thresholdMs) continue;
    const sent = row[t.sentCol as keyof TrialSubRow];
    if (sent) continue;
    return t;
  }
  return null;
}

type CronRowFetchClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: unknown) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
};

async function fetchUserContact(
  supabase: CronClient,
  userId: string,
): Promise<{ email: string; name: string } | null> {
  const fetchClient = supabase as unknown as CronRowFetchClient;
  const { data } = await fetchClient
    .from("profiles")
    .select("email,full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  const email = typeof data.email === "string" ? data.email : null;
  const full_name = typeof data.full_name === "string" ? data.full_name : "";
  if (!email) return null;
  return { email, name: full_name };
}

async function sendTrialEmails(supabase: CronClient): Promise<Record<TrialTier, number>> {
  const counts: Record<TrialTier, number> = { day0: 0, day1: 0, day3: 0, day7: 0, day11: 0, day13: 0, day14: 0 };

  const siteUrl =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  const subscriptionUrl = `${siteUrl.replace(/\/$/, "")}/dashboard/subscription`;
  const { monthlyPercent, annualPercent } = trialDiscountPercents();
  const annualVariant = process.env.LEMONSQUEEZY_VARIANT_ANNUAL ?? null;

  // Pull trial rows older than the smallest effective threshold, still active or on trial.
  const overrides = await getFunnelOverrides();
  const tiers = withOverrides(TRIAL_TIERS, "trial", overrides);
  const oldest = new Date(Date.now() - Math.min(...tiers.map((t) => t.thresholdMs))).toISOString();

  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "user_id,status,ls_variant_id,trial_started_at,trial_discount_code_monthly,trial_discount_code_annual,ls_discount_id_monthly,ls_discount_id_annual,trial_email_day0_sent_at,trial_email_day1_sent_at,trial_email_day3_sent_at,trial_email_day7_sent_at,trial_email_day11_sent_at,trial_email_day13_sent_at,trial_email_day14_sent_at",
    )
    .lte("trial_started_at", oldest)
    .limit(PER_RUN_LIMIT);

  if (error) {
    console.error("cron: trial query failed", error);
    return counts;
  }

  const rows = (data ?? []) as TrialSubRow[];
  const v2 = funnelsV2Enabled() ? await v2Context(supabase) : null;
  const v2Counts: V2Counts = { deferred: 0, exited: 0 };

  for (const row of rows) {
    if (row.status !== "on_trial" && row.status !== "active") continue;

    const tier = selectTrialTier(row, tiers);
    if (!tier) continue;

    // A trial that already converted to paid (early in-app upgrade, or the
    // natural trial-end charge) must not get the countdown emails: day13 says
    // "your trial ends in about 24 hours" and day14 says "your trial ends
    // today", both wrong for someone already paying. Stamp both columns as
    // handled so the row stops maturing into them on later runs. The earlier
    // onboarding touches (day0/1/3/7) stay eligible for 'active' rows -
    // they're onboarding content, and the pro welcome track deliberately
    // excludes trial converts (see the pro_started_at comment in the LS
    // webhook), so this is their only onboarding sequence.
    if (
      row.status === "active" &&
      (tier.tier === "day11" || tier.tier === "day13" || tier.tier === "day14")
    ) {
      const nowIso = new Date().toISOString();
      await supabase
        .from("subscriptions")
        .update({
          trial_email_day11_sent_at: row.trial_email_day11_sent_at ?? nowIso,
          trial_email_day13_sent_at: row.trial_email_day13_sent_at ?? nowIso,
          trial_email_day14_sent_at: row.trial_email_day14_sent_at ?? nowIso,
        })
        .eq("user_id", row.user_id);
      continue;
    }

    // Skip the day13 annual-switch upsell if the user is already on annual.
    if (tier.tier === "day13" && row.ls_variant_id && annualVariant && String(row.ls_variant_id) === annualVariant) {
      // Mark as "sent" anyway so we don't keep reconsidering this row every run.
      await supabase
        .from("subscriptions")
        .update({ [tier.sentCol]: new Date().toISOString() })
        .eq("user_id", row.user_id);
      continue;
    }

    const contact = await fetchUserContact(supabase, row.user_id);
    if (!contact) continue;

    // Webhook-time minting can fail (missing env vars, LS API error) and
    // used to leave the row permanently without codes: the emails then talked
    // about discount codes that never existed. Re-mint whatever is still
    // missing while the trial is running.
    if (
      row.status === "on_trial" &&
      (!row.trial_discount_code_monthly || !row.trial_discount_code_annual) &&
      // No-stacking: don't back-fill a member code for a customer who already
      // redeemed an affiliate/welcome discount at checkout.
      !(await hasRedeemedDiscount(supabase, row.user_id))
    ) {
      // trial_ends_at isn't stored on the row; the trial is TRIAL_LENGTH_DAYS
      // long (matching the LS SKU trial period), so reconstruct it from
      // trial_started_at.
      const trialEndsAt = row.trial_started_at
        ? new Date(
            new Date(row.trial_started_at).getTime() + TRIAL_LENGTH_DAYS * TRIAL_DAY_MS,
          ).toISOString()
        : null;
      const minted = await mintTrialDiscounts({
        trialEndsAt,
        userId: row.user_id,
        skipMonthly: Boolean(row.trial_discount_code_monthly),
        skipAnnual: Boolean(row.trial_discount_code_annual),
      });
      if (minted) {
        const patch: Record<string, unknown> = {};
        if (minted.trial_discount_code_monthly) {
          patch.trial_discount_code_monthly = minted.trial_discount_code_monthly;
          patch.ls_discount_id_monthly = minted.ls_discount_id_monthly;
          row.trial_discount_code_monthly = minted.trial_discount_code_monthly;
        }
        if (minted.trial_discount_code_annual) {
          patch.trial_discount_code_annual = minted.trial_discount_code_annual;
          patch.ls_discount_id_annual = minted.ls_discount_id_annual;
          row.trial_discount_code_annual = minted.trial_discount_code_annual;
        }
        if (Object.keys(patch).length > 0) {
          // Persist before sending so a failed send can't strand freshly
          // minted LS discounts (same idempotency rule as the 5d tier above).
          const { error: mintError } = await supabase
            .from("subscriptions")
            .update(patch)
            .eq("user_id", row.user_id);
          if (mintError) {
            console.error("cron: trial code persist failed", { userId: row.user_id, mintError });
          }
        }
      }
    }

    const trialPayload = {
      tier: tier.tier,
      to: contact.email,
      name: contact.name,
      monthlyCode: row.trial_discount_code_monthly,
      annualCode: row.trial_discount_code_annual,
      monthlyPercent,
      annualPercent,
      subscriptionUrl,
    };
    let sent: boolean;
    if (v2) {
      const startedMs = msOrNull(row.trial_started_at);
      const plan = planFromVariant(row.ls_variant_id);
      const outcome = await v2Deliver(v2, {
        funnel: "trial",
        tier: tier.tier,
        email: contact.email,
        entryAtMs: startedMs,
        overdueMs: startedMs == null ? 0 : v2.now - startedMs - tier.thresholdMs,
        lsLevel: plan.level,
        seatTier: plan.seatTier,
        interval: plan.interval,
      }, (p) => sendTrialEmail({ ...trialPayload, contentKey: p.contentKey, trackVars: p.trackVars }));
      if (outcome === "deferred" || outcome === "exited") {
        v2Counts[outcome] += 1;
        continue;
      }
      sent = outcome === "sent";
    } else {
      sent = await sendTrialEmail(trialPayload);
    }

    if (!sent) continue;

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({ [tier.sentCol]: new Date().toISOString() })
      .eq("user_id", row.user_id);

    if (updateError) {
      console.error("cron: trial update failed", { userId: row.user_id, tier: tier.tier, updateError });
      continue;
    }

    counts[tier.tier] += 1;
  }

  if (v2) console.info("cron: trial v2", v2Counts);
  return counts;
}

// --- Step D: pro welcome emails (direct subscribers) ----------------------

// Customers who subscribed straight to a paid plan (LS status 'active', no
// free trial). The webhook anchors them with subscriptions.pro_started_at;
// here we send the welcome + nurture sequence. Separate from the trial track
// so direct subscribers never get "your trial is live" / "trial ends today".

const PRO_TIERS: ReadonlyArray<{
  tier: ProTier;
  thresholdMs: number;
  sentCol: string;
}> = [
  // Most-aged first so we send the highest matured tier that's still pending.
  { tier: "day10", thresholdMs: 240 * 60 * 60 * 1000, sentCol: "pro_email_day10_sent_at" },
  { tier: "day5", thresholdMs: 120 * 60 * 60 * 1000, sentCol: "pro_email_day5_sent_at" },
  { tier: "day2", thresholdMs: 48 * 60 * 60 * 1000, sentCol: "pro_email_day2_sent_at" },
  { tier: "day0", thresholdMs: 5 * 60 * 1000, sentCol: "pro_email_day0_sent_at" },
];

type ProSubRow = {
  user_id: string;
  status: string | null;
  plan_name: string | null;
  pro_started_at: string | null;
  pro_email_day0_sent_at: string | null;
  pro_email_day2_sent_at: string | null;
  pro_email_day5_sent_at: string | null;
  pro_email_day10_sent_at: string | null;
  // Funnels v2 only (extended select):
  ls_variant_id?: string | null;
  trial_started_at?: string | null;
  trial_converted_at?: string | null;
};

// Funnels v2: a trial that converted to paid enters Pro welcome at day5 (its
// trial drip already covered day0/day2), anchored on the conversion. Only
// conversions on or after FUNNELS_V2_START count, so past customers are never
// mailed.
const PRO_CONVERTER_TIERS = new Set<ProTier>(["day5", "day10"]);

function isTrialConverter(row: ProSubRow): boolean {
  return Boolean(row.trial_started_at || (!row.pro_started_at && row.trial_converted_at));
}

/** Pro welcome entry time under v2: pro_started_at, else (a trial converter
 * the webhook did not anchor) trial_converted_at. */
function proAnchorIso(row: ProSubRow): string | null {
  return row.pro_started_at ?? row.trial_converted_at ?? null;
}

function selectProTierV2(
  row: ProSubRow,
  tiers: ReadonlyArray<(typeof PRO_TIERS)[number]>,
  v2StartMs: number,
): (typeof PRO_TIERS)[number] | null {
  const anchor = msOrNull(proAnchorIso(row));
  if (anchor == null) return null;
  const converter = isTrialConverter(row);
  if (converter && anchor < v2StartMs) return null;
  const age = Date.now() - anchor;
  for (const t of tiers) {
    if (converter && !PRO_CONVERTER_TIERS.has(t.tier)) continue;
    if (age < t.thresholdMs) continue;
    const sent = row[t.sentCol as keyof ProSubRow];
    if (sent) continue;
    return t;
  }
  return null;
}

const PRO_SELECT =
  "user_id,status,plan_name,pro_started_at,pro_email_day0_sent_at,pro_email_day2_sent_at,pro_email_day5_sent_at,pro_email_day10_sent_at";

/** Funnels v2 pro candidate rows: the usual pro_started_at rows (with
 * ls_variant_id + trial columns) plus trial converters since v2 started that
 * have no pro_started_at. Falls back to the base select on a missing column. */
async function loadProRowsV2(
  supabase: CronClient,
  oldest: string,
  tiers: ReadonlyArray<(typeof PRO_TIERS)[number]>,
  v2StartMs: number,
): Promise<ProSubRow[] | null> {
  const db = supabase as unknown as SupabaseClient;
  const ext = `${PRO_SELECT},ls_variant_id,trial_started_at,trial_converted_at`;
  const main = await db.from("subscriptions").select(ext).lte("pro_started_at", oldest).limit(PER_RUN_LIMIT);
  if (main.error) {
    const base = await db.from("subscriptions").select(PRO_SELECT).lte("pro_started_at", oldest).limit(PER_RUN_LIMIT);
    if (base.error) {
      console.error("cron: pro welcome query failed", base.error);
      return null;
    }
    // Without the trial columns no row reads as a converter: v1 behavior.
    return (base.data ?? []) as unknown as ProSubRow[];
  }
  let rows = (main.data ?? []) as unknown as ProSubRow[];

  const converterTiers = tiers.filter((t) => PRO_CONVERTER_TIERS.has(t.tier));
  if (converterTiers.length > 0) {
    const youngest = new Date(Date.now() - Math.min(...converterTiers.map((t) => t.thresholdMs))).toISOString();
    const conv = await db
      .from("subscriptions")
      .select(ext)
      .is("pro_started_at", null)
      .eq("status", "active")
      .gte("trial_converted_at", new Date(v2StartMs).toISOString())
      .lte("trial_converted_at", youngest)
      .is("pro_email_day10_sent_at", null)
      .limit(PER_RUN_LIMIT);
    if (conv.error) {
      console.error("cron: pro converter query failed", conv.error);
    } else {
      rows = rows.concat((conv.data ?? []) as unknown as ProSubRow[]);
    }
  }
  return rows;
}

function selectProTier(
  row: ProSubRow,
  tiers: ReadonlyArray<(typeof PRO_TIERS)[number]>,
): (typeof PRO_TIERS)[number] | null {
  if (!row.pro_started_at) return null;
  const startedAt = new Date(row.pro_started_at).getTime();
  if (!Number.isFinite(startedAt)) return null;
  const age = Date.now() - startedAt;

  for (const t of tiers) {
    if (age < t.thresholdMs) continue;
    const sent = row[t.sentCol as keyof ProSubRow];
    if (sent) continue;
    return t;
  }
  return null;
}

async function sendProEmails(supabase: CronClient): Promise<Record<ProTier, number>> {
  const counts: Record<ProTier, number> = { day0: 0, day2: 0, day5: 0, day10: 0 };

  const siteUrl =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  const subscriptionUrl = `${siteUrl.replace(/\/$/, "")}/dashboard/subscription`;

  // Pull direct-subscriber rows that are at least day0-old (5 min).
  const overrides = await getFunnelOverrides();
  const tiers = withOverrides(PRO_TIERS, "pro", overrides);
  const oldest = new Date(Date.now() - Math.min(...tiers.map((t) => t.thresholdMs))).toISOString();

  const v2 = funnelsV2Enabled() ? await v2Context(supabase) : null;
  const v2Counts: V2Counts = { deferred: 0, exited: 0 };

  let rows: ProSubRow[];
  if (v2) {
    const loaded = await loadProRowsV2(supabase, oldest, tiers, v2.v2StartMs);
    if (!loaded) return counts;
    rows = loaded;
  } else {
    const { data, error } = await supabase
      .from("subscriptions")
      .select(PRO_SELECT)
      .lte("pro_started_at", oldest)
      .limit(PER_RUN_LIMIT);

    if (error) {
      console.error("cron: pro welcome query failed", error);
      return counts;
    }

    rows = (data ?? []) as ProSubRow[];
  }

  for (const row of rows) {
    // Stop nurturing once the subscription is no longer active (cancelled,
    // past_due, paused). A paid plan that lapses shouldn't keep getting
    // "thanks for subscribing" follow-ups.
    if (row.status !== "active") continue;

    const tier = v2 ? selectProTierV2(row, tiers, v2.v2StartMs) : selectProTier(row, tiers);
    if (!tier) continue;

    const contact = await fetchUserContact(supabase, row.user_id);
    if (!contact) continue;

    const proPayload = {
      tier: tier.tier,
      to: contact.email,
      name: contact.name,
      planName: row.plan_name,
      subscriptionUrl,
    };
    let sent: boolean;
    if (v2) {
      const anchorMs = msOrNull(proAnchorIso(row));
      const plan = planFromVariant(row.ls_variant_id ?? null);
      const outcome = await v2Deliver(v2, {
        funnel: "pro",
        tier: tier.tier,
        email: contact.email,
        entryAtMs: anchorMs,
        overdueMs: anchorMs == null ? 0 : v2.now - anchorMs - tier.thresholdMs,
        lsLevel: plan.level,
        seatTier: plan.seatTier,
        interval: plan.interval,
      }, (p) => sendProEmail({ ...proPayload, contentKey: p.contentKey, trackVars: p.trackVars }));
      if (outcome === "deferred" || outcome === "exited") {
        v2Counts[outcome] += 1;
        continue;
      }
      sent = outcome === "sent";
    } else {
      sent = await sendProEmail(proPayload);
    }

    if (!sent) continue;

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({ [tier.sentCol]: new Date().toISOString() })
      .eq("user_id", row.user_id);

    if (updateError) {
      console.error("cron: pro welcome update failed", { userId: row.user_id, tier: tier.tier, updateError });
      continue;
    }

    counts[tier.tier] += 1;
  }

  if (v2) console.info("cron: pro v2", v2Counts);
  return counts;
}

// --- Step F: free-app onboarding emails -----------------------------------

// People who downloaded the free desktop app and left their email on the
// /downloading interstitial (email_subscribers rows with source = 'download-app').
// They have not entered a card or started a paid trial. This short drip walks
// them from install -> first win -> the Pro upgrade. Anchored on created_at.

const ONBOARDING_SOURCE = "download-app";
// After this many consecutive failed sends we stop retrying a lead and mark it
// abandoned, so one permanently-undeliverable address can't loop forever (a
// single dead address once logged 5,251 failed sends). A later success resets
// the count, so transient Resend hiccups don't burn through the budget.
const MAX_ONBOARDING_SEND_FAILURES = 5;
const ONBOARDING_TIERS: ReadonlyArray<{
  tier: OnboardingTier;
  thresholdMs: number;
  sentCol: string;
}> = [
  // Most-aged first so we send the highest matured tier that's still pending.
  { tier: "day10", thresholdMs: 240 * 60 * 60 * 1000, sentCol: "onboarding_email_day10_sent_at" },
  { tier: "day5", thresholdMs: 120 * 60 * 60 * 1000, sentCol: "onboarding_email_day5_sent_at" },
  { tier: "day2", thresholdMs: 48 * 60 * 60 * 1000, sentCol: "onboarding_email_day2_sent_at" },
  { tier: "day0", thresholdMs: 5 * 60 * 1000, sentCol: "onboarding_email_day0_sent_at" },
];

type OnboardingRow = {
  email: string;
  created_at: string | null;
  onboarding_email_day0_sent_at: string | null;
  onboarding_email_day2_sent_at: string | null;
  onboarding_email_day5_sent_at: string | null;
  onboarding_email_day10_sent_at: string | null;
  onboarding_send_failures: number | null;
};

function selectOnboardingTier(
  row: OnboardingRow,
  tiers: ReadonlyArray<(typeof ONBOARDING_TIERS)[number]>,
): (typeof ONBOARDING_TIERS)[number] | null {
  if (!row.created_at) return null;
  const createdAt = new Date(row.created_at).getTime();
  if (!Number.isFinite(createdAt)) return null;
  const age = Date.now() - createdAt;

  for (const t of tiers) {
    if (age < t.thresholdMs) continue;
    const sent = row[t.sentCol as keyof OnboardingRow];
    if (sent) continue;
    return t;
  }
  return null;
}

// Has this email already become a trial/paid customer? If so we stamp
// onboarding_converted_at and stop the free-app nurture (a paying user should
// not be told to "install the app"). Best-effort: on any lookup error we return
// false (fail open) and just let the drip continue.
async function onboardingLeadConverted(supabase: CronClient, email: string): Promise<boolean> {
  try {
    const fetchClient = supabase as unknown as CronRowFetchClient;
    const { data: profile } = await fetchClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    const userId = profile && typeof profile.id === "string" ? profile.id : null;
    if (!userId) return false;

    const { data: subData } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", userId)
      .limit(1);
    if (!Array.isArray(subData) || subData.length === 0) return false;
    const status = (subData[0] as { status?: string | null }).status ?? "";
    return status === "active" || status === "on_trial" || status === "past_due" || status === "paused";
  } catch (err) {
    console.error("cron: onboarding conversion check threw", err);
    return false;
  }
}

// No-stacking for the static email incentives (FREE_ONBOARDING_DISCOUNT_CODE,
// APP_TRIAL_DISCOUNT_CODE): a lead who was referred by an affiliate (web signup,
// extension or desktop stamp on profiles.ref_*) already has the affiliate's
// discount waiting at checkout, so a second code in the email would stack, or
// pull them off the affiliate's code. Returns null when not referred, "" when
// referred without a recorded code, else the affiliate code. Best-effort: any
// read error reads as "not referred" (the prior behavior).
async function referredAffiliateCodeForEmail(
  supabase: CronClient,
  email: string,
): Promise<string | null> {
  try {
    const fetchClient = supabase as unknown as CronRowFetchClient;
    const { data } = await fetchClient
      .from("profiles")
      .select("ref_affiliate_user_id,ref_affiliate_code")
      .eq("email", email)
      .maybeSingle();
    if (!data) return null;
    const userId = typeof data.ref_affiliate_user_id === "string" ? data.ref_affiliate_user_id : "";
    const code = typeof data.ref_affiliate_code === "string" ? data.ref_affiliate_code.trim() : "";
    if (!userId && !code) return null;
    return code;
  } catch (err) {
    console.error("cron: referred-affiliate lookup threw", err);
    return null;
  }
}

// Pricing link for an email: the static incentive code for organic leads, the
// referring affiliate's own code for referred ones (never both).
function pricingUrlForLead(
  base: string,
  incentiveUrl: string,
  referredCode: string | null,
): string {
  if (referredCode === null) return incentiveUrl;
  return referredCode
    ? `${base}/pricing?code=${encodeURIComponent(referredCode)}`
    : `${base}/pricing`;
}

async function sendFreeOnboardingEmails(supabase: CronClient): Promise<Record<OnboardingTier, number>> {
  const counts: Record<OnboardingTier, number> = { day0: 0, day2: 0, day5: 0, day10: 0 };

  const siteUrl =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  const base = siteUrl.replace(/\/$/, "");
  const helpUrl = `${base}/help`;
  const extensionUrl = `${base}/extension`;

  // Optional static first-timer discount for the day10 upgrade ask. If no code
  // is configured, day10 sends without a code (still a valid email). Set a
  // single reusable LS code (e.g. WELCOME15) and FREE_ONBOARDING_DISCOUNT_CODE /
  // _PERCENT to turn the incentive on - no per-lead LS minting needed.
  const discountCode = process.env.FREE_ONBOARDING_DISCOUNT_CODE || null;
  const discountPercent = Number.parseInt(process.env.FREE_ONBOARDING_DISCOUNT_PERCENT ?? "", 10);
  const pricingUrl = discountCode
    ? `${base}/pricing?code=${encodeURIComponent(discountCode)}`
    : `${base}/pricing`;

  const overrides = await getFunnelOverrides();
  const tiers = withOverrides(ONBOARDING_TIERS, "onboarding", overrides);

  // Wrapped so that if the onboarding columns do not exist yet (prod schema lag
  // before 20260813_free_onboarding_funnel.sql is applied), this step no-ops
  // instead of breaking the rest of the cron.
  try {
    const v2 = funnelsV2Enabled() ? await v2Context(supabase) : null;
    const v2Counts: V2Counts = { deferred: 0, exited: 0 };
    const buildQuery = (supersede: boolean) => {
      let q = supabase
        .from("email_subscribers")
        .select(
          "email,created_at,onboarding_email_day0_sent_at,onboarding_email_day2_sent_at,onboarding_email_day5_sent_at,onboarding_email_day10_sent_at,onboarding_send_failures",
        )
        .eq("source", ONBOARDING_SOURCE)
        .is("unsubscribed_at", null)
        .is("onboarding_converted_at", null)
        // Leads that failed too many times are parked, so a dead address can't
        // hog the per-run budget forever.
        .is("onboarding_abandoned_at", null)
        // Exclude rows that already finished the drip (day10 is the last tier) so
        // the per-run budget goes to leads still in progress.
        .is("onboarding_email_day10_sent_at", null);
      // Funnels v2: the app trial supersedes free onboarding, so a lead who
      // started the desktop app trial leaves this drip (and its budget).
      if (supersede) q = q.is("app_trial_started_at", null);
      return q.limit(PER_RUN_LIMIT);
    };
    let { data, error } = await buildQuery(Boolean(v2));
    if (error && v2) {
      // app_trial_started_at missing (prod lags 20260922): plain v1 pool.
      ({ data, error } = await buildQuery(false));
    }

    if (error) {
      // Missing columns on schema lag land here - log and move on.
      console.error("cron: onboarding query failed (columns may not exist yet)", error);
      return counts;
    }

    const rows = (data ?? []) as OnboardingRow[];

    for (const row of rows) {
      if (!row.email) continue;

      // A reserved test address (e.g. drip-test@example.com) can never be
      // delivered, so every send fails and the lead is re-picked every run.
      // Park it up front instead of burning the retry budget on it. The
      // MAX_ONBOARDING_SEND_FAILURES counter is the backstop for addresses that
      // only turn out to be dead at send time; this catches the ones we can
      // tell are undeliverable before we ever call Resend.
      if (isUndeliverableTestEmail(row.email)) {
        await supabase
          .from("email_subscribers")
          .update({ onboarding_abandoned_at: new Date().toISOString() })
          .eq("email", row.email);
        continue;
      }

      const tier = selectOnboardingTier(row, tiers);
      if (!tier) continue;

      // Stop nurturing anyone who already became a trial/paid customer.
      if (await onboardingLeadConverted(supabase, row.email)) {
        await supabase
          .from("email_subscribers")
          .update({ onboarding_converted_at: new Date().toISOString() })
          .eq("email", row.email);
        continue;
      }

      const referredCode = await referredAffiliateCodeForEmail(supabase, row.email);

      const onboardingPayload = {
        tier: tier.tier,
        to: row.email,
        pricingUrl: pricingUrlForLead(base, pricingUrl, referredCode),
        helpUrl,
        extensionUrl,
        discountCode: referredCode === null ? discountCode : null,
        discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
      };
      let sent: boolean;
      if (v2) {
        const createdMs = msOrNull(row.created_at);
        const outcome = await v2Deliver(v2, {
          funnel: "onboarding",
          tier: tier.tier,
          email: row.email,
          entryAtMs: createdMs,
          overdueMs: createdMs == null ? 0 : v2.now - createdMs - tier.thresholdMs,
        }, (p) => sendOnboardingEmail({ ...onboardingPayload, contentKey: p.contentKey, trackVars: p.trackVars }));
        if (outcome === "deferred" || outcome === "exited") {
          v2Counts[outcome] += 1;
          continue;
        }
        sent = outcome === "sent";
      } else {
        sent = await sendOnboardingEmail(onboardingPayload);
      }

      if (!sent) {
        // Only a successful send stamps the tier, so without this a permanently
        // undeliverable address would be re-picked and re-sent every run
        // forever. Count the failure; once it crosses the cap, park the lead so
        // it drops out of the pool. A transient failure below the cap just waits
        // for the next run.
        const failures = (row.onboarding_send_failures ?? 0) + 1;
        const patch: Record<string, unknown> = { onboarding_send_failures: failures };
        if (failures >= MAX_ONBOARDING_SEND_FAILURES) {
          patch.onboarding_abandoned_at = new Date().toISOString();
        }
        const { error: failError } = await supabase
          .from("email_subscribers")
          .update(patch)
          .eq("email", row.email);
        if (failError) {
          console.error("cron: onboarding failure-count update failed", { email: row.email, failError });
        }
        continue;
      }

      const { error: updateError } = await supabase
        .from("email_subscribers")
        // A good send clears any prior transient-failure streak on this lead.
        .update({ [tier.sentCol]: new Date().toISOString(), onboarding_send_failures: 0 })
        .eq("email", row.email);

      if (updateError) {
        console.error("cron: onboarding update failed", { email: row.email, tier: tier.tier, updateError });
        continue;
      }

      counts[tier.tier] += 1;
    }
    if (v2) console.info("cron: onboarding v2", v2Counts);
  } catch (err) {
    console.error("cron: onboarding step threw", err);
    return counts;
  }

  return counts;
}

// --- Step G: app-trial nurture emails -------------------------------------

// People who installed the desktop app and typed their email into the startup
// walkthrough. The licensing worker forwards them to /api/app-trial/signup,
// which stamps app_trial_started_at. They are on the LOCAL 14-day app trial:
// no card, no Lemon Squeezy subscription, so nothing auto-charges and nothing
// else in this cron would ever reach them. Anchored on app_trial_started_at,
// not created_at, so a long-standing newsletter subscriber who installs today
// starts at day0 instead of maturing straight into the lapsed tail.

const MAX_APP_TRIAL_SEND_FAILURES = 5;
const APP_TRIAL_TIERS: ReadonlyArray<{
  tier: AppTrialTier;
  thresholdMs: number;
  sentCol: string;
}> = [
  // Most-aged first so we send the highest matured tier that is still pending.
  { tier: "day30", thresholdMs: 30 * TRIAL_DAY_MS, sentCol: "app_trial_email_day30_sent_at" },
  { tier: "day21", thresholdMs: 21 * TRIAL_DAY_MS, sentCol: "app_trial_email_day21_sent_at" },
  { tier: "day17", thresholdMs: 17 * TRIAL_DAY_MS, sentCol: "app_trial_email_day17_sent_at" },
  { tier: "day14", thresholdMs: TRIAL_LENGTH_DAYS * TRIAL_DAY_MS, sentCol: "app_trial_email_day14_sent_at" },
  { tier: "day12", thresholdMs: (TRIAL_LENGTH_DAYS - 2) * TRIAL_DAY_MS, sentCol: "app_trial_email_day12_sent_at" },
  { tier: "day10", thresholdMs: 10 * TRIAL_DAY_MS, sentCol: "app_trial_email_day10_sent_at" },
  { tier: "day7", thresholdMs: 7 * TRIAL_DAY_MS, sentCol: "app_trial_email_day7_sent_at" },
  { tier: "day5", thresholdMs: 5 * TRIAL_DAY_MS, sentCol: "app_trial_email_day5_sent_at" },
  { tier: "day3", thresholdMs: 3 * TRIAL_DAY_MS, sentCol: "app_trial_email_day3_sent_at" },
  { tier: "day1", thresholdMs: TRIAL_DAY_MS, sentCol: "app_trial_email_day1_sent_at" },
  { tier: "day0", thresholdMs: 5 * 60 * 1000, sentCol: "app_trial_email_day0_sent_at" },
];

type AppTrialRow = {
  email: string;
  app_trial_started_at: string | null;
  app_trial_email_day0_sent_at: string | null;
  app_trial_email_day1_sent_at: string | null;
  app_trial_email_day3_sent_at: string | null;
  app_trial_email_day5_sent_at: string | null;
  app_trial_email_day7_sent_at: string | null;
  app_trial_email_day10_sent_at: string | null;
  app_trial_email_day12_sent_at: string | null;
  app_trial_email_day14_sent_at: string | null;
  app_trial_email_day17_sent_at: string | null;
  app_trial_email_day21_sent_at: string | null;
  app_trial_email_day30_sent_at: string | null;
  app_trial_send_failures: number | null;
};

function selectAppTrialTier(
  row: AppTrialRow,
  tiers: ReadonlyArray<(typeof APP_TRIAL_TIERS)[number]>,
): (typeof APP_TRIAL_TIERS)[number] | null {
  if (!row.app_trial_started_at) return null;
  const startedAt = new Date(row.app_trial_started_at).getTime();
  if (!Number.isFinite(startedAt)) return null;
  const age = Date.now() - startedAt;

  for (const t of tiers) {
    if (age < t.thresholdMs) continue;
    const sent = row[t.sentCol as keyof AppTrialRow];
    if (sent) continue;
    return t;
  }
  return null;
}

// Like onboardingLeadConverted, but blind to comped subscriptions.
//
// A no-card trial is granted as an in-house comp, which writes a subscriptions
// row with status 'active' and a sentinel ls_subscription_id of 'comp:<uuid>'.
// The plain converted check treats that as a paying customer, so every no-card
// trial would be stamped converted on its first pass and never hear from us,
// which is the exact silence this drip exists to fix. Only a real (non-comp)
// live subscription counts.
async function appTrialLeadConverted(supabase: CronClient, email: string): Promise<boolean> {
  try {
    const fetchClient = supabase as unknown as CronRowFetchClient;
    const { data: profile } = await fetchClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    const userId = profile && typeof profile.id === "string" ? profile.id : null;
    if (!userId) return false;

    const { data: subData } = await supabase
      .from("subscriptions")
      .select("status,ls_subscription_id")
      .eq("user_id", userId)
      .limit(20);
    if (!Array.isArray(subData) || subData.length === 0) return false;

    return subData.some((row) => {
      const r = row as { status?: string | null; ls_subscription_id?: string | null };
      const id = typeof r.ls_subscription_id === "string" ? r.ls_subscription_id : "";
      if (id.startsWith("comp:")) return false;
      const status = r.status ?? "";
      return status === "active" || status === "on_trial" || status === "past_due" || status === "paused";
    });
  } catch (err) {
    console.error("cron: app-trial conversion check threw", err);
    return false;
  }
}

/** Funnels v2: true when the email's only live, non-comp subscription is a
 * Lemon Squeezy trial (status on_trial), i.e. the LS trial superseded the app
 * trial rather than a purchase. Best-effort: false on any error. */
async function appTrialLeadOnLsTrial(supabase: CronClient, email: string): Promise<boolean> {
  try {
    const fetchClient = supabase as unknown as CronRowFetchClient;
    const { data: profile } = await fetchClient.from("profiles").select("id").eq("email", email).maybeSingle();
    const userId = profile && typeof profile.id === "string" ? profile.id : null;
    if (!userId) return false;
    const { data: subData } = await supabase
      .from("subscriptions")
      .select("status,ls_subscription_id")
      .eq("user_id", userId)
      .limit(20);
    if (!Array.isArray(subData)) return false;
    let trial = false;
    for (const row of subData) {
      const r = row as { status?: string | null; ls_subscription_id?: string | null };
      const id = typeof r.ls_subscription_id === "string" ? r.ls_subscription_id : "";
      if (id.startsWith("comp:")) continue;
      if (r.status === "on_trial") trial = true;
      else if (r.status === "active" || r.status === "past_due" || r.status === "paused") return false;
    }
    return trial;
  } catch {
    return false;
  }
}

async function sendAppTrialEmails(supabase: CronClient): Promise<Record<AppTrialTier, number>> {
  const counts: Record<AppTrialTier, number> = {
    day0: 0, day1: 0, day3: 0, day5: 0, day7: 0, day10: 0,
    day12: 0, day14: 0, day17: 0, day21: 0, day30: 0,
  };

  const siteUrl =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  const base = siteUrl.replace(/\/$/, "");
  const helpUrl = `${base}/help`;

  // Optional static discount for the day14 ask, same mechanic as the free-app
  // onboarding drip: set a single reusable Lemon Squeezy code rather than
  // minting one per lead, since these people have no subscription row to hang
  // a unique code on. With no code configured, day14 sends without one.
  const discountCode = process.env.APP_TRIAL_DISCOUNT_CODE || null;
  const parsedPercent = Number.parseInt(process.env.APP_TRIAL_DISCOUNT_PERCENT ?? "", 10);
  const discountPercent = Number.isFinite(parsedPercent) ? parsedPercent : 0;
  const pricingUrl = discountCode
    ? `${base}/pricing?code=${encodeURIComponent(discountCode)}`
    : `${base}/pricing`;

  const overrides = await getFunnelOverrides();
  const tiers = withOverrides(APP_TRIAL_TIERS, "apptrial", overrides);

  // Wrapped so that if the app-trial columns do not exist yet (prod schema lag
  // before 20260922_app_trial_funnel.sql is applied), this step no-ops instead
  // of breaking the rest of the cron.
  try {
    const v2 = funnelsV2Enabled() ? await v2Context(supabase) : null;
    const v2Counts: V2Counts = { deferred: 0, exited: 0 };
    const { data, error } = await supabase
      .from("email_subscribers")
      .select(
        "email,app_trial_started_at,app_trial_email_day0_sent_at,app_trial_email_day1_sent_at,app_trial_email_day3_sent_at,app_trial_email_day5_sent_at,app_trial_email_day7_sent_at,app_trial_email_day10_sent_at,app_trial_email_day12_sent_at,app_trial_email_day14_sent_at,app_trial_email_day17_sent_at,app_trial_email_day21_sent_at,app_trial_email_day30_sent_at,app_trial_send_failures",
      )
      .not("app_trial_started_at", "is", null)
      .is("unsubscribed_at", null)
      .is("app_trial_converted_at", null)
      .is("app_trial_abandoned_at", null)
      // day30 is the last tier, so a row that has had it is finished.
      .is("app_trial_email_day30_sent_at", null)
      .limit(PER_RUN_LIMIT);

    if (error) {
      console.error("cron: app-trial query failed (columns may not exist yet)", error);
      return counts;
    }

    const rows = (data ?? []) as AppTrialRow[];

    for (const row of rows) {
      if (!row.email) continue;

      if (isUndeliverableTestEmail(row.email)) {
        await supabase
          .from("email_subscribers")
          .update({ app_trial_abandoned_at: new Date().toISOString() })
          .eq("email", row.email);
        continue;
      }

      const tier = selectAppTrialTier(row, tiers);
      if (!tier) continue;

      // Stop nurturing anyone who has become a trial/paid customer: the day12
      // and day14 copy tells them their trial is ending, which is wrong for
      // someone who already subscribed.
      if (await appTrialLeadConverted(supabase, row.email)) {
        await supabase
          .from("email_subscribers")
          .update({ app_trial_converted_at: new Date().toISOString() })
          .eq("email", row.email);
        if (v2) {
          // Record WHY they left in the assignment: a Lemon Squeezy trial
          // supersedes the app trial; anything else is a real purchase.
          const lsTrial = await appTrialLeadOnLsTrial(supabase, row.email);
          await exitAssignment(v2.db, {
            email: row.email,
            funnel: "apptrial",
            reason: lsTrial ? "superseded" : "converted",
            now: v2.now,
          });
        }
        continue;
      }

      const referredCode = await referredAffiliateCodeForEmail(supabase, row.email);

      const appTrialPayload = {
        tier: tier.tier,
        to: row.email,
        name: "",
        pricingUrl: pricingUrlForLead(base, pricingUrl, referredCode),
        helpUrl,
        discountCode: referredCode === null ? discountCode : null,
        discountPercent,
      };
      let sent: boolean;
      if (v2) {
        const startedMs = msOrNull(row.app_trial_started_at);
        const outcome = await v2Deliver(v2, {
          funnel: "apptrial",
          tier: tier.tier,
          email: row.email,
          entryAtMs: startedMs,
          overdueMs: startedMs == null ? 0 : v2.now - startedMs - tier.thresholdMs,
        }, (p) => sendAppTrialEmail({ ...appTrialPayload, contentKey: p.contentKey, trackVars: p.trackVars }));
        if (outcome === "deferred" || outcome === "exited") {
          v2Counts[outcome] += 1;
          continue;
        }
        sent = outcome === "sent";
      } else {
        sent = await sendAppTrialEmail(appTrialPayload);
      }

      if (!sent) {
        // Only a successful send stamps the tier, so without a failure counter a
        // permanently undeliverable address would be re-picked every run forever.
        const failures = (row.app_trial_send_failures ?? 0) + 1;
        const patch: Record<string, unknown> = { app_trial_send_failures: failures };
        if (failures >= MAX_APP_TRIAL_SEND_FAILURES) {
          patch.app_trial_abandoned_at = new Date().toISOString();
        }
        const { error: failError } = await supabase
          .from("email_subscribers")
          .update(patch)
          .eq("email", row.email);
        if (failError) {
          console.error("cron: app-trial failure-count update failed", { email: row.email, failError });
        }
        continue;
      }

      const { error: updateError } = await supabase
        .from("email_subscribers")
        // A good send clears any prior transient-failure streak on this lead.
        .update({ [tier.sentCol]: new Date().toISOString(), app_trial_send_failures: 0 })
        .eq("email", row.email);

      if (updateError) {
        console.error("cron: app-trial update failed", { email: row.email, tier: tier.tier, updateError });
        continue;
      }

      counts[tier.tier] += 1;
    }
    if (v2) console.info("cron: app-trial v2", v2Counts);
  } catch (err) {
    console.error("cron: app-trial step threw", err);
    return counts;
  }

  return counts;
}

// --- Step H: Beginner -> Power User upgrade emails (Funnels v2 only) --------

// Paying Beginner subscribers get two nudges toward Power User, counted from
// when their paid plan started (pro_started_at, else trial_converted_at):
// u1 at day 21, u2 at day 35 (upgrade-emails.ts). There are no per-tier
// *_sent_at columns: progress lives in email_funnel_step_sends (20261109),
// which sendUpgradeEmail claims before sending. If that table is missing
// nothing is sent. Exits once the plan is no longer Beginner (variant check
// below). Capped by the 44h cadence rule like every other non-urgent step.

// Past this age there is nothing left to send (u2 + a two-week catch-up), so
// a long-standing Beginner is not blasted on the day v2 turns on.
const UPGRADE_MAX_AGE_MS = 49 * TRIAL_DAY_MS;

type UpgradeSubRow = {
  user_id: string;
  status: string | null;
  ls_variant_id: string | null;
  ls_subscription_id: string | null;
  pro_started_at: string | null;
  trial_converted_at?: string | null;
};

async function sendUpgradeEmails(supabase: CronClient): Promise<Record<UpgradeTier, number>> {
  const counts: Record<UpgradeTier, number> = { u1: 0, u2: 0 };
  const v2 = await v2Context(supabase);
  const v2Counts: V2Counts = { deferred: 0, exited: 0 };
  const db = v2.db;

  // Admin day_offset overrides per tier, as in the other funnels.
  const overrides = await getFunnelOverrides();
  const thresholdsMs: Record<UpgradeTier, number> = { u1: 0, u2: 0 };
  for (const t of UPGRADE_TIERS) {
    thresholdsMs[t.tier] = tierThresholdMs(overrides, UPGRADE_FUNNEL, t.tier, t.dayOffset * TRIAL_DAY_MS);
  }
  const youngest = new Date(v2.now - Math.min(thresholdsMs.u1, thresholdsMs.u2)).toISOString();
  const oldestIso = new Date(v2.now - UPGRADE_MAX_AGE_MS).toISOString();

  try {
    const cols = "user_id,status,ls_variant_id,ls_subscription_id,pro_started_at";
    const direct = await db
      .from("subscriptions")
      .select(cols)
      .eq("status", "active")
      .gte("pro_started_at", oldestIso)
      .lte("pro_started_at", youngest)
      .limit(PER_RUN_LIMIT);
    if (direct.error) {
      console.error("cron: upgrade query failed", direct.error);
      return counts;
    }
    let rows = (direct.data ?? []) as unknown as UpgradeSubRow[];
    // Trial converters the webhook did not anchor with pro_started_at.
    const converted = await db
      .from("subscriptions")
      .select(`${cols},trial_converted_at`)
      .eq("status", "active")
      .is("pro_started_at", null)
      .gte("trial_converted_at", oldestIso)
      .lte("trial_converted_at", youngest)
      .limit(PER_RUN_LIMIT);
    if (!converted.error) rows = rows.concat((converted.data ?? []) as unknown as UpgradeSubRow[]);

    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      // Comps are not paying customers; skip them.
      if ((row.ls_subscription_id ?? "").startsWith("comp:")) continue;
      const plan = planFromVariant(row.ls_variant_id);
      if (plan.level !== "beginner") continue;
      const anchorMs = msOrNull(row.pro_started_at ?? row.trial_converted_at ?? null);
      if (anchorMs == null) continue;

      const contact = await fetchUserContact(supabase, row.user_id);
      if (!contact) continue;
      const email = contact.email.trim().toLowerCase();

      const sent = await loadUpgradeStepsSent(db, email);
      if (!sent) {
        // Progress table missing (20261109 not applied) or unreadable.
        return counts;
      }
      const tier = selectUpgradeTier({ startedAtMs: anchorMs, sent, now: v2.now, thresholdsMs });
      if (!tier) continue;

      let status: string = "";
      const outcome = await v2Deliver(
        v2,
        {
          funnel: UPGRADE_FUNNEL as EmailFunnel,
          tier,
          email,
          // A new funnel: nobody is mid-drip, so the in-flight rule never applies.
          entryAtMs: null,
          overdueMs: v2.now - anchorMs - thresholdsMs[tier],
          lsLevel: plan.level,
          seatTier: plan.seatTier,
          interval: plan.interval,
          forceTrack: "beginner",
        },
        async (p) => {
          const res = await sendUpgradeEmail({
            tier,
            to: email,
            name: contact.name,
            upgradeUrl: `${v2.base}/dashboard/subscription`,
            bookCallUrl: `${v2.base}/dashboard/book`,
            toolsLine: buildUpgradeToolsLine(p.modules),
            contentKey: p.contentKey,
            trackVars: p.trackVars,
            db,
            now: v2.now,
          });
          status = res.status;
          return res.status === "sent";
        },
      );
      if (outcome === "deferred" || outcome === "exited") {
        v2Counts[outcome] += 1;
        continue;
      }
      if (status === "migration_pending") return counts;
      if (outcome === "sent") counts[tier] += 1;
    }
  } catch (err) {
    console.error("cron: upgrade step threw", err);
  }
  console.info("cron: upgrade v2", v2Counts);
  return counts;
}

// --- Step E: housekeeping - prune old webhook delivery logs ----------------

type DeleteClient = {
  from: (table: string) => {
    delete: (opts?: { count?: "exact" }) => {
      lt: (col: string, value: string) => Promise<{ count: number | null; error: unknown }>;
    };
  };
};

/**
 * Deletes webhook_events rows older than the retention window (default 60
 * days, WEBHOOK_EVENTS_RETENTION_DAYS to tune). Indexed range delete; a no-op
 * on most runs. Best-effort: the table may not exist yet (manual prod
 * migrations), which is fine.
 */
async function pruneWebhookEvents(supabase: CronClient): Promise<number> {
  const days = Number.parseInt(process.env.WEBHOOK_EVENTS_RETENTION_DAYS ?? "", 10);
  const retentionDays = Number.isFinite(days) && days > 0 ? days : 60;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  try {
    const client = supabase as unknown as DeleteClient;
    const { count, error } = await client
      .from("webhook_events")
      .delete({ count: "exact" })
      .lt("created_at", cutoff);
    if (error) {
      // Missing table on schema lag lands here - log-and-move-on.
      console.error("cron: webhook_events prune failed", error);
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    console.error("cron: webhook_events prune threw", error);
    return 0;
  }
}

// --- Handler --------------------------------------------------------------

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const approval = await autoApprovePending(supabase);
  const emails = await sendTierEmails(supabase);
  // Funnels v2 (20261110): real purchases for the conversion funnel paid %.
  const conversionPurchasesStamped = await stampConversionPurchases(supabase);
  const trial = await sendTrialEmails(supabase);
  const pro = await sendProEmails(supabase);
  const onboarding = await sendFreeOnboardingEmails(supabase);
  const appTrial = await sendAppTrialEmails(supabase);
  // Funnels v2 only; undefined (dropped from the JSON) when the flag is off.
  const upgrade = funnelsV2Enabled() ? await sendUpgradeEmails(supabase) : undefined;
  // Monthly affiliate swipe-kit. Guarded by an app_config period check inside
  // the runner, so on all but the first run of each month this is a single
  // cheap app_config read that returns "already sent".
  const swipeKit = await runSwipeKitBroadcast(supabase as unknown as SwipeKitDb, new Date());
  const webhookEventsPruned = await pruneWebhookEvents(supabase);

  return NextResponse.json({
    ok: true,
    approval,
    emails,
    conversionPurchasesStamped,
    trial,
    pro,
    onboarding,
    appTrial,
    upgrade,
    swipeKit,
    webhookEventsPruned,
  });
}
