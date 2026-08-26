/**
 * GET /api/cron/affiliate-autopay
 *
 * Monthly affiliate auto-pay. Pays each eligible affiliate the amount that is
 * currently PAYABLE (cleared past the 14-day hold + recognized; annual amortized
 * 1/12 per month), via the existing disburseAffiliate money path. Emails the
 * owner a summary of what was paid / held / not ready, and each paid affiliate
 * gets a receipt from applyPayoutStatus when PayPal confirms.
 *
 * Shadow-first: with AFFILIATE_AUTOPAY_ENABLED != "true" (the default) it moves
 * NO money - it just emails the owner a preview of what it WOULD pay. Flip the
 * env var to "true" to arm it after reviewing a shadow run.
 *
 * Safety:
 *  - Anything over AFFILIATE_AUTOPAY_CAP_CENTS (default $200) is HELD for a
 *    manual Disburse rather than auto-paid.
 *  - disburseAffiliate re-enforces every gate (verified tax + PayPal + $10 min)
 *    and is idempotent via a per-affiliate-per-month UNIQUE sender_batch_id, so a
 *    same-month re-run collides instead of paying twice.
 *  - An app_config marker (affiliate_autopay_<period>) stops a same-day retry
 *    from re-emailing / re-looping. Add ?dry=1 to preview without sending.
 * Gated on CRON_SECRET like the other crons.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";
import { loadReadiness, partitionAutopay } from "@/lib/affiliate-readiness";
import { disburseAffiliate, payoutMinimumCents } from "@/lib/paypal-payouts";
import { sendPayoutsDueDigest, type PayoutDigestRow } from "@/lib/payout-digest-email";
import type { AffiliateStatement } from "@/lib/affiliate-commissions-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("affiliate-autopay cron: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function capCents(): number {
  const raw = Number(process.env.AFFILIATE_AUTOPAY_CAP_CENTS);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 20000; // $200 default
}

function isArmed(): boolean {
  return process.env.AFFILIATE_AUTOPAY_ENABLED === "true";
}

function displayName(s: AffiliateStatement): string {
  return s.fullName || s.email || s.affiliateCode || s.userId;
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

async function alreadyRan(period: string): Promise<boolean> {
  const db = createAdminClient() as unknown as ConfigClient | null;
  if (!db) return false;
  try {
    const { data } = await db
      .from("app_config")
      .select("value")
      .eq("key", `affiliate_autopay_${period}`)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

async function markRan(period: string, summary: Record<string, unknown>): Promise<void> {
  const db = createAdminClient() as unknown as ConfigClient | null;
  if (!db) return;
  await db.from("app_config").upsert(
    {
      key: `affiliate_autopay_${period}`,
      value: { ran_at: new Date().toISOString(), ...summary },
      updated_at: new Date().toISOString(),
      updated_by: "cron:affiliate-autopay",
    },
    { onConflict: "key" },
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const period = currentPeriod();
  const armed = isArmed();
  const cap = capCents();
  const min = payoutMinimumCents();

  if (!dry && (await alreadyRan(period))) {
    return NextResponse.json({ ok: true, ran: false, reason: "already-ran", period });
  }

  const result = await loadAffiliateCommissions({ onlyOwed: true });
  if (!result) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const readiness = await loadReadiness(result.statements.map((s) => s.userId));
  const { toPay, heldOverCap, notReady } = partitionAutopay(result.statements, readiness, {
    minCents: min,
    capCents: cap,
  });

  const rows: PayoutDigestRow[] = [];
  const admin = createAdminClient();

  // Auto-pay the eligible, under-cap affiliates (only when armed and not a dry run).
  let paidCount = 0;
  let paidCents = 0;
  const failed: { userId: string; error: string }[] = [];
  for (const s of toPay) {
    const paypalEmail = readiness.get(s.userId)?.paypalEmail ?? null;
    if (!armed || dry || !admin) {
      rows.push({ name: displayName(s), payableCents: s.payableCents, paypalEmail, status: "would-pay" });
      continue;
    }
    const outcome = await disburseAffiliate({
      admin,
      actorEmail: "cron:auto-pay",
      userId: s.userId,
      period,
    });
    if (outcome.ok) {
      paidCount += 1;
      paidCents += outcome.grossCents;
      rows.push({ name: displayName(s), payableCents: outcome.grossCents, paypalEmail, status: "paid" });
    } else if (outcome.code === "already_disbursed") {
      // A payout for this affiliate+month already exists (idempotent re-run).
      rows.push({
        name: displayName(s),
        payableCents: s.payableCents,
        paypalEmail,
        status: "paid",
        detail: "already sent this month",
      });
    } else {
      failed.push({ userId: s.userId, error: outcome.error });
      rows.push({
        name: displayName(s),
        payableCents: s.payableCents,
        paypalEmail,
        status: "failed",
        detail: outcome.error,
      });
    }
  }

  for (const s of heldOverCap) {
    rows.push({
      name: displayName(s),
      payableCents: s.payableCents,
      paypalEmail: readiness.get(s.userId)?.paypalEmail ?? null,
      status: "held",
      detail: `over ${cap / 100} cap`,
    });
  }
  for (const nr of notReady) {
    const missing = [nr.missingTax ? "tax form" : null, nr.missingPaypal ? "PayPal email" : null]
      .filter(Boolean)
      .join(" + ");
    rows.push({
      name: displayName(nr.statement),
      payableCents: nr.statement.payableCents,
      paypalEmail: readiness.get(nr.statement.userId)?.paypalEmail ?? null,
      status: "not-ready",
      detail: `missing ${missing}`,
    });
  }

  if (dry) {
    return NextResponse.json({ ok: true, dry: true, armed, period, cap, min, rows });
  }

  const digestSent = await sendPayoutsDueDigest(rows, { armed, period, capCents: cap });

  await markRan(period, {
    armed,
    toPay: toPay.length,
    heldOverCap: heldOverCap.length,
    notReady: notReady.length,
    paidCount,
    paidCents,
    failedCount: failed.length,
    digestSent,
  });

  return NextResponse.json({
    ok: true,
    ran: true,
    armed,
    period,
    paidCount,
    paidCents,
    heldOverCap: heldOverCap.length,
    notReady: notReady.length,
    failed,
    digestSent,
  });
}
