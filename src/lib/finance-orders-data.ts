// Loads and normalizes the order data the Finance dashboard computes on.
//
// Every amount is integer USD cents. Rows enriched by the LS webhook /
// backfill carry exact subtotal/tax/refund figures; older rows fall back to
// orders.total (assumed USD) with tax 0 until the backfill runs, which the
// loader surfaces via `enrichedCount` so the UI can note the approximation.

import type { SupabaseClient } from "@supabase/supabase-js";
import { billingIntervalForVariantId, isAddonVariant } from "@/lib/lemonsqueezy";
import { isMigrationPendingError } from "@/lib/finance-stepup";

export type FinanceInterval = "month" | "year" | "one_time";

export type FinanceOrder = {
  lsOrderId: string;
  createdAt: string | null;
  /** LS order status: paid | refunded | partial_refund. */
  status: string | null;
  totalUsdCents: number;
  taxUsdCents: number;
  refundedUsdCents: number;
  refundedAt: string | null;
  interval: FinanceInterval;
  /** True when the row carries webhook/backfill enrichment (exact figures). */
  enriched: boolean;
};

export type FinanceOrdersResult =
  | { ok: true; orders: FinanceOrder[]; enrichedCount: number }
  | { ok: false; migrationPending: boolean };

type OrderRow = {
  ls_order_id: string;
  status: string | null;
  total: number | null;
  currency: string | null;
  created_at: string | null;
  ls_subscription_id: string | null;
  subtotal_usd_cents: number | null;
  tax_usd_cents: number | null;
  total_usd_cents: number | null;
  refunded_usd_cents: number | null;
  refunded_at: string | null;
};

const PAGE_SIZE = 1000;

/** Statuses that represent money that actually moved. */
const MONEY_STATUSES = new Set(["paid", "refunded", "partial_refund"]);

export async function loadFinanceOrders(db: SupabaseClient): Promise<FinanceOrdersResult> {
  const rows: OrderRow[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await db
      .from("orders")
      .select(
        "ls_order_id,status,total,currency,created_at,ls_subscription_id,subtotal_usd_cents,tax_usd_cents,total_usd_cents,refunded_usd_cents,refunded_at",
      )
      .order("created_at", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) {
      if (isMigrationPendingError(error)) return { ok: false, migrationPending: true };
      console.error("loadFinanceOrders: query failed", error);
      return { ok: false, migrationPending: false };
    }
    const batch = (data ?? []) as OrderRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  // Billing interval per subscription (annual vs monthly recognition period).
  const subIds = Array.from(
    new Set(rows.map((r) => r.ls_subscription_id).filter((v): v is string => Boolean(v))),
  );
  const intervalBySub = new Map<string, FinanceInterval>();
  for (let i = 0; i < subIds.length; i += 200) {
    const chunk = subIds.slice(i, i + 200);
    const { data } = await db
      .from("subscriptions")
      .select("ls_subscription_id,ls_variant_id")
      .in("ls_subscription_id", chunk);
    for (const s of (data ?? []) as { ls_subscription_id: string; ls_variant_id: string | null }[]) {
      if (isAddonVariant(s.ls_variant_id)) {
        intervalBySub.set(s.ls_subscription_id, "one_time");
        continue;
      }
      const interval = billingIntervalForVariantId(s.ls_variant_id);
      intervalBySub.set(s.ls_subscription_id, interval ?? "month");
    }
  }

  let enrichedCount = 0;
  const orders: FinanceOrder[] = [];
  for (const r of rows) {
    if (!MONEY_STATUSES.has(r.status ?? "")) continue;
    const enriched = typeof r.total_usd_cents === "number";
    if (enriched) enrichedCount++;

    const total = enriched ? (r.total_usd_cents as number) : (r.total ?? 0);
    const tax = typeof r.tax_usd_cents === "number" ? r.tax_usd_cents : 0;
    // Pre-enrichment fallback: a fully refunded order refunds its whole total.
    const refunded =
      typeof r.refunded_usd_cents === "number"
        ? r.refunded_usd_cents
        : r.status === "refunded"
          ? total
          : 0;

    orders.push({
      lsOrderId: r.ls_order_id,
      createdAt: r.created_at,
      status: r.status,
      totalUsdCents: Number.isFinite(total) ? total : 0,
      taxUsdCents: Number.isFinite(tax) ? tax : 0,
      refundedUsdCents: Number.isFinite(refunded) ? refunded : 0,
      refundedAt: r.refunded_at ?? (r.status === "refunded" ? r.created_at : null),
      interval: (r.ls_subscription_id && intervalBySub.get(r.ls_subscription_id)) || "one_time",
      enriched,
    });
  }

  return { ok: true, orders, enrichedCount };
}
