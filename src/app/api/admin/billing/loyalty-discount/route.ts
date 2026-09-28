/**
 * POST /api/admin/billing/loyalty-discount
 *
 * Records a deeper support/loyalty discount for a customer AND, when they were
 * referred by an affiliate, the make-whole adjustment that keeps the affiliate's
 * commission intact. This is the tracking + money-truth half:
 *
 *   1. writes a customer_discount_grants row (what/why/who), and
 *   2. if referred and the price actually drops, an
 *      affiliate_commission_adjustments row for the commission difference at the
 *      referred price over the honored window (default 12 months).
 *
 * It does NOT mutate Lemon Squeezy. LS cannot apply a discount code to an
 * existing subscription (coupons redeem only at checkout), so the operator lowers
 * the price in LS by switching the subscription to a discounted variant (the LS
 * "Expiring Subscription Discounts" workaround). Once they do, the customer's LS
 * invoices reflect it automatically. This route returns the LS deep link + the
 * make-whole amount to PayPal, mirroring the guided-billing pattern.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { asQueryClient, escapeLike } from "@/lib/affiliate-admin";
import { planForVariantId } from "@/lib/lemonsqueezy";
import { planMetaFor } from "@/lib/pricing-constants";
import { resolveRatePercent, resolveDurationMonths, type AffiliateTerms } from "@/lib/affiliate-commissions";
import { computeMakeWhole, makeWholeWindowMonths } from "@/lib/affiliate-adjustments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  email?: unknown;
  lsSubscriptionId?: unknown;
  referredPriceCents?: unknown; // the net the customer pays now (make-whole basis)
  newPriceCents?: unknown; // the target discounted net
  note?: unknown;
  makeWhole?: unknown; // default true when referred
};

type InsertClient = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => {
      select: (cols: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
function intOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Math.round(Number(v));
  return null;
}

type SubRow = {
  id: string | null;
  ls_subscription_id: string | null;
  ls_variant_id: string | number | null;
  status: string | null;
  user_id: string | null;
  ref_affiliate_user_id: string | null;
  ref_affiliate_code: string | null;
};

const SUB_COLS =
  "id,ls_subscription_id,ls_variant_id,status,user_id,ref_affiliate_user_id,ref_affiliate_code";

function rank(status: string | null): number {
  switch (status) {
    case "active":
      return 0;
    case "on_trial":
      return 1;
    case "past_due":
      return 2;
    case "paused":
      return 3;
    default:
      return 4;
  }
}

export async function POST(request: Request) {
  const actor = await requirePermission("billing.comp", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = str(body.email);
  const lsSubscriptionId = str(body.lsSubscriptionId);
  const referredPriceCents = intOrNull(body.referredPriceCents);
  const newPriceCents = intOrNull(body.newPriceCents);
  const note = str(body.note);
  const wantMakeWhole = body.makeWhole !== false;

  if (!email && !lsSubscriptionId) {
    return NextResponse.json({ error: "Provide a customer email or subscription id." }, { status: 400 });
  }
  if (referredPriceCents == null || newPriceCents == null) {
    return NextResponse.json(
      { error: "Provide the current (referred) price and the new price, in cents." },
      { status: 400 },
    );
  }
  if (newPriceCents < 0 || referredPriceCents < 0) {
    return NextResponse.json({ error: "Prices must be non-negative." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const admin = asQueryClient(adminClient);
  // asQueryClient only models select/update; add a minimal insert chain for the
  // two rows we write here (same "cast to a local chainable shape" pattern).
  const inserter = adminClient as unknown as InsertClient;

  // Resolve the subscription (by id, or the customer's most relevant one).
  let sub: SubRow | null = null;
  if (lsSubscriptionId) {
    const { data, error } = await admin.from("subscriptions").select(SUB_COLS).eq("ls_subscription_id", lsSubscriptionId).limit(1);
    if (error) {
      console.error("loyalty-discount: sub lookup failed", error);
      return NextResponse.json({ error: "Subscription lookup failed." }, { status: 500 });
    }
    sub = ((data ?? []) as SubRow[])[0] ?? null;
  } else if (email) {
    const { data: prof, error: profErr } = await admin.from("profiles").select("id").ilike("email", escapeLike(email)).limit(1);
    if (profErr) {
      console.error("loyalty-discount: customer lookup failed", profErr);
      return NextResponse.json({ error: "Customer lookup failed." }, { status: 500 });
    }
    const customerId = Array.isArray(prof) && prof[0]?.id ? (prof[0].id as string) : null;
    if (!customerId) return NextResponse.json({ error: `No account found for ${email}.` }, { status: 404 });
    const { data, error } = await admin.from("subscriptions").select(SUB_COLS).eq("user_id", customerId);
    if (error) {
      console.error("loyalty-discount: subs lookup failed", error);
      return NextResponse.json({ error: "Subscriptions lookup failed." }, { status: 500 });
    }
    sub = ((data ?? []) as SubRow[]).sort((a, b) => rank(a.status) - rank(b.status))[0] ?? null;
  }

  if (!sub || !sub.user_id) {
    return NextResponse.json({ error: "No subscription found for that customer." }, { status: 404 });
  }

  const plan = planForVariantId(sub.ls_variant_id ?? null);
  const meta = planMetaFor(plan);
  const interval: "month" | "year" = meta?.interval ?? "year";
  const listCents = meta?.priceCents ?? null;
  const discountPct =
    referredPriceCents > 0
      ? Math.round(((referredPriceCents - newPriceCents) / referredPriceCents) * 100)
      : null;

  // Resolve the referring affiliate + their terms for the make-whole.
  let affiliate: { userId: string; code: string | null; ratePercent: number; durationMonths: number | null } | null = null;
  if (sub.ref_affiliate_user_id) {
    const { data: affProf } = await admin
      .from("profiles")
      .select("id,affiliate_code,commission_percent,commission_duration_months")
      .eq("id", sub.ref_affiliate_user_id)
      .limit(1);
    const p = Array.isArray(affProf) && affProf[0] ? affProf[0] : null;
    if (p) {
      const terms: AffiliateTerms = {
        commissionPercent:
          typeof p.commission_percent === "number" ? p.commission_percent : null,
        commissionDurationMonths:
          typeof p.commission_duration_months === "number" ? p.commission_duration_months : null,
      };
      affiliate = {
        userId: p.id as string,
        code: str(p.affiliate_code) ?? sub.ref_affiliate_code,
        ratePercent: resolveRatePercent(terms),
        durationMonths: resolveDurationMonths(terms),
      };
    }
  }

  const makeWhole =
    affiliate && wantMakeWhole
      ? computeMakeWhole({
          ratePercent: affiliate.ratePercent,
          referredPriceCents,
          newPriceCents,
          interval,
          windowMonths: makeWholeWindowMonths(affiliate.durationMonths),
        })
      : null;

  const nowIso = new Date().toISOString();
  const period = nowIso.slice(0, 7);

  // 1) Record the customer-side grant. Best-effort: a lagging prod schema
  // (table not yet applied) must not 500 the whole action, so surface a
  // migrationPending flag instead.
  let grantId: string | null = null;
  let migrationPending = false;
  {
    const { data, error } = await inserter
      .from("customer_discount_grants")
      .insert({
        user_id: sub.user_id,
        ls_subscription_id: sub.ls_subscription_id,
        referred_price_cents: referredPriceCents,
        new_price_cents: newPriceCents,
        discount_pct: discountPct,
        label: "Loyalty discount",
        affiliate_user_id: affiliate?.userId ?? null,
        note,
        status: "manual",
        created_by: actor.email ?? actor.userId ?? null,
        created_at: nowIso,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("loyalty-discount: grant insert failed", error);
      migrationPending = true;
    } else {
      grantId = (data?.id as string | undefined) ?? null;
    }
  }

  // 2) Record the affiliate make-whole adjustment (owed), when there's one.
  let adjustmentId: string | null = null;
  if (makeWhole && makeWhole.amountCents > 0 && affiliate) {
    const autoNote =
      `Make-whole for ${email ?? sub.ls_subscription_id ?? "customer"}: loyalty discount lowered net ` +
      `from ${(referredPriceCents / 100).toFixed(2)} to ${(newPriceCents / 100).toFixed(2)} ` +
      `(${affiliate.ratePercent}% x ${makeWhole.billings} billing${makeWhole.billings === 1 ? "" : "s"}).` +
      (note ? ` ${note}` : "");
    const { data, error } = await inserter
      .from("affiliate_commission_adjustments")
      .insert({
        user_id: affiliate.userId,
        amount_cents: makeWhole.amountCents,
        currency: "USD",
        note: autoNote,
        source: "makewhole",
        related_grant_id: grantId,
        related_customer: email ?? sub.ls_subscription_id ?? null,
        period,
        created_by: actor.email ?? actor.userId ?? null,
        created_at: nowIso,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("loyalty-discount: adjustment insert failed", error);
      migrationPending = true;
    } else {
      adjustmentId = (data?.id as string | undefined) ?? null;
    }
  }

  await logAdminAction({
    actor,
    action: "billing.discount.apply",
    targetType: "subscription",
    targetId: sub.ls_subscription_id ?? sub.user_id,
    details: {
      email,
      referredPriceCents,
      newPriceCents,
      discountPct,
      interval,
      affiliateUserId: affiliate?.userId ?? null,
      affiliateCode: affiliate?.code ?? null,
      makeWholeCents: makeWhole?.amountCents ?? 0,
      grantId,
      adjustmentId,
      migrationPending,
    },
  });

  const lsDeepLink = sub.ls_subscription_id
    ? `https://app.lemonsqueezy.com/subscriptions/${sub.ls_subscription_id}`
    : "https://app.lemonsqueezy.com/subscriptions";

  return NextResponse.json({
    ok: !migrationPending,
    migrationPending,
    grantId,
    adjustmentId,
    subscription: { lsSubscriptionId: sub.ls_subscription_id, status: sub.status, interval, listCents },
    discount: { referredPriceCents, newPriceCents, discountPct },
    affiliate: affiliate
      ? { userId: affiliate.userId, code: affiliate.code, ratePercent: affiliate.ratePercent }
      : null,
    makeWhole: makeWhole
      ? {
          amountCents: makeWhole.amountCents,
          perBillingCents: makeWhole.perBillingCents,
          billings: makeWhole.billings,
        }
      : null,
    lsDeepLink,
    instructions:
      "Apply the new price in Lemon Squeezy by switching this subscription to a discounted variant (Modify subscription, without proration). " +
      (makeWhole && makeWhole.amountCents > 0
        ? `Then pay the affiliate their make-whole via PayPal and mark it paid on the Payouts tab.`
        : "No affiliate make-whole is owed for this customer."),
  });
}
