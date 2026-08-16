/**
 * GET /api/admin/emails/funnels
 *
 * Funnel conversion counts for the email drip sequences, computed from the
 * per-funnel sent-at / converted-at columns that already exist on business
 * tables. Because those columns predate the email_sends log, this view covers
 * ALL history, not just sends since the analytics deploy. Each funnel is
 * best-effort: a failed query (e.g. migration not applied) nulls that funnel
 * instead of failing the page.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type FunnelStats = {
  key: string;
  label: string;
  enteredLabel: string;
  convertedLabel: string | null;
  entered: number;
  converted: number | null;
};

async function countRows(
  db: SupabaseClient,
  table: string,
  notNullColumn: string,
): Promise<number | null> {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .not(notNullColumn, "is", null);
  if (error) {
    console.error(`admin emails/funnels: count failed for ${table}.${notNullColumn}`, error);
    return null;
  }
  return count ?? 0;
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const [
    trialEntered,
    trialConverted,
    onboardingEntered,
    onboardingConverted,
    winbackEntered,
    winbackConverted,
    conversionEntered,
  ] = await Promise.all([
    countRows(db, "subscriptions", "trial_email_day0_sent_at"),
    countRows(db, "subscriptions", "trial_converted_at"),
    countRows(db, "email_subscribers", "onboarding_email_day0_sent_at"),
    countRows(db, "email_subscribers", "onboarding_converted_at"),
    countRows(db, "subscription_cancel_reasons", "winback_t1_sent_at"),
    countRows(db, "subscription_cancel_reasons", "winback_comp_claimed_at"),
    countRows(db, "affiliate_applications", "conversion_email_1h_sent_at"),
  ]);

  const funnels: FunnelStats[] = [
    {
      key: "trial",
      label: "Trial drip",
      enteredLabel: "trials emailed",
      convertedLabel: "converted to paid",
      entered: trialEntered ?? 0,
      converted: trialConverted,
    },
    {
      key: "onboarding",
      label: "Free onboarding",
      enteredLabel: "downloads emailed",
      convertedLabel: "converted",
      entered: onboardingEntered ?? 0,
      converted: onboardingConverted,
    },
    {
      key: "winback",
      label: "Win-back",
      enteredLabel: "churned emailed",
      convertedLabel: "comp claimed",
      entered: winbackEntered ?? 0,
      converted: winbackConverted,
    },
    {
      key: "conversion",
      label: "Affiliate conversion",
      enteredLabel: "affiliates emailed",
      // No converted-at column exists for this funnel; sends-only for v1.
      convertedLabel: null,
      entered: conversionEntered ?? 0,
      converted: null,
    },
  ];

  return NextResponse.json({ funnels });
}
