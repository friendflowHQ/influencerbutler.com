// Shared affiliate commission engine.
//
// Single source of truth for "what do we owe each affiliate". Consumed by the
// Owed tab (pre-activation gap), the Payouts tab (monthly top-ups), the
// statement emails, and the monthly cron. Pure functions only, so the math is
// unit-testable without a database.
//
// Model
// -----
// Lemon Squeezy pays a flat LS_BASE_PERCENT (30%) on every commissionable order,
// but only for the first LS_CREDIT_MONTHS (12) of a subscription. An affiliate
// may be promised a higher total rate (commission_percent) for a longer window
// (commission_duration_months, null = lifetime). For each order we owe the
// affiliate the gap between their promised rate and what LS actually paid:
//
//   * Pending order (attribution_status='pending'): LS credited nothing, so we
//     owe the FULL promised rate. This is the pre-activation gap bonus.
//   * Live order within LS's 12-month window: LS paid 30%, so we owe the
//     DIFFERENCE (rate - 30).
//   * Live order past LS's 12-month window (only reachable for long/lifetime
//     durations): LS paid nothing, so we owe the FULL promised rate again.
//
// Orders outside the affiliate's own duration window earn no top-up. "First
// order" per customer is derived from the orders set itself (earliest paid order
// for that buyer), so no subscription join is needed.

export const LS_BASE_PERCENT = 30;
export const LS_CREDIT_MONTHS = 12;
export const DEFAULT_COMMISSION_PERCENT = 30;

/** Per-affiliate terms, as stored on the profiles row. */
export type AffiliateTerms = {
  /** Promised total rate (e.g. 70). Null falls back to the 30% default. */
  commissionPercent: number | null;
  /** Honored window in months from each customer's first order; null = lifetime. */
  commissionDurationMonths: number | null;
};

/** A single order row, narrowed to the fields the engine needs. */
export type CommissionOrder = {
  lsOrderId: string;
  /** The buyer's user id (used to group a customer's orders over time). */
  buyerUserId: string | null;
  totalCents: number;
  currency: string | null;
  /** LS order status; only 'paid' orders are commissionable. */
  status: string | null;
  /** 'live' = LS credited via aff_ref, 'pending' = gap (LS credited nothing). */
  attributionStatus: string | null;
  /** Already-reconciled orders are excluded (their top-up was paid). */
  reconciledAt: string | null;
  createdAt: string | null;
};

export type CommissionLine = {
  lsOrderId: string;
  createdAt: string | null;
  currency: string | null;
  totalCents: number;
  /** What LS already credited the affiliate for this order (0 or 30%). */
  lsPaidCents: number;
  /** What we still owe on top (promised rate minus lsPaidCents). */
  owedCents: number;
  attributionStatus: string | null;
};

export type AffiliateOwed = {
  ratePercent: number;
  durationMonths: number | null;
  lines: CommissionLine[];
  orderCount: number;
  /** Sum of order totals. */
  grossCents: number;
  /** Sum of what LS already paid. */
  lsPaidCents: number;
  /** Sum of what we owe on top. */
  owedCents: number;
};

/** Resolve the promised rate for an affiliate, clamped to a sane range. */
export function resolveRatePercent(terms: AffiliateTerms | null | undefined): number {
  const raw = terms?.commissionPercent;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 100) {
    return raw;
  }
  return DEFAULT_COMMISSION_PERCENT;
}

function addMonths(iso: string, months: number): number {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
}

/**
 * Earliest paid-order timestamp per buyer, used as the anchor for both LS's
 * 12-month credit window and the affiliate's own duration window. Non-paid and
 * dateless orders are ignored so a refund can't move a customer's anchor.
 */
export function buildFirstOrderByBuyer(orders: CommissionOrder[]): Map<string, number> {
  const first = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "paid") continue;
    if (!o.buyerUserId || !o.createdAt) continue;
    const t = new Date(o.createdAt).getTime();
    if (!Number.isFinite(t)) continue;
    const prev = first.get(o.buyerUserId);
    if (prev === undefined || t < prev) first.set(o.buyerUserId, t);
  }
  return first;
}

/**
 * Computes the owed top-up for one order under a set of terms. Returns null when
 * the order is not commissionable (not paid, dateless, or outside the
 * affiliate's honored duration window). `firstOrderMs` is the buyer's first
 * paid-order time; when unknown we fall back to the order's own time (treating
 * it as the anchor), which keeps a lone order inside both windows.
 */
export function computeOrderOwed(
  order: CommissionOrder,
  terms: AffiliateTerms | null | undefined,
  firstOrderMs: number | null,
): CommissionLine | null {
  if (order.status !== "paid") return null;
  if (order.reconciledAt) return null;
  if (!order.createdAt) return null;
  const orderMs = new Date(order.createdAt).getTime();
  if (!Number.isFinite(orderMs)) return null;

  const anchorMs = firstOrderMs ?? orderMs;
  const ratePercent = resolveRatePercent(terms);
  const durationMonths = terms?.commissionDurationMonths ?? null;

  // Outside the affiliate's honored window: no top-up owed.
  if (durationMonths !== null) {
    const anchorIso = new Date(anchorMs).toISOString();
    if (orderMs > addMonths(anchorIso, durationMonths)) return null;
  }

  const totalCents = Number.isFinite(order.totalCents) ? order.totalCents : 0;

  // Did LS actually pay 30% on this order? Only if it was credited live AND the
  // order falls within LS's 12-month crediting window.
  const anchorIso = new Date(anchorMs).toISOString();
  const withinLsWindow = orderMs <= addMonths(anchorIso, LS_CREDIT_MONTHS);
  const lsPaidCents =
    order.attributionStatus === "live" && withinLsWindow
      ? Math.round((totalCents * LS_BASE_PERCENT) / 100)
      : 0;

  const fullOwed = Math.round((totalCents * ratePercent) / 100);
  const owedCents = Math.max(0, fullOwed - lsPaidCents);

  return {
    lsOrderId: order.lsOrderId,
    createdAt: order.createdAt,
    currency: order.currency,
    totalCents,
    lsPaidCents,
    owedCents,
    attributionStatus: order.attributionStatus,
  };
}

/**
 * Aggregates the owed top-up for one affiliate across their orders. `orders`
 * should already be filtered to this affiliate's referrals; `allOrders`
 * (defaulting to `orders`) is used only to anchor each buyer's first-order date,
 * so pass the full order set when you have it for accurate window math.
 */
export function computeAffiliateOwed(
  terms: AffiliateTerms | null | undefined,
  orders: CommissionOrder[],
  allOrders?: CommissionOrder[],
): AffiliateOwed {
  const firstByBuyer = buildFirstOrderByBuyer(allOrders ?? orders);
  const lines: CommissionLine[] = [];
  let grossCents = 0;
  let lsPaidCents = 0;
  let owedCents = 0;

  for (const order of orders) {
    const firstMs = order.buyerUserId ? firstByBuyer.get(order.buyerUserId) ?? null : null;
    const line = computeOrderOwed(order, terms, firstMs);
    if (!line) continue;
    lines.push(line);
    grossCents += line.totalCents;
    lsPaidCents += line.lsPaidCents;
    owedCents += line.owedCents;
  }

  lines.sort((a, b) => {
    const at = a.createdAt ?? "";
    const bt = b.createdAt ?? "";
    return at < bt ? 1 : at > bt ? -1 : 0;
  });

  return {
    ratePercent: resolveRatePercent(terms),
    durationMonths: terms?.commissionDurationMonths ?? null,
    lines,
    orderCount: lines.length,
    grossCents,
    lsPaidCents,
    owedCents,
  };
}

/** Human label for a duration ("Lifetime" or "N months"). */
export function durationLabel(months: number | null): string {
  return months === null ? "Lifetime" : `${months} months`;
}

/** UTC [start, end) bounds for a YYYY-MM period string. */
export function periodBounds(period: string): { startIso: string; endIso: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** True when the order's created_at falls inside the [start, end) period. */
export function orderInPeriod(order: CommissionOrder, bounds: { startIso: string; endIso: string }): boolean {
  if (!order.createdAt) return false;
  return order.createdAt >= bounds.startIso && order.createdAt < bounds.endIso;
}
