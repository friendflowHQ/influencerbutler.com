/**
 * POST /api/admin/billing/backfill-renewals
 * Body: { dryRun?: boolean, before?: string (ISO) }  (dry run by default)
 *
 * Recovers subscription charges that never reached the `orders` table. Until
 * commit 0113484 (2026-07-12) the webhook read Lemon Squeezy's numeric
 * subscription_id as null, so every subscription_payment_success (trial
 * conversions and renewals) threw "no user context" and was dropped. Finance
 * revenue, affiliate renewal commissions and paid-conversion history for that
 * period are missing those charges.
 *
 * Pages LS /subscription-invoices for the store and inserts each invoice that:
 *   - is not the subscription's "initial" invoice (order_created owns that),
 *   - charged money (total > 0) and is paid or refunded,
 *   - was created before `before` (default: the day after the fix), and
 *   - is not already in `orders` (keyed exactly like the webhook: the invoice's
 *     order_id when present, else the invoice id).
 * Each row mirrors the webhook's write: user + affiliate attribution copied
 * from the subscription row (so the owed report credits renewals), original
 * created_at, and the USD money breakdown for Finance.
 *
 * The dry run reports counts, totals by month, and the affiliate commission
 * base it would create, because a stamped renewal becomes money owed.
 * Audit-logged when applied.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { lsApi } from "@/lib/lemonsqueezy";
import { escapeLike } from "@/lib/affiliate-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_BEFORE = "2026-07-13T00:00:00Z";
const MAX_PAGES = 100;

type AnyClient = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

type InvoiceAttrs = {
  subscription_id?: number | string | null;
  order_id?: number | string | null;
  billing_reason?: string | null;
  status?: string | null;
  user_email?: string | null;
  currency?: string | null;
  total?: number | null;
  subtotal?: number | null;
  tax?: number | null;
  total_usd?: number | null;
  subtotal_usd?: number | null;
  tax_usd?: number | null;
  refunded_amount?: number | null;
  refunded_amount_usd?: number | null;
  refunded_at?: string | null;
  discount_total?: number | null;
  created_at?: string | null;
};

type Invoice = { id?: string; attributes?: InvoiceAttrs };

type Candidate = {
  lsOrderId: string;
  lsSubscriptionId: string | null;
  email: string | null;
  status: string;
  total: number;
  currency: string | null;
  createdAt: string;
  attrs: InvoiceAttrs;
};

function idString(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  const actor = await requirePermission("billing.comp", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let dryRun = true;
  let beforeIso = DEFAULT_BEFORE;
  try {
    const body = (await request.json()) as { dryRun?: unknown; before?: unknown };
    if (body?.dryRun === false) dryRun = false;
    if (typeof body?.before === "string" && !Number.isNaN(Date.parse(body.before))) {
      beforeIso = new Date(body.before).toISOString();
    }
  } catch {
    // Empty body = dry run with defaults.
  }
  const beforeMs = Date.parse(beforeIso);

  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!storeId) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const client = createAdminClient();
  if (!client) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const db = client as unknown as AnyClient;

  // 1) Pull every subscription invoice from LS.
  const invoices: Invoice[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await lsApi(
      `/subscription-invoices?filter[store_id]=${encodeURIComponent(storeId)}&page[size]=100&page[number]=${page}`,
      { method: "GET" },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("backfill-renewals: LS invoices fetch failed", res.status, text.slice(0, 300));
      return NextResponse.json(
        { error: `Lemon Squeezy returned ${res.status} on page ${page}.` },
        { status: 502 },
      );
    }
    const payload = (await res.json()) as {
      data?: Invoice[];
      meta?: { page?: { lastPage?: number } };
    };
    invoices.push(...(payload.data ?? []));
    const lastPage = payload.meta?.page?.lastPage ?? page;
    if (page >= lastPage || (payload.data ?? []).length === 0) break;
    await sleep(250);
  }

  // 2) Filter to real, pre-fix, non-initial charges.
  const raw: Candidate[] = [];
  const skipped = { initial: 0, zeroTotal: 0, unpaid: 0, afterCutoff: 0, alreadyRecorded: 0 };
  for (const inv of invoices) {
    const a = inv.attributes ?? {};
    const invoiceId = idString(inv.id);
    if (!invoiceId) continue;
    if (a.billing_reason === "initial") {
      skipped.initial += 1;
      continue;
    }
    const status = typeof a.status === "string" ? a.status : "";
    if (status !== "paid" && status !== "refunded" && status !== "partial_refund") {
      skipped.unpaid += 1;
      continue;
    }
    const total = typeof a.total === "number" ? a.total : Number(a.total ?? 0);
    if (!Number.isFinite(total) || total <= 0) {
      skipped.zeroTotal += 1;
      continue;
    }
    const createdAt = typeof a.created_at === "string" ? a.created_at : null;
    if (!createdAt || Number.isNaN(Date.parse(createdAt)) || Date.parse(createdAt) >= beforeMs) {
      skipped.afterCutoff += 1;
      continue;
    }
    raw.push({
      lsOrderId: idString(a.order_id) ?? invoiceId,
      lsSubscriptionId: idString(a.subscription_id),
      email: typeof a.user_email === "string" ? a.user_email.trim().toLowerCase() : null,
      status,
      total,
      currency: typeof a.currency === "string" ? a.currency : null,
      createdAt,
      attrs: a,
    });
  }

  // 3) Drop anything already in orders (by either possible key).
  const keys = [...new Set(raw.map((c) => c.lsOrderId))];
  const existing = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await db
      .from("orders")
      .select("ls_order_id")
      .in("ls_order_id", keys.slice(i, i + 200));
    if (error) {
      console.error("backfill-renewals: orders read failed", error);
      return NextResponse.json({ error: "Orders read failed" }, { status: 500 });
    }
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      if (typeof r.ls_order_id === "string") existing.add(r.ls_order_id);
    }
  }
  const missing = raw.filter((c) => {
    if (existing.has(c.lsOrderId)) {
      skipped.alreadyRecorded += 1;
      return false;
    }
    return true;
  });

  // 4) Resolve user + affiliate attribution from the subscription rows.
  const subIds = [...new Set(missing.map((c) => c.lsSubscriptionId).filter((s): s is string => Boolean(s)))];
  const subById = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < subIds.length; i += 200) {
    const { data, error } = await db
      .from("subscriptions")
      .select("ls_subscription_id,user_id,ref_affiliate_user_id,ref_affiliate_code,attribution_status")
      .in("ls_subscription_id", subIds.slice(i, i + 200));
    if (error) {
      console.error("backfill-renewals: subscriptions read failed", error);
      return NextResponse.json({ error: "Subscriptions read failed" }, { status: 500 });
    }
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      if (typeof r.ls_subscription_id === "string") subById.set(r.ls_subscription_id, r);
    }
  }
  const userByEmail = new Map<string, string>();
  const needEmail = [
    ...new Set(
      missing
        .filter((c) => !(c.lsSubscriptionId && typeof subById.get(c.lsSubscriptionId)?.user_id === "string"))
        .map((c) => c.email)
        .filter((e): e is string => Boolean(e)),
    ),
  ];
  for (const email of needEmail) {
    const { data } = await db.from("profiles").select("id").ilike("email", escapeLike(email)).limit(1);
    const id = Array.isArray(data) && typeof data[0]?.id === "string" ? (data[0].id as string) : null;
    if (id) userByEmail.set(email, id);
  }

  const cents = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;

  const rows: Record<string, unknown>[] = [];
  const unresolved: { lsOrderId: string; lsSubscriptionId: string | null }[] = [];
  const byMonth: Record<string, { count: number; totalUsdCents: number }> = {};
  let affiliateRows = 0;
  let affiliateBaseUsdCents = 0;
  for (const c of missing) {
    const sub = c.lsSubscriptionId ? subById.get(c.lsSubscriptionId) : undefined;
    const userId =
      (typeof sub?.user_id === "string" ? sub.user_id : null) ??
      (c.email ? userByEmail.get(c.email) ?? null : null);
    if (!userId) {
      unresolved.push({ lsOrderId: c.lsOrderId, lsSubscriptionId: c.lsSubscriptionId });
      continue;
    }
    const currency = c.currency?.toUpperCase() ?? null;
    const usd = (u: unknown, r: unknown) => cents(u) ?? (currency === "USD" ? cents(r) : null);
    const totalUsd = usd(c.attrs.total_usd, c.attrs.total);
    const refAffiliate = typeof sub?.ref_affiliate_user_id === "string" ? sub.ref_affiliate_user_id : null;

    const row: Record<string, unknown> = {
      ls_order_id: c.lsOrderId,
      user_id: userId,
      status: c.status,
      total: c.total,
      currency: c.currency,
      created_at: c.createdAt,
      ...(c.lsSubscriptionId ? { ls_subscription_id: c.lsSubscriptionId } : {}),
      ...(refAffiliate ? { ref_affiliate_user_id: refAffiliate } : {}),
      ...(typeof sub?.ref_affiliate_code === "string" ? { ref_affiliate_code: sub.ref_affiliate_code } : {}),
      ...(typeof sub?.attribution_status === "string" ? { attribution_status: sub.attribution_status } : {}),
    };
    const money: Record<string, unknown> = {};
    const subtotal = usd(c.attrs.subtotal_usd, c.attrs.subtotal);
    const tax = usd(c.attrs.tax_usd, c.attrs.tax);
    const refunded = usd(c.attrs.refunded_amount_usd, c.attrs.refunded_amount);
    if (subtotal !== null) money.subtotal_usd_cents = subtotal;
    if (tax !== null) money.tax_usd_cents = tax;
    if (totalUsd !== null) money.total_usd_cents = totalUsd;
    if (refunded !== null) money.refunded_usd_cents = refunded;
    if (c.attrs.refunded_at) money.refunded_at = c.attrs.refunded_at;
    const discount = cents(c.attrs.discount_total);
    if (discount !== null) money.discount_total_cents = discount;
    rows.push({ base: row, money });

    const month = c.createdAt.slice(0, 7);
    byMonth[month] = byMonth[month] ?? { count: 0, totalUsdCents: 0 };
    byMonth[month].count += 1;
    byMonth[month].totalUsdCents += totalUsd ?? 0;
    if (refAffiliate) {
      affiliateRows += 1;
      affiliateBaseUsdCents += totalUsd ?? 0;
    }
  }

  // 5) Apply.
  let inserted = 0;
  const failed: string[] = [];
  if (!dryRun) {
    for (const r of rows as { base: Record<string, unknown>; money: Record<string, unknown> }[]) {
      const { error } = await db.from("orders").insert({ ...r.base, ...r.money });
      if (error) {
        // Finance / discount columns are hand-applied migrations; retry bare.
        const { error: bareErr } = await db.from("orders").insert(r.base);
        if (bareErr) {
          console.error("backfill-renewals: insert failed", r.base.ls_order_id, bareErr);
          failed.push(String(r.base.ls_order_id));
          continue;
        }
      }
      inserted += 1;
    }
    await logAdminAction({
      actor,
      action: "billing.renewals.backfill",
      targetType: "system",
      targetId: "orders",
      details: {
        before: beforeIso,
        inserted,
        failed,
        unresolved,
        byMonth,
        affiliateRows,
        affiliateBaseUsdCents,
      },
    });
  }

  return NextResponse.json({
    dryRun,
    before: beforeIso,
    invoicesScanned: invoices.length,
    skipped,
    toInsert: rows.length,
    inserted,
    failed,
    unresolved,
    byMonth,
    affiliateRows,
    affiliateBaseUsdCents,
    sample: (rows as { base: Record<string, unknown> }[]).slice(0, 10).map((r) => ({
      lsOrderId: r.base.ls_order_id,
      lsSubscriptionId: r.base.ls_subscription_id ?? null,
      total: r.base.total,
      currency: r.base.currency,
      createdAt: r.base.created_at,
      affiliate: r.base.ref_affiliate_code ?? null,
    })),
  });
}
