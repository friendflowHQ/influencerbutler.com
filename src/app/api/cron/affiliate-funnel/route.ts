import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { approveAffiliate } from "@/lib/affiliates-approve";
import { sendConversionEmail, type ConversionTier } from "@/lib/conversion-emails";
import { createUniqueDiscount } from "@/lib/lemonsqueezy-discounts";
import { sendTrialEmail, type TrialTier } from "@/lib/trial-emails";
import { mintTrialDiscounts, trialDiscountPercents } from "@/lib/trial-discounts";
import { sendProEmail, type ProTier } from "@/lib/pro-emails";
import { sendOnboardingEmail, type OnboardingTier } from "@/lib/free-onboarding-emails";
import { runSwipeKitBroadcast, type SwipeKitDb } from "@/lib/affiliate-swipe-kit";
import { TRIAL_LENGTH_DAYS } from "@/lib/pricing-constants";
import { getFunnelOverrides, tierThresholdMs, type FunnelOverride } from "@/lib/funnel-copy";

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

// --- Auth ----------------------------------------------------------------

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Without a secret configured we refuse to run - safer than open endpoint.
    console.error("cron: CRON_SECRET not set - refusing to execute");
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
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

    const sent = await sendConversionEmail({
      tier: tier.tier,
      to: row.email,
      name: row.full_name,
      code,
    });

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
  // left" and "ends tonight" urgency emails, timed to the trial's final days.
  { tier: "day14", thresholdMs: TRIAL_LENGTH_DAYS * TRIAL_DAY_MS, sentCol: "trial_email_day14_sent_at" },
  { tier: "day13", thresholdMs: (TRIAL_LENGTH_DAYS - 1) * TRIAL_DAY_MS, sentCol: "trial_email_day13_sent_at" },
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
  const counts: Record<TrialTier, number> = { day0: 0, day1: 0, day3: 0, day7: 0, day13: 0, day14: 0 };

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
      "user_id,status,ls_variant_id,trial_started_at,trial_discount_code_monthly,trial_discount_code_annual,ls_discount_id_monthly,ls_discount_id_annual,trial_email_day0_sent_at,trial_email_day1_sent_at,trial_email_day3_sent_at,trial_email_day7_sent_at,trial_email_day13_sent_at,trial_email_day14_sent_at",
    )
    .lte("trial_started_at", oldest)
    .limit(PER_RUN_LIMIT);

  if (error) {
    console.error("cron: trial query failed", error);
    return counts;
  }

  const rows = (data ?? []) as TrialSubRow[];

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
    if (row.status === "active" && (tier.tier === "day13" || tier.tier === "day14")) {
      const nowIso = new Date().toISOString();
      await supabase
        .from("subscriptions")
        .update({
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
      (!row.trial_discount_code_monthly || !row.trial_discount_code_annual)
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

    const sent = await sendTrialEmail({
      tier: tier.tier,
      to: contact.email,
      name: contact.name,
      monthlyCode: row.trial_discount_code_monthly,
      annualCode: row.trial_discount_code_annual,
      monthlyPercent,
      annualPercent,
      subscriptionUrl,
    });

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
};

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

  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "user_id,status,plan_name,pro_started_at,pro_email_day0_sent_at,pro_email_day2_sent_at,pro_email_day5_sent_at,pro_email_day10_sent_at",
    )
    .lte("pro_started_at", oldest)
    .limit(PER_RUN_LIMIT);

  if (error) {
    console.error("cron: pro welcome query failed", error);
    return counts;
  }

  const rows = (data ?? []) as ProSubRow[];

  for (const row of rows) {
    // Stop nurturing once the subscription is no longer active (cancelled,
    // past_due, paused). A paid plan that lapses shouldn't keep getting
    // "thanks for subscribing" follow-ups.
    if (row.status !== "active") continue;

    const tier = selectProTier(row, tiers);
    if (!tier) continue;

    const contact = await fetchUserContact(supabase, row.user_id);
    if (!contact) continue;

    const sent = await sendProEmail({
      tier: tier.tier,
      to: contact.email,
      name: contact.name,
      planName: row.plan_name,
      subscriptionUrl,
    });

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

  return counts;
}

// --- Step F: free-app onboarding emails -----------------------------------

// People who downloaded the free desktop app and left their email on the
// /downloading interstitial (email_subscribers rows with source = 'download-app').
// They have not entered a card or started a paid trial. This short drip walks
// them from install -> first win -> the Pro upgrade. Anchored on created_at.

const ONBOARDING_SOURCE = "download-app";
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
    const { data, error } = await supabase
      .from("email_subscribers")
      .select(
        "email,created_at,onboarding_email_day0_sent_at,onboarding_email_day2_sent_at,onboarding_email_day5_sent_at,onboarding_email_day10_sent_at",
      )
      .eq("source", ONBOARDING_SOURCE)
      .is("unsubscribed_at", null)
      .is("onboarding_converted_at", null)
      // Exclude rows that already finished the drip (day10 is the last tier) so
      // the per-run budget goes to leads still in progress.
      .is("onboarding_email_day10_sent_at", null)
      .limit(PER_RUN_LIMIT);

    if (error) {
      // Missing columns on schema lag land here - log and move on.
      console.error("cron: onboarding query failed (columns may not exist yet)", error);
      return counts;
    }

    const rows = (data ?? []) as OnboardingRow[];

    for (const row of rows) {
      if (!row.email) continue;
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

      const sent = await sendOnboardingEmail({
        tier: tier.tier,
        to: row.email,
        pricingUrl,
        helpUrl,
        extensionUrl,
        discountCode,
        discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
      });

      if (!sent) continue;

      const { error: updateError } = await supabase
        .from("email_subscribers")
        .update({ [tier.sentCol]: new Date().toISOString() })
        .eq("email", row.email);

      if (updateError) {
        console.error("cron: onboarding update failed", { email: row.email, tier: tier.tier, updateError });
        continue;
      }

      counts[tier.tier] += 1;
    }
  } catch (err) {
    console.error("cron: onboarding step threw", err);
    return counts;
  }

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
  const trial = await sendTrialEmails(supabase);
  const pro = await sendProEmails(supabase);
  const onboarding = await sendFreeOnboardingEmails(supabase);
  // Monthly affiliate swipe-kit. Guarded by an app_config period check inside
  // the runner, so on all but the first run of each month this is a single
  // cheap app_config read that returns "already sent".
  const swipeKit = await runSwipeKitBroadcast(supabase as unknown as SwipeKitDb, new Date());
  const webhookEventsPruned = await pruneWebhookEvents(supabase);

  return NextResponse.json({
    ok: true,
    approval,
    emails,
    trial,
    pro,
    onboarding,
    swipeKit,
    webhookEventsPruned,
  });
}
