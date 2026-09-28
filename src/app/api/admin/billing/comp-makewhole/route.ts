/**
 * POST /api/admin/billing/comp-makewhole
 *
 * Compensate a referring affiliate when their referred customer is COMPED (their
 * paid subscription is cancelled and replaced with a free 100%-off comp). Lemon
 * Squeezy stops paying commission the moment the paid sub ends, and comps produce
 * no paid orders, so the affiliate silently stops earning. This records the
 * amount we owe them for the comp period so it flows into the Owed / Payouts tab
 * and settles via the existing "mark make-whole paid" action (1099 / Xero).
 *
 * The math reuses computeMakeWhole with newPrice = 0 (the comp is fully free):
 *
 *   payableMonths = min(compMonths, affiliateWindow - monthsAlreadyPaid)
 *   amount        = ratePercent% x referredMonthlyPrice x payableMonths
 *
 * payableMonths is bounded to the affiliate's REMAINING commission window so we
 * never pay past their normal duration or double-count months they already
 * earned on real paid orders. affiliateWindow caps at 12 (makeWholeWindowMonths);
 * an admin can add a manual adjustment for a longer/lifetime deal.
 *
 * Unlike loyalty-discount, this does NOT require a live subscription (the paid one
 * is gone) and takes the affiliate explicitly (referred customers are often still
 * "attribution pending", so ref_affiliate_user_id may be unstamped).
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { asQueryClient, escapeLike, resolveAdminAffiliate } from "@/lib/affiliate-admin";
import { planForVariantId } from "@/lib/lemonsqueezy";
import { planMetaFor } from "@/lib/pricing-constants";
import { resolveRatePercent, resolveDurationMonths, type AffiliateTerms } from "@/lib/affiliate-commissions";
import { computeMakeWhole, makeWholeWindowMonths, compMakeWholePayableMonths } from "@/lib/affiliate-adjustments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = {
  email?: unknown;
  userId?: unknown;
  affiliateCode?: unknown;
  affiliateUserId?: unknown;
  referredMonthlyCents?: unknown;
  compMonths?: unknown;
  note?: unknown;
  /** 'monthly' (default) spreads the make-whole into one adjustment per remaining
   *  month; 'lump' records a single adjustment for the whole amount. */
  schedule?: unknown;
};

/** Advance a 'YYYY-MM' period by `months`, staying in that format. */
function addMonthsToPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return period;
  const zero = y * 12 + (m - 1) + months;
  const yy = Math.floor(zero / 12);
  const mm = (zero % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}`;
}

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
  ls_variant_id: string | number | null;
  status: string | null;
  ref_affiliate_user_id: string | null;
  ref_affiliate_code: string | null;
};

type OrderRow = { status?: string | null; total?: number | null; created_at?: string | null };
type CompGrantRow = {
  months?: number | null;
  issued_at?: string | null;
  expires_at?: string | null;
  cancelled_at?: string | null;
};

async function resolveCustomerId(
  admin: ReturnType<typeof asQueryClient>,
  email: string | null,
  bodyUserId: string | null,
): Promise<string | null> {
  if (bodyUserId && UUID_RE.test(bodyUserId)) return bodyUserId;
  if (!email) return null;
  const { data } = await admin.from("profiles").select("id").ilike("email", escapeLike(email)).limit(1);
  return Array.isArray(data) && data[0]?.id ? (data[0].id as string) : null;
}

/**
 * GET ?email=&userId= -> suggested prefill for the form (no write):
 *   - referredMonthlyCents: the customer's most recent real paid charge, the
 *     natural commission basis.
 *   - compMonths: the length of their active in-house comp (from comp_grants).
 *   - monthsAlreadyPaid: paid orders count, so the UI can say how many months
 *     will be deducted before the operator hits record.
 */
export async function GET(request: Request) {
  const actor = await requirePermission("billing.comp", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const email = str(url.searchParams.get("email"));
  const bodyUserId = str(url.searchParams.get("userId"));

  const adminClient = createAdminClient();
  if (!adminClient) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const admin = asQueryClient(adminClient);

  const customerId = await resolveCustomerId(admin, email, bodyUserId);
  if (!customerId) return NextResponse.json({ found: false });

  const { data: ordersData } = await admin
    .from("orders")
    .select("status,total,created_at")
    .eq("user_id", customerId);
  const paidOrders = ((ordersData ?? []) as OrderRow[])
    .filter((o) => (o.status ?? "").toLowerCase() === "paid" && (o.total ?? 0) > 0)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const referredMonthlyCents = paidOrders[0]?.total ?? null;
  const monthsAlreadyPaid = paidOrders.length;

  // The active in-house comp's length, from comp_grants (months, else derived
  // from the issued->expires span). Best-effort: a missing table just yields null.
  let compMonths: number | null = null;
  try {
    const { data: grants } = await admin
      .from("comp_grants")
      .select("months,issued_at,expires_at,cancelled_at")
      .eq("user_id", customerId);
    const active = ((grants ?? []) as CompGrantRow[]).filter((g) => !g.cancelled_at);
    const g = active[0] ?? null;
    if (g) {
      if (typeof g.months === "number" && g.months > 0) {
        compMonths = g.months;
      } else if (g.issued_at && g.expires_at) {
        const ms = new Date(g.expires_at).getTime() - new Date(g.issued_at).getTime();
        if (Number.isFinite(ms) && ms > 0) {
          compMonths = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24 * 30.44)));
        }
      }
    }
  } catch (error) {
    console.error("comp-makewhole GET: comp_grants read failed", error);
  }

  return NextResponse.json({
    found: true,
    referredMonthlyCents,
    compMonths,
    monthsAlreadyPaid,
  });
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
  const bodyUserId = str(body.userId);
  const affiliateCode = str(body.affiliateCode);
  const affiliateUserId = str(body.affiliateUserId);
  const referredMonthlyCents = intOrNull(body.referredMonthlyCents);
  const compMonths = intOrNull(body.compMonths);
  const note = str(body.note);
  const schedule: "monthly" | "lump" = str(body.schedule) === "lump" ? "lump" : "monthly";

  if (!email && !bodyUserId) {
    return NextResponse.json({ error: "Provide the customer's email or userId." }, { status: 400 });
  }
  if (referredMonthlyCents == null || referredMonthlyCents <= 0) {
    return NextResponse.json({ error: "Provide the referred monthly price (in cents)." }, { status: 400 });
  }
  if (compMonths == null || compMonths <= 0) {
    return NextResponse.json({ error: "Provide the comp length in months." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const admin = asQueryClient(adminClient);
  const inserter = adminClient as unknown as InsertClient;
  const deleter = adminClient as unknown as {
    from: (t: string) => { delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> } };
  };

  // Resolve the customer.
  let customerId = bodyUserId && UUID_RE.test(bodyUserId) ? bodyUserId : null;
  if (!customerId && email) {
    const { data: prof, error } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", escapeLike(email))
      .limit(1);
    if (error) {
      console.error("comp-makewhole: customer lookup failed", error);
      return NextResponse.json({ error: "Customer lookup failed." }, { status: 500 });
    }
    customerId = Array.isArray(prof) && prof[0]?.id ? (prof[0].id as string) : null;
  }
  if (!customerId) {
    return NextResponse.json({ error: `No account found for ${email ?? bodyUserId}.` }, { status: 404 });
  }

  // The customer's subscriptions: used to derive the referred plan's interval and
  // to fall back to the (possibly cancelled) sub's affiliate when none is passed.
  const { data: subsData, error: subsErr } = await admin
    .from("subscriptions")
    .select("ls_variant_id,status,ref_affiliate_user_id,ref_affiliate_code")
    .eq("user_id", customerId);
  if (subsErr) {
    console.error("comp-makewhole: subscriptions lookup failed", subsErr);
    return NextResponse.json({ error: "Subscriptions lookup failed." }, { status: 500 });
  }
  const subs = (subsData ?? []) as unknown as SubRow[];
  const referredSub = subs.find((s) => str(s.ref_affiliate_user_id)) ?? subs[0] ?? null;

  // Interval of the plan they were referred on (monthly by default). Only annual
  // changes how many months a real order already covered.
  const plan = referredSub ? planForVariantId(referredSub.ls_variant_id ?? null) : null;
  const interval: "month" | "year" = planMetaFor(plan)?.interval ?? "month";

  // Resolve the affiliate: explicit param wins (handles "attribution pending"),
  // else the referred subscription's stamped affiliate.
  let affiliate:
    | { userId: string; code: string | null; ratePercent: number; durationMonths: number | null }
    | null = null;
  const affiliateInput = affiliateUserId ?? affiliateCode;
  if (affiliateInput) {
    const resolved = await resolveAdminAffiliate(adminClient, affiliateInput);
    if (!resolved) {
      return NextResponse.json(
        { error: `No affiliate found for "${affiliateInput}" (must be a flagged affiliate).` },
        { status: 404 },
      );
    }
    affiliate = { userId: resolved.userId, code: resolved.code, ratePercent: 30, durationMonths: null };
  } else if (referredSub?.ref_affiliate_user_id) {
    affiliate = {
      userId: referredSub.ref_affiliate_user_id,
      code: str(referredSub.ref_affiliate_code),
      ratePercent: 30,
      durationMonths: null,
    };
  }
  if (!affiliate) {
    return NextResponse.json(
      { error: "No affiliate to credit. Pass the affiliate's code, or attribute their referral first." },
      { status: 400 },
    );
  }

  // Pull the affiliate's commission terms (rate + duration) from their profile.
  {
    const { data: affProf } = await admin
      .from("profiles")
      .select("id,affiliate_code,commission_percent,commission_duration_months")
      .eq("id", affiliate.userId)
      .limit(1);
    const p = Array.isArray(affProf) && affProf[0] ? affProf[0] : null;
    const terms: AffiliateTerms = {
      commissionPercent: typeof p?.commission_percent === "number" ? p.commission_percent : null,
      commissionDurationMonths:
        typeof p?.commission_duration_months === "number" ? p.commission_duration_months : null,
    };
    affiliate.ratePercent = resolveRatePercent(terms);
    affiliate.durationMonths = resolveDurationMonths(terms);
    affiliate.code = affiliate.code ?? str(p?.affiliate_code);
  }

  // Months the affiliate already earned commission for, from real paid orders.
  // For a monthly plan each paid order ~= one month; an annual charge covered 12.
  const { data: ordersData } = await admin
    .from("orders")
    .select("status,total")
    .eq("user_id", customerId);
  const paidOrderCount = ((ordersData ?? []) as { status?: string | null; total?: number | null }[]).filter(
    (o) => (o.status ?? "").toLowerCase() === "paid" && (o.total ?? 0) > 0,
  ).length;
  const monthsPerOrder = interval === "year" ? 12 : 1;
  const window = makeWholeWindowMonths(affiliate.durationMonths);
  const monthsAlreadyPaid = Math.min(window, paidOrderCount * monthsPerOrder);
  const payableMonths = compMakeWholePayableMonths({ compMonths, windowMonths: window, monthsAlreadyPaid });

  const affiliateOut = { userId: affiliate.userId, code: affiliate.code, ratePercent: affiliate.ratePercent };

  if (payableMonths <= 0) {
    return NextResponse.json({
      ok: true,
      recorded: false,
      payableMonths: 0,
      monthsAlreadyPaid,
      windowMonths: window,
      affiliate: affiliateOut,
      message:
        `No make-whole owed: the affiliate has already been credited for ${monthsAlreadyPaid} of their ` +
        `${window}-month window on this customer's paid orders.`,
    });
  }

  // Comp = fully free, so the make-whole is the full commission on the referred
  // monthly price for each payable month.
  const makeWhole = computeMakeWhole({
    ratePercent: affiliate.ratePercent,
    referredPriceCents: referredMonthlyCents,
    newPriceCents: 0,
    interval: "month",
    windowMonths: payableMonths,
  });

  const nowIso = new Date().toISOString();
  const period = nowIso.slice(0, 7);
  const customerRef = email ?? customerId;

  // 1) Customer-side record of the comp make-whole (best-effort: a lagging prod
  // schema must not 500 the whole action).
  let grantId: string | null = null;
  let migrationPending = false;
  {
    const { data, error } = await inserter
      .from("customer_discount_grants")
      .insert({
        user_id: customerId,
        ls_subscription_id: null,
        referred_price_cents: referredMonthlyCents,
        new_price_cents: 0,
        discount_pct: 100,
        label: "Comp make-whole",
        affiliate_user_id: affiliate.userId,
        note,
        status: "manual",
        created_by: actor.email ?? actor.userId ?? null,
        created_at: nowIso,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("comp-makewhole: grant insert failed", error);
      migrationPending = true;
    } else {
      grantId = (data?.id as string | undefined) ?? null;
    }
  }

  // 2) Replace any UNPAID comp make-whole we previously recorded for this
  // customer+affiliate, so re-recording (e.g. switching a lump to installments)
  // never double-owes. Paid adjustments (reconciled_at set) are never touched.
  let voidedPrevious = 0;
  try {
    const { data: existing } = await admin
      .from("affiliate_commission_adjustments")
      .select("id,source,related_customer,reconciled_at")
      .eq("user_id", affiliate.userId);
    const toVoid = ((existing ?? []) as {
      id?: string;
      source?: string | null;
      related_customer?: string | null;
      reconciled_at?: string | null;
    }[]).filter(
      (r) => (r.source ?? "") === "comp" && (r.related_customer ?? "") === customerRef && !r.reconciled_at && r.id,
    );
    for (const r of toVoid) {
      const { error } = await deleter
        .from("affiliate_commission_adjustments")
        .delete()
        .eq("id", r.id as string);
      if (!error) voidedPrevious++;
    }
  } catch (error) {
    console.error("comp-makewhole: voiding previous adjustments failed", error);
  }

  // 3) The affiliate make-whole adjustment(s), source='comp'.
  //   - 'monthly' (default): one adjustment per remaining month, each due in a
  //     successive period (this month, next month, ...). Future-dated ones stay
  //     hidden from the affiliate's owed total until their month arrives (see
  //     loadOpenAdjustmentsByUser's asOfPeriod gate), so it pays out ~monthly.
  //   - 'lump': a single adjustment for the whole amount, due now.
  const count = schedule === "lump" ? 1 : payableMonths;
  const perInstallmentCents = schedule === "lump" ? makeWhole.amountCents : makeWhole.perBillingCents;
  const adjustmentIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const instPeriod = schedule === "lump" ? period : addMonthsToPeriod(period, i);
    const label = schedule === "lump" ? `${payableMonths} months` : `installment ${i + 1}/${count}`;
    const autoNote =
      `Comp make-whole for ${customerRef} (${label}): referred customer moved to a free comp, so ` +
      `${affiliate.ratePercent}% x ${(referredMonthlyCents / 100).toFixed(2)}/mo. Due ${instPeriod}.` +
      (note ? ` ${note}` : "");
    const { data, error } = await inserter
      .from("affiliate_commission_adjustments")
      .insert({
        user_id: affiliate.userId,
        amount_cents: perInstallmentCents,
        currency: "USD",
        note: autoNote,
        source: "comp",
        related_grant_id: grantId,
        related_customer: customerRef,
        period: instPeriod,
        created_by: actor.email ?? actor.userId ?? null,
        created_at: nowIso,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("comp-makewhole: adjustment insert failed", error);
      migrationPending = true;
      break;
    } else if (data?.id) {
      adjustmentIds.push(data.id as string);
    }
  }

  await logAdminAction({
    actor,
    action: "billing.comp.makewhole",
    targetType: "user",
    targetId: affiliate.userId,
    details: {
      customer: customerRef,
      customerId,
      schedule,
      referredMonthlyCents,
      compMonths,
      monthsAlreadyPaid,
      payableMonths,
      windowMonths: window,
      ratePercent: affiliate.ratePercent,
      amountCents: makeWhole.amountCents,
      perInstallmentCents,
      installments: adjustmentIds.length,
      voidedPrevious,
      grantId,
      migrationPending,
    },
  });

  return NextResponse.json({
    ok: !migrationPending,
    recorded: adjustmentIds.length > 0,
    migrationPending,
    schedule,
    installments: adjustmentIds.length,
    perInstallmentCents,
    firstPeriod: period,
    voidedPrevious,
    // For the lump case the UI can offer an immediate mark-paid; for monthly the
    // installments are paid one per month on the Payouts tab, so no single id.
    adjustmentId: schedule === "lump" ? adjustmentIds[0] ?? null : null,
    grantId,
    affiliate: affiliateOut,
    monthsAlreadyPaid,
    payableMonths,
    windowMonths: window,
    makeWhole: {
      amountCents: makeWhole.amountCents,
      perBillingCents: makeWhole.perBillingCents,
      billings: makeWhole.billings,
    },
    message: migrationPending
      ? "Computed, but the adjustment tables are not applied in prod yet (apply the 20260820 + 20260828 migrations)."
      : schedule === "lump"
        ? "Recorded as a lump. Pay the affiliate via PayPal, then mark it paid on the Payouts tab."
        : `Recorded ${adjustmentIds.length} monthly installment${adjustmentIds.length === 1 ? "" : "s"}. Each shows in the affiliate's Owed on its month; pay it there.`,
  });
}
