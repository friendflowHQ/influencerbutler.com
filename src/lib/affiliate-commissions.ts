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
// Default honored window for an affiliate with no custom rate. Matches the
// advertised "30% for the first 12 months" offer. Custom-rate affiliates keep
// their own duration (null = lifetime), so this default never touches them.
export const DEFAULT_COMMISSION_DURATION_MONTHS = 12;

/** Per-affiliate terms, as stored on the profiles row. */
export type AffiliateTerms = {
  /** Promised total rate (e.g. 70). Null falls back to the 30% default. */
  commissionPercent: number | null;
  /** Honored window in months from each customer's first order; null = lifetime. */
  commissionDurationMonths: number | null;
};

/** Billing cadence of the charge behind an order. Drives amortization: an
 *  annual charge is a big upfront payment, so we recognize its commission 1/12
 *  per month of service rather than all at once. Null/unknown behaves monthly
 *  (single recognition), matching the pre-amortization behavior. */
export type BillingInterval = "month" | "year";

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
  /** Billing cadence, for amortization. Optional: undefined/null = monthly. */
  billingInterval?: BillingInterval | null;
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

/**
 * Resolve the honored commission window for an affiliate.
 *
 *  - An explicit positive `commissionDurationMonths` always wins.
 *  - When no duration is set: an affiliate with a custom rate is treated as
 *    lifetime (null, never expires), matching how custom deals like Samantha's
 *    70% are configured. An affiliate on the default rate is capped at
 *    DEFAULT_COMMISSION_DURATION_MONTHS (12), matching the advertised offer.
 */
export function resolveDurationMonths(terms: AffiliateTerms | null | undefined): number | null {
  const raw = terms?.commissionDurationMonths;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  const hasCustomRate =
    typeof terms?.commissionPercent === "number" && Number.isFinite(terms.commissionPercent);
  return hasCustomRate ? null : DEFAULT_COMMISSION_DURATION_MONTHS;
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

/** Money breakdown for one order under a set of terms. */
export type OrderEconomics = {
  /** The order total (referred revenue). */
  grossCents: number;
  /** What LS already credited the affiliate (0 or 30%). */
  lsPaidCents: number;
  /** What we still owe on top (promised rate minus lsPaidCents). */
  owedCents: number;
};

/**
 * Core per-order economics under a set of terms. Returns null when the order is
 * not commissionable (not paid, dateless, or outside the affiliate's honored
 * duration window). Ignores the reconciled flag: analytics wants historical
 * earnings whether or not the top-up has been paid. `firstOrderMs` is the
 * buyer's first paid-order time; when unknown we fall back to the order's own
 * time (treating it as the anchor), which keeps a lone order inside both windows.
 */
export function orderEconomics(
  order: CommissionOrder,
  terms: AffiliateTerms | null | undefined,
  firstOrderMs: number | null,
): OrderEconomics | null {
  if (order.status !== "paid") return null;
  if (!order.createdAt) return null;
  const orderMs = new Date(order.createdAt).getTime();
  if (!Number.isFinite(orderMs)) return null;

  const anchorMs = firstOrderMs ?? orderMs;
  const ratePercent = resolveRatePercent(terms);
  const durationMonths = resolveDurationMonths(terms);

  // Outside the affiliate's honored window: no commission owed.
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

  return { grossCents: totalCents, lsPaidCents, owedCents };
}

/**
 * Computes the unpaid owed top-up line for one order. Returns null when the
 * order is not commissionable OR has already been reconciled (paid). Built on
 * orderEconomics; used by the Owed / Payouts flows which show outstanding money.
 */
export function computeOrderOwed(
  order: CommissionOrder,
  terms: AffiliateTerms | null | undefined,
  firstOrderMs: number | null,
): CommissionLine | null {
  if (order.reconciledAt) return null;
  const econ = orderEconomics(order, terms, firstOrderMs);
  if (!econ) return null;
  return {
    lsOrderId: order.lsOrderId,
    createdAt: order.createdAt,
    currency: order.currency,
    totalCents: econ.grossCents,
    lsPaidCents: econ.lsPaidCents,
    owedCents: econ.owedCents,
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
    durationMonths: resolveDurationMonths(terms),
    lines,
    orderCount: lines.length,
    grossCents,
    lsPaidCents,
    owedCents,
  };
}

/**
 * All-time earned commission for one affiliate: the FULL promised commission
 * across every commissionable order, INCLUDING already-reconciled (paid) ones.
 * Where computeAffiliateOwed returns only what is still outstanding, this is the
 * lifetime "Total earned" figure used by the admin roster. Mirrors how
 * computeMonthlyEarnings sums per-order (lsPaid + owed). `orders` should already
 * be filtered to this affiliate's referrals; pass the full order set as
 * `allOrders` so each buyer's first-order window is anchored accurately.
 */
export function computeAffiliateEarnedCents(
  terms: AffiliateTerms | null | undefined,
  orders: CommissionOrder[],
  allOrders?: CommissionOrder[],
): number {
  const firstByBuyer = buildFirstOrderByBuyer(allOrders ?? orders);
  let earned = 0;
  for (const order of orders) {
    const firstMs = order.buyerUserId ? firstByBuyer.get(order.buyerUserId) ?? null : null;
    const econ = orderEconomics(order, terms, firstMs);
    if (!econ) continue;
    earned += econ.lsPaidCents + econ.owedCents;
  }
  return earned;
}

// ---------------------------------------------------------------------------
// Recognition + clearing (refund/chargeback safety)
// ---------------------------------------------------------------------------
//
// Two protections layer on top of the raw owed amount:
//
//  1. Clearing period: an order's commission is not PAYABLE until CLEARING_DAYS
//     after the charge, so a same-week dispute settles before we pay.
//  2. Annual amortization: an annual charge pre-pays 12 months, so we recognize
//     its commission 1/12 per month of service (period k recognized at
//     order + (k-1) months). A late chargeback then only costs us the months
//     already recognized, not the whole year. Monthly/one-time orders have a
//     single period, so they recognize in full at purchase.
//
// A period is PAYABLE once it is both recognized AND past the clearing buffer.

export const CLEARING_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Amortization periods for a billing interval. Annual spreads over 12. */
export function amortizationPeriods(interval: BillingInterval | null | undefined): number {
  return interval === "year" ? 12 : 1;
}

/** Money breakdown for one order at a point in time (`nowMs`). */
export type OrderCommission = {
  grossCents: number;
  lsPaidCents: number;
  /** Full commission owed once every period is recognized. */
  fullOwedCents: number;
  /** Recognized to date (annual amortized by month), <= fullOwedCents. */
  recognizedOwedCents: number;
  /** Recognized AND past the clearing buffer: safe to pay now. */
  payableOwedCents: number;
  /** Recognized but still inside the clearing buffer. */
  clearingOwedCents: number;
  /** Not yet recognized (future amortization periods). */
  upcomingOwedCents: number;
  periods: number;
};

/**
 * Full recognition/clearing breakdown for one order at time `nowMs`. Built on
 * orderEconomics (returns null for non-commissionable orders), so it inherits
 * the duration-window and paid-status rules. Ignores the reconciled flag: the
 * caller nets already-paid amounts, so this stays a pure function of time.
 */
export function orderCommission(
  order: CommissionOrder,
  terms: AffiliateTerms | null | undefined,
  firstOrderMs: number | null,
  nowMs: number,
): OrderCommission | null {
  const econ = orderEconomics(order, terms, firstOrderMs);
  if (!econ) return null;
  if (!order.createdAt) return null;
  const orderMs = new Date(order.createdAt).getTime();
  if (!Number.isFinite(orderMs)) return null;

  const fullOwed = econ.owedCents;
  const periods = amortizationPeriods(order.billingInterval);
  const orderIso = new Date(orderMs).toISOString();

  let recognized = 0;
  let payable = 0;
  for (let k = 1; k <= periods; k++) {
    const recMs = addMonths(orderIso, k - 1); // period 1 recognizes at purchase
    if (recMs <= nowMs) recognized += 1;
    if (recMs + CLEARING_DAYS * DAY_MS <= nowMs) payable += 1;
  }

  const recognizedOwed = Math.round((fullOwed * recognized) / periods);
  const payableOwed = Math.round((fullOwed * payable) / periods);
  return {
    grossCents: econ.grossCents,
    lsPaidCents: econ.lsPaidCents,
    fullOwedCents: fullOwed,
    recognizedOwedCents: recognizedOwed,
    payableOwedCents: payableOwed,
    clearingOwedCents: Math.max(0, recognizedOwed - payableOwed),
    upcomingOwedCents: Math.max(0, fullOwed - recognizedOwed),
    periods,
  };
}

/** One order's outstanding payable detail, for the incremental payout path. */
export type PayableLine = {
  lsOrderId: string;
  /** Full commission owed for this order once fully recognized. */
  fullOwedCents: number;
  /** Already reconciled (paid) on this order. */
  paidCents: number;
  /** Recognized, cleared, still unpaid: the amount to pay now. */
  payableNowCents: number;
};

/** Per-affiliate outstanding buckets, netting what has already been paid. */
export type AffiliatePayable = {
  /** Full commission across all commissionable orders (paid + unpaid). */
  fullOwedCents: number;
  /** Already paid on those orders (from reconciled_amount_cents). */
  paidCents: number;
  /** Recognized, cleared, still unpaid: safe to disburse now. */
  payableCents: number;
  /** Recognized but inside the clearing buffer. */
  clearingCents: number;
  /** Not yet recognized (future amortization periods). */
  upcomingCents: number;
  /** Per-order payable detail (only orders with a positive payable amount). */
  lines: PayableLine[];
};

/**
 * Aggregates orderCommission across an affiliate's orders and nets the amount
 * already paid per order (`paidByOrder`, keyed by lsOrderId), yielding the
 * outstanding payable / clearing / upcoming buckets. Assumes we never pay more
 * than the payable amount (paid <= payable), so paid offsets payable first.
 */
export function computeAffiliatePayable(
  terms: AffiliateTerms | null | undefined,
  orders: CommissionOrder[],
  paidByOrder: Map<string, number>,
  nowMs: number,
  allOrders?: CommissionOrder[],
): AffiliatePayable {
  const firstByBuyer = buildFirstOrderByBuyer(allOrders ?? orders);
  let fullOwedCents = 0;
  let paidCents = 0;
  let payableCents = 0;
  let clearingCents = 0;
  let upcomingCents = 0;
  const lines: PayableLine[] = [];

  for (const order of orders) {
    const firstMs = order.buyerUserId ? firstByBuyer.get(order.buyerUserId) ?? null : null;
    const oc = orderCommission(order, terms, firstMs, nowMs);
    if (!oc) continue;
    const paid = Math.max(0, paidByOrder.get(order.lsOrderId) ?? 0);
    const payableNow = Math.max(0, oc.payableOwedCents - paid);
    fullOwedCents += oc.fullOwedCents;
    paidCents += Math.min(paid, oc.fullOwedCents);
    payableCents += payableNow;
    clearingCents += oc.clearingOwedCents;
    upcomingCents += oc.upcomingOwedCents;
    if (payableNow > 0) {
      lines.push({
        lsOrderId: order.lsOrderId,
        fullOwedCents: oc.fullOwedCents,
        paidCents: Math.min(paid, oc.fullOwedCents),
        payableNowCents: payableNow,
      });
    }
  }

  return { fullOwedCents, paidCents, payableCents, clearingCents, upcomingCents, lines };
}

/** An open (unpaid) adjustment, narrowed to what the clawback netting needs. */
export type OpenAdjustment = { id: string; amountCents: number };

/**
 * Nets open CLAWBACK (negative) adjustments against a payable amount for the
 * automated disburse. Applies only clawbacks the payable FULLY covers, greedily
 * in the order given, so a clawback bigger than what is currently payable stays
 * open for a later payout rather than being partially settled. Positive
 * adjustments (make-whole) are ignored here: they settle on their own path.
 */
export function applyClawbacks(
  payableCents: number,
  openAdjustments: OpenAdjustment[],
): { netPayableCents: number; clawbackCents: number; appliedAdjustmentIds: string[] } {
  let coverage = payableCents;
  let clawbackCents = 0;
  const appliedAdjustmentIds: string[] = [];
  for (const a of openAdjustments) {
    if (!a.id || a.amountCents >= 0) continue;
    const debt = -a.amountCents;
    if (debt > 0 && debt <= coverage) {
      coverage -= debt;
      clawbackCents += debt;
      appliedAdjustmentIds.push(a.id);
    }
  }
  return { netPayableCents: payableCents - clawbackCents, clawbackCents, appliedAdjustmentIds };
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

/** The YYYY-MM month an ISO timestamp falls in (UTC), or null. */
export function monthKeyOf(iso: string | null): string | null {
  if (!iso || iso.length < 7) return null;
  return iso.slice(0, 7);
}

/**
 * The last `count` month labels ending at `endYear`-`endMonth1` (1-based),
 * oldest first. Callers pass the current UTC year/month (Date is banned in some
 * runtimes, so the caller supplies it).
 */
export function recentMonthLabels(endYear: number, endMonth1: number, count: number): string[] {
  const out: string[] = [];
  let y = endYear;
  let m = endMonth1; // 1-based
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out.reverse();
}
