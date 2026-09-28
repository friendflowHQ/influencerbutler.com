// Read-only "customer 360 for email" aggregator behind the admin Emails
// dashboard's customer drawer: everything we know about one address in one
// object - profile, subscription tier/status, suppression, every email sent
// to them, and their position in each lifecycle funnel (trial drip, pro
// welcome, free onboarding, win-back, affiliate conversion, referral).
//
// Modeled on loadComps() (src/lib/comps-data.ts): typed result, every query
// best-effort so one missing table or column (prod schema lags migrations)
// nulls only its own section. Deliberately UNLIKE /api/admin/users/lookup:
// this makes no writes of any kind (no key_hash repair, no LS backfill).

import { createAdminClient } from "@/lib/supabase/admin";
import { tierForSubscriptionStatus, type EntitlementTier } from "@/lib/entitlements";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FunnelStep = { label: string; sentAt: string | null };

export type FunnelProgress = {
  key: "trial" | "pro" | "onboarding" | "winback" | "conversion" | "referral";
  label: string;
  enteredAt: string | null;
  steps: FunnelStep[];
  convertedAt: string | null; // null when the funnel has no conversion marker
  statusLine: string;
};

export type CustomerSendRow = {
  id: string;
  subject: string;
  category: string;
  funnel: string;
  status: string;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  created_at: string;
};

export type CustomerEmailProfile = {
  email: string;
  found: boolean; // a profiles row resolved
  userId: string | null;
  displayName: string | null;
  isAffiliate: boolean;
  affiliateCode: string | null;
  tier: EntitlementTier;
  subscriptionStatus: string | null;
  planName: string | null;
  renewsAt: string | null;
  endsAt: string | null;
  suppressed: { reason: string | null; createdAt: string | null } | null;
  newsletter: {
    source: string | null;
    createdAt: string | null;
    confirmedAt: string | null;
    unsubscribedAt: string | null;
  } | null;
  funnels: FunnelProgress[];
  sends: CustomerSendRow[];
  sendTotals: { total: number; opened: number; clicked: number; bounced: number };
  comps: {
    discountCode: string | null;
    months: number | null;
    issuedAt: string | null;
    expiresAt: string | null;
    activatedAt: string | null;
    source: string | null;
  }[];
  referral: {
    asReferred: {
      status: string | null;
      friendCompIssuedAt: string | null;
    } | null;
    referredCount: number;
    convertedCount: number;
  };
  migrationPending: boolean; // email_sends table missing
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Runs a query thunk, returning null instead of throwing/erroring. */
async function tryQuery<T>(thunk: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await thunk();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function loadCustomerEmailProfile(
  emailRaw: string,
): Promise<CustomerEmailProfile | null> {
  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch (err) {
    console.error("customer-email-profile: no admin client", err);
    return null;
  }

  const email = emailRaw.trim().toLowerCase();

  const result: CustomerEmailProfile = {
    email,
    found: false,
    userId: null,
    displayName: null,
    isAffiliate: false,
    affiliateCode: null,
    tier: "free",
    subscriptionStatus: null,
    planName: null,
    renewsAt: null,
    endsAt: null,
    suppressed: null,
    newsletter: null,
    funnels: [],
    sends: [],
    sendTotals: { total: 0, opened: 0, clicked: 0, bounced: 0 },
    comps: [],
    referral: { asReferred: null, referredCount: 0, convertedCount: 0 },
    migrationPending: false,
  };

  // Batch 1: everything keyed by email address.
  type SendsResult = { rows: CustomerSendRow[]; failed: boolean };
  const [profile, sendsResult, suppression, subscriber, application, referredRow, compRows] =
    await Promise.all([
      tryQuery<Record<string, unknown>>(() =>
        db
          .from("profiles")
          .select("id,email,display_name,is_affiliate,affiliate_code")
          .ilike("email", email)
          .maybeSingle(),
      ),
      (async (): Promise<SendsResult> => {
        try {
          const { data, error } = await db
            .from("email_sends")
            .select(
              "id, subject, category, funnel, status, delivered_at, opened_at, clicked_at, bounced_at, complained_at, created_at",
            )
            .eq("recipient", email)
            .order("created_at", { ascending: false })
            .limit(200);
          if (error) return { rows: [], failed: true };
          return { rows: (data ?? []) as CustomerSendRow[], failed: false };
        } catch {
          return { rows: [], failed: true };
        }
      })(),
      tryQuery<Record<string, unknown>>(() =>
        db.from("email_suppressions").select("reason,created_at").eq("email", email).maybeSingle(),
      ),
      tryQuery<Record<string, unknown>>(() =>
        db
          .from("email_subscribers")
          .select(
            "source,created_at,confirmed_at,unsubscribed_at,onboarding_email_day0_sent_at,onboarding_email_day2_sent_at,onboarding_email_day5_sent_at,onboarding_email_day10_sent_at,onboarding_converted_at",
          )
          .eq("email", email)
          .maybeSingle(),
      ),
      tryQuery<Record<string, unknown>>(() =>
        db
          .from("affiliate_applications")
          .select(
            "created_at,conversion_email_1h_sent_at,conversion_email_3d_sent_at,conversion_email_5d_sent_at",
          )
          .eq("email", email)
          .maybeSingle(),
      ),
      tryQuery<Record<string, unknown>>(() =>
        db
          .from("referrals")
          .select("status,friend_comp_issued_at")
          .eq("referred_email", email)
          .maybeSingle(),
      ),
      tryQuery<Record<string, unknown>[]>(() =>
        db
          .from("comp_grants")
          .select("discount_code,months,issued_at,expires_at,activated_at,source")
          .eq("user_email", email)
          .order("issued_at", { ascending: false }),
      ),
    ]);

  if (profile) {
    result.found = true;
    result.userId = str(profile.id);
    result.displayName = str(profile.display_name);
    result.isAffiliate = profile.is_affiliate === true;
    result.affiliateCode = str(profile.affiliate_code);
  }

  result.sends = sendsResult.rows;
  result.migrationPending = sendsResult.failed;
  result.sendTotals = {
    total: sendsResult.rows.length,
    opened: sendsResult.rows.filter((s) => s.opened_at).length,
    clicked: sendsResult.rows.filter((s) => s.clicked_at).length,
    bounced: sendsResult.rows.filter((s) => s.bounced_at).length,
  };

  if (suppression) {
    result.suppressed = {
      reason: str(suppression.reason),
      createdAt: str(suppression.created_at),
    };
  }

  if (subscriber) {
    result.newsletter = {
      source: str(subscriber.source),
      createdAt: str(subscriber.created_at),
      confirmedAt: str(subscriber.confirmed_at),
      unsubscribedAt: str(subscriber.unsubscribed_at),
    };
  }

  result.comps = (compRows ?? []).map((c) => ({
    discountCode: str(c.discount_code),
    months: typeof c.months === "number" ? c.months : null,
    issuedAt: str(c.issued_at),
    expiresAt: str(c.expires_at),
    activatedAt: str(c.activated_at),
    source: str(c.source),
  }));

  // Batch 2: everything keyed by user id (needs the profiles row).
  let latestSub: Record<string, unknown> | null = null;
  let cancelRow: Record<string, unknown> | null = null;
  let referrerRows: Record<string, unknown>[] | null = null;

  if (result.userId) {
    const userId = result.userId;
    const SUB_FULL =
      "status,plan_name,renews_at,ends_at,created_at,trial_started_at,trial_email_day0_sent_at,trial_email_day1_sent_at,trial_email_day3_sent_at,trial_email_day7_sent_at,trial_email_day13_sent_at,trial_email_day14_sent_at,trial_converted_at,pro_started_at,pro_email_day0_sent_at,pro_email_day2_sent_at,pro_email_day5_sent_at,pro_email_day10_sent_at";
    const SUB_BASE = "status,plan_name,renews_at,ends_at,created_at";
    [latestSub, cancelRow, referrerRows] = await Promise.all([
      (async () => {
        // Drip columns may lag in prod (migrations applied by hand): fall back
        // to the base columns so tier/status still render.
        const full = await tryQuery<Record<string, unknown>[]>(() =>
          db
            .from("subscriptions")
            .select(SUB_FULL)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(5),
        );
        if (full && full.length > 0) return full[0];
        const base = await tryQuery<Record<string, unknown>[]>(() =>
          db
            .from("subscriptions")
            .select(SUB_BASE)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1),
        );
        return base && base.length > 0 ? base[0] : null;
      })(),
      tryQuery<Record<string, unknown>>(() =>
        db
          .from("subscription_cancel_reasons")
          .select(
            "reason,created_at,winback_t1_sent_at,winback_t2_sent_at,winback_t3_sent_at,winback_discount_code,winback_comp_claimed_at",
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
      tryQuery<Record<string, unknown>[]>(() =>
        db.from("referrals").select("status").eq("referrer_user_id", userId),
      ),
    ]);
  }

  if (latestSub) {
    result.subscriptionStatus = str(latestSub.status);
    result.planName = str(latestSub.plan_name);
    result.renewsAt = str(latestSub.renews_at);
    result.endsAt = str(latestSub.ends_at);
  }
  result.tier = tierForSubscriptionStatus(result.subscriptionStatus);

  if (referredRow) {
    result.referral.asReferred = {
      status: str(referredRow.status),
      friendCompIssuedAt: str(referredRow.friend_comp_issued_at),
    };
  }
  if (referrerRows) {
    result.referral.referredCount = referrerRows.length;
    result.referral.convertedCount = referrerRows.filter(
      (r) => str(r.status) === "converted",
    ).length;
  }

  result.funnels = buildFunnels({ latestSub, subscriber, cancelRow, application, referredRow });

  return result;
}

function stepsFrom(
  row: Record<string, unknown> | null,
  entries: { label: string; column: string }[],
): FunnelStep[] {
  return entries.map((e) => ({ label: e.label, sentAt: row ? str(row[e.column]) : null }));
}

function sentCount(steps: FunnelStep[]): number {
  return steps.filter((s) => s.sentAt).length;
}

function buildFunnels(sources: {
  latestSub: Record<string, unknown> | null;
  subscriber: Record<string, unknown> | null;
  cancelRow: Record<string, unknown> | null;
  application: Record<string, unknown> | null;
  referredRow: Record<string, unknown> | null;
}): FunnelProgress[] {
  const funnels: FunnelProgress[] = [];
  const { latestSub, subscriber, cancelRow, application, referredRow } = sources;

  // Trial drip: entered once a trial started.
  const trialStartedAt = latestSub ? str(latestSub.trial_started_at) : null;
  if (trialStartedAt) {
    const steps = stepsFrom(latestSub, [
      { label: "Day 0", column: "trial_email_day0_sent_at" },
      { label: "Day 1", column: "trial_email_day1_sent_at" },
      { label: "Day 3", column: "trial_email_day3_sent_at" },
      { label: "Day 7", column: "trial_email_day7_sent_at" },
      { label: "Day 13", column: "trial_email_day13_sent_at" },
      { label: "Day 14", column: "trial_email_day14_sent_at" },
    ]);
    const convertedAt = latestSub ? str(latestSub.trial_converted_at) : null;
    const status = latestSub ? str(latestSub.status) : null;
    let statusLine: string;
    if (convertedAt) {
      statusLine = `Converted to paid on ${fmtDay(convertedAt)}`;
    } else if (status === "on_trial") {
      const day = Math.min(
        14,
        Math.max(0, Math.floor((Date.now() - new Date(trialStartedAt).getTime()) / DAY_MS)),
      );
      statusLine = `Trial day ${day} of 14, ${sentCount(steps)}/6 drip emails sent, not converted`;
    } else {
      statusLine = `Trial ended without converting (${sentCount(steps)}/6 drip emails sent)`;
    }
    funnels.push({
      key: "trial",
      label: "Trial drip",
      enteredAt: trialStartedAt,
      steps,
      convertedAt,
      statusLine,
    });
  }

  // Pro welcome: entered once a paid plan started. No conversion marker.
  const proStartedAt = latestSub ? str(latestSub.pro_started_at) : null;
  if (proStartedAt) {
    const steps = stepsFrom(latestSub, [
      { label: "Day 0", column: "pro_email_day0_sent_at" },
      { label: "Day 2", column: "pro_email_day2_sent_at" },
      { label: "Day 5", column: "pro_email_day5_sent_at" },
      { label: "Day 10", column: "pro_email_day10_sent_at" },
    ]);
    funnels.push({
      key: "pro",
      label: "Pro welcome",
      enteredAt: proStartedAt,
      steps,
      convertedAt: null,
      statusLine: `${sentCount(steps)}/4 welcome emails sent`,
    });
  }

  // Free-app onboarding: entered once the day-0 email went out.
  const onboardingEnteredAt = subscriber ? str(subscriber.onboarding_email_day0_sent_at) : null;
  if (onboardingEnteredAt) {
    const steps = stepsFrom(subscriber, [
      { label: "Day 0", column: "onboarding_email_day0_sent_at" },
      { label: "Day 2", column: "onboarding_email_day2_sent_at" },
      { label: "Day 5", column: "onboarding_email_day5_sent_at" },
      { label: "Day 10", column: "onboarding_email_day10_sent_at" },
    ]);
    const convertedAt = subscriber ? str(subscriber.onboarding_converted_at) : null;
    funnels.push({
      key: "onboarding",
      label: "Free onboarding",
      enteredAt: onboardingEnteredAt,
      steps,
      convertedAt,
      statusLine: convertedAt
        ? `Converted on ${fmtDay(convertedAt)}`
        : `${sentCount(steps)}/4 onboarding emails sent, not converted`,
    });
  }

  // Win-back: entered once tier 1 went out.
  const winbackEnteredAt = cancelRow ? str(cancelRow.winback_t1_sent_at) : null;
  if (winbackEnteredAt) {
    const steps = stepsFrom(cancelRow, [
      { label: "Day 7", column: "winback_t1_sent_at" },
      { label: "Day 21", column: "winback_t2_sent_at" },
      { label: "Day 45", column: "winback_t3_sent_at" },
    ]);
    const claimedAt = cancelRow ? str(cancelRow.winback_comp_claimed_at) : null;
    const code = cancelRow ? str(cancelRow.winback_discount_code) : null;
    funnels.push({
      key: "winback",
      label: "Win-back",
      enteredAt: winbackEnteredAt,
      steps,
      convertedAt: claimedAt,
      statusLine: claimedAt
        ? `Comp claimed on ${fmtDay(claimedAt)}`
        : `${sentCount(steps)}/3 win-back emails sent${code ? `, code ${code}` : ""}, not claimed`,
    });
  }

  // Affiliate conversion: entered once the application exists. No conversion
  // marker column exists for this funnel (mirrors /api/admin/emails/funnels).
  const applicationAt = application ? str(application.created_at) : null;
  if (applicationAt) {
    const steps = stepsFrom(application, [
      { label: "1 hour", column: "conversion_email_1h_sent_at" },
      { label: "Day 3", column: "conversion_email_3d_sent_at" },
      { label: "Day 5", column: "conversion_email_5d_sent_at" },
    ]);
    funnels.push({
      key: "conversion",
      label: "Affiliate conversion",
      enteredAt: applicationAt,
      steps,
      convertedAt: null,
      statusLine: `${sentCount(steps)}/3 conversion emails sent`,
    });
  }

  // Referral: this address was referred by an existing user.
  if (referredRow) {
    const status = str(referredRow.status);
    const compIssuedAt = str(referredRow.friend_comp_issued_at);
    funnels.push({
      key: "referral",
      label: "Referral (was referred)",
      enteredAt: compIssuedAt,
      steps: [{ label: "Friend comp issued", sentAt: compIssuedAt }],
      convertedAt: status === "converted" ? compIssuedAt : null,
      statusLine: status === "converted" ? "Referral converted" : "Referral pending",
    });
  }

  return funnels;
}
