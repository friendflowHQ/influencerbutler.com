/**
 * Pure helpers for refunds and duplicate charges on orders, used by the Lemon
 * Squeezy webhook (src/app/api/webhooks/lemonsqueezy/route.ts). Kept separate
 * so they can be unit tested without the webhook.
 */

const toNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Share of a charge that was refunded, 0..1. A full refund is 1. A partial
 * refund is refunded / total when both are known; if the amounts are missing a
 * partial refund conservatively counts as 0 (no clawback until the numbers
 * arrive), and anything else as a full refund.
 */
export function refundedShare(status: string | null, refunded: unknown, total: unknown): number {
  if (status !== "partial_refund") return 1;
  const r = toNum(refunded);
  const t = toNum(total);
  if (r === null || t === null || t <= 0) return 0;
  return Math.min(1, Math.max(0, r / t));
}

/** How much of `paidCents` should be clawed back in total for this refund share. */
export function clawbackTargetCents(paidCents: number, share: number): number {
  if (!Number.isFinite(paidCents) || paidCents <= 0) return 0;
  return Math.round(paidCents * Math.min(1, Math.max(0, share)));
}

/**
 * True when an "initial" subscription invoice is the same charge order_created
 * already stored: another paid order for the buyer, with the same total, under
 * a different order id. (Same id means the upsert simply merges.)
 */
export function isDuplicateInitialCharge(
  invoiceOrderId: string,
  invoiceTotal: unknown,
  recentOrders: { ls_order_id?: unknown; total?: unknown; status?: unknown }[],
): boolean {
  const total = toNum(invoiceTotal);
  if (total === null || total <= 0) return false; // $0 trial-start invoices are harmless
  return recentOrders.some(
    (o) =>
      typeof o.ls_order_id === "string" &&
      o.ls_order_id !== invoiceOrderId &&
      o.status === "paid" &&
      toNum(o.total) === total,
  );
}
