import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { approveAffiliate } from "@/lib/affiliates-approve";
import { sendConversionEmail, type ConversionTier } from "@/lib/conversion-emails";
import { createUniqueDiscount } from "@/lib/lemonsqueezy-discounts";
import { sendTrialEmail, type TrialTier } from "@/lib/trial-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- Constants ------------------------------------------------------------

const APPROVAL_DELAY_MINUTES = 10;
const PER_RUN_LIMIT = 50;

const TIERS: ReadonlyArray<{
  tier: ConversionTier;
  thresholdMs: number;
  sentCol: string;
}> = [
  // Most-aged first — we send the highest tier that's due but not yet sent.
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
    // Without a secret configured we refuse to run — safer than open endpoint.
    console.error("cron: CRON_SECRET not set — refusing to execute");
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

function selectTier(row: ApprovedAppRow): (typeof TIERS)[number] | null {
  if (!row.reviewed_at) return null;
  const approvedAt = new Date(row.reviewed_at).getTime();
  if (!Number.isFinite(approvedAt)) return null;
  const age = Date.now() - approvedAt;

  for (const t of TIERS) {
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
  // more than 1h ago, which is the smallest threshold).
  const oldestPossible = new Date(Date.now() - TIERS[TIERS.length - 1].thresholdMs).toISOString();

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
    const tier = selectTier(row);
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
          console.error("cron: LEMONSQUEEZY_STORE_ID not set — skipping 5d for", row.user_id);
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

const TRIAL_TIERS: ReadonlyArray<{
  tier: TrialTier;
  thresholdMs: number;
  sentCol: string;
}> = [
  // Most-aged first so we send the highest matured tier that's still pending.
  { tier: "day3", thresholdMs: 72 * 60 * 60 * 1000, sentCol: "trial_email_day3_sent_at" },
  { tier: "day2", thresholdMs: 48 * 60 * 60 * 1000, sentCol: "trial_email_day2_sent_at" },
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
  trial_email_day2_sent_at: string | null;
  trial_email_day3_sent_at: string | null;
};

function selectTrialTier(row: TrialSubRow): (typeof TRIAL_TIERS)[number] | null {
  if (!row.trial_started_at) return null;
  const startedAt = new Date(row.trial_started_at).getTime();
  if (!Number.isFinite(startedAt)) return null;
  const age = Date.now() - startedAt;

  for (const t of TRIAL_TIERS) {
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
  const counts: Record<TrialTier, number> = { day0: 0, day1: 0, day2: 0, day3: 0 };

  const siteUrl =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  const subscriptionUrl = `${siteUrl.replace(/\/$/, "")}/dashboard/subscription`;
  const monthlyPercent = readPercentEnv("TRIAL_DISCOUNT_MONTHLY_PERCENT", 20);
  const annualPercent = readPercentEnv("TRIAL_DISCOUNT_ANNUAL_PERCENT", 30);
  const annualVariant = process.env.LEMONSQUEEZY_VARIANT_ANNUAL ?? null;

  // Pull trial rows that are at least day0-old (5 min) and still active or on trial.
  const oldest = new Date(Date.now() - TRIAL_TIERS[TRIAL_TIERS.length - 1].thresholdMs).toISOString();

  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "user_id,status,ls_variant_id,trial_started_at,trial_discount_code_monthly,trial_discount_code_annual,ls_discount_id_monthly,ls_discount_id_annual,trial_email_day0_sent_at,trial_email_day1_sent_at,trial_email_day2_sent_at,trial_email_day3_sent_at",
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

    const tier = selectTrialTier(row);
    if (!tier) continue;

    // Skip day2 annual-switch upsell if the user is already on annual.
    if (tier.tier === "day2" && row.ls_variant_id && annualVariant && String(row.ls_variant_id) === annualVariant) {
      // Mark as "sent" anyway so we don't keep reconsidering this row every run.
      await supabase
        .from("subscriptions")
        .update({ [tier.sentCol]: new Date().toISOString() })
        .eq("user_id", row.user_id);
      continue;
    }

    const contact = await fetchUserContact(supabase, row.user_id);
    if (!contact) continue;

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

function readPercentEnv(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 100) return fallback;
  return parsed;
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

  return NextResponse.json({
    ok: true,
    approval,
    emails,
    trial,
  });
}
