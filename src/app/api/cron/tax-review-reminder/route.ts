/**
 * GET /api/cron/tax-review-reminder
 *
 * Month-end nudge to the owner: on the LAST day of the month (~5pm Mountain),
 * email the list of tax forms still pending review, plus payouts held over the
 * auto-pay cap, so everything can be verified before the 1st-of-month
 * commission-statements + affiliate-autopay runs pay affiliates.
 *
 * Scheduling: Vercel crons are UTC, so vercel.json fires this at 23:00 UTC on
 * days 28-31 and the route itself keeps only the invocation where the local
 * (America/Denver) date is the last day of its month. 23:00 UTC = 5pm MDT /
 * 4pm MST; the 1-hour DST drift is accepted, like the other daily crons.
 *
 * Sends only when actionable (pending forms or held-over-cap payouts) unless
 * TAX_REVIEW_REMINDER_ALWAYS="true". An app_config marker
 * (tax_review_reminder_<YYYY-MM>) stops a same-day retry from double-emailing.
 * ?dry=1 previews without sending; ?force=1 skips the last-day gate for
 * testing. Gated on CRON_SECRET like the other crons.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";
import { loadReadiness, partitionAutopay } from "@/lib/affiliate-readiness";
import { payoutMinimumCents } from "@/lib/paypal-payouts";
import { isAutopayArmed, autopayCapCents } from "@/lib/affiliate-autopay-state";
import { localParts, DEFAULT_DIGEST_TIMEZONE } from "@/lib/daily-digest";
import { loadPendingTaxForms } from "@/lib/tax-review-pending";
import {
  isLastDayOfLocalMonth,
  sendTaxReviewReminder,
  type TaxReviewPendingRow,
  type TaxReviewContextRow,
} from "@/lib/tax-review-reminder-email";
import { formatUsdFromCents } from "@/lib/affiliates";
import type { AffiliateStatement } from "@/lib/affiliate-commissions-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("tax-review-reminder cron: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

function displayName(s: AffiliateStatement): string {
  return s.fullName || s.email || s.affiliateCode || s.userId;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

type ConfigClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
};

async function alreadyRan(monthKey: string): Promise<boolean> {
  const db = createAdminClient() as unknown as ConfigClient | null;
  if (!db) return false;
  try {
    const { data } = await db
      .from("app_config")
      .select("value")
      .eq("key", `tax_review_reminder_${monthKey}`)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

async function markRan(monthKey: string, summary: Record<string, unknown>): Promise<void> {
  const db = createAdminClient() as unknown as ConfigClient | null;
  if (!db) return;
  await db.from("app_config").upsert(
    {
      key: `tax_review_reminder_${monthKey}`,
      value: { ran_at: new Date().toISOString(), ...summary },
      updated_at: new Date().toISOString(),
      updated_by: "cron:tax-review-reminder",
    },
    { onConflict: "key" },
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const dry = params.get("dry") === "1";
  const force = params.get("force") === "1";

  const parts = localParts(new Date(), DEFAULT_DIGEST_TIMEZONE);
  if (!force && !isLastDayOfLocalMonth(parts)) {
    return NextResponse.json({ ok: true, ran: false, reason: "not-last-day" });
  }

  const monthKey = `${parts.year}-${pad2(parts.month)}`;
  if (!dry && (await alreadyRan(monthKey))) {
    return NextResponse.json({ ok: true, ran: false, reason: "already-ran", monthKey });
  }

  // Tomorrow (the 1st) starts next month's payout period.
  const period =
    parts.month === 12 ? `${parts.year + 1}-01` : `${parts.year}-${pad2(parts.month + 1)}`;

  const admin = createAdminClient();
  const armed = await isAutopayArmed(admin);
  const cap = autopayCapCents();
  const min = payoutMinimumCents();

  const pendingForms = await loadPendingTaxForms();

  const result = await loadAffiliateCommissions({ onlyOwed: true });
  if (!result) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const readiness = await loadReadiness(result.statements.map((s) => s.userId));
  const { heldOverCap, notReady } = partitionAutopay(result.statements, readiness, {
    minCents: min,
    capCents: cap,
  });
  const payableByUser = new Map(result.statements.map((s) => [s.userId, s.payableCents]));

  const pending: TaxReviewPendingRow[] = pendingForms.map((p) => ({
    name: p.name || p.legalName || p.email || p.userId,
    email: p.email,
    formType: p.formType,
    submittedAt: p.submittedAt,
    payableCents: payableByUser.get(p.userId) ?? null,
  }));

  const heldRows: TaxReviewContextRow[] = heldOverCap.map((s) => ({
    name: displayName(s),
    payableCents: s.payableCents,
    detail: `over the ${formatUsdFromCents(cap)} auto-pay cap`,
  }));

  // Affiliate-side blockers only: someone whose form is submitted-and-waiting is
  // the ADMIN's task (already listed above), not an affiliate follow-up.
  const pendingIds = new Set(pendingForms.map((p) => p.userId));
  const notReadyRows: TaxReviewContextRow[] = notReady
    .filter((nr) => !pendingIds.has(nr.statement.userId))
    .map((nr) => ({
      name: displayName(nr.statement),
      payableCents: nr.statement.payableCents,
      detail: `missing ${[nr.missingTax ? "tax form" : null, nr.missingPaypal ? "PayPal email" : null]
        .filter(Boolean)
        .join(" + ")}`,
    }));

  const always = process.env.TAX_REVIEW_REMINDER_ALWAYS === "true";
  const actionable = pending.length > 0 || heldRows.length > 0;

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      monthKey,
      period,
      armed,
      actionable,
      pending,
      heldOverCap: heldRows,
      notReady: notReadyRows,
    });
  }

  if (!actionable && !always) {
    return NextResponse.json({ ok: true, ran: false, reason: "nothing-actionable", monthKey });
  }

  const sent = await sendTaxReviewReminder({
    period,
    armed,
    pending,
    heldOverCap: heldRows,
    notReady: notReadyRows,
  });

  await markRan(monthKey, {
    sent,
    pending: pending.length,
    heldOverCap: heldRows.length,
    notReady: notReadyRows.length,
  });

  return NextResponse.json({
    ok: true,
    ran: true,
    monthKey,
    period,
    sent,
    pending: pending.length,
    heldOverCap: heldRows.length,
    notReady: notReadyRows.length,
  });
}
