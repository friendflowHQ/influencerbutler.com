/**
 * Monthly vs annual for ONE order (charge), not for the buyer.
 *
 * Commission amortization (src/lib/affiliate-commissions.ts) and Finance
 * revenue recognition both need to know whether a given charge pre-paid a year.
 * They used to read the buyer's CURRENT subscription variant, so a monthly to
 * annual switch relabelled every earlier monthly order as annual (and an
 * annual to monthly switch made an annual's remaining months payable at once).
 *
 * Resolution order:
 *   1. orders.billing_interval, stamped by the Lemon Squeezy webhook per charge
 *      (migration 20261113_orders_billing_interval.sql).
 *   2. The amount rule, for older rows: a charge worth more than 2.5x the plan's
 *      monthly list price is an annual payment (a prorated monthly to annual
 *      switch charge is annual minus at most one month of credit, so it still
 *      clears the bar; tax never pushes a monthly charge that high).
 *   3. The buyer's current subscription interval (the old behaviour).
 */
import { planMetaForVariantId } from "@/lib/lemonsqueezy";

export type OrderInterval = "month" | "year";

const ANNUAL_MULTIPLE = 2.5;

/** Monthly list price for the plan behind a variant (annual / 10 for annual variants). */
export function monthlyReferenceCents(variantId: string | number | null | undefined): number | null {
  const meta = planMetaForVariantId(variantId);
  if (!meta || meta.priceCents <= 0) return null;
  return meta.interval === "year" ? Math.round(meta.priceCents / 10) : meta.priceCents;
}

/** "year" when the charge is far above one month of the plan, else "month". */
export function intervalByAmount(chargeCents: number | null | undefined, monthlyRefCents: number | null): OrderInterval | null {
  if (typeof chargeCents !== "number" || !Number.isFinite(chargeCents) || chargeCents <= 0) return null;
  if (!monthlyRefCents || monthlyRefCents <= 0) return null;
  return chargeCents > monthlyRefCents * ANNUAL_MULTIPLE ? "year" : "month";
}

export function parseStoredInterval(raw: unknown): OrderInterval | null {
  return raw === "month" || raw === "year" ? raw : null;
}

export function resolveOrderInterval(input: {
  stored?: unknown;
  /** Pre-tax USD cents when known, else the raw total. */
  chargeCents?: number | null;
  /** The buyer's (or subscription's) current variant, for the monthly reference price. */
  variantId?: string | number | null;
  /** The old buyer-level interval, used only when nothing better is known. */
  fallback?: OrderInterval | null;
}): OrderInterval | null {
  return (
    parseStoredInterval(input.stored) ??
    intervalByAmount(input.chargeCents, monthlyReferenceCents(input.variantId ?? null)) ??
    input.fallback ??
    null
  );
}
