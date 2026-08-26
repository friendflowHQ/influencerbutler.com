// Lemon Squeezy bank-payout estimation for the Finance dashboard.
//
// LS has no payouts API, so this module ESTIMATES the store balance and the
// next payout from order data (minus LS's fee, which defaults to 5% + 50 cents
// per order but is configurable), and the owner records each actual payout in
// finance_payouts. The drift between recorded and estimated totals is surfaced
// so the fee parameters can be calibrated over time. Never treat any figure
// here as exact.

import type { FinanceOrder } from "@/lib/finance-orders-data";
import type { FinanceSettings } from "@/lib/finance-settings";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Estimated net contribution of one order to the LS store balance:
 * (total - tax) minus the estimated LS fee, minus any refund. Refunds come
 * back out of the balance but LS keeps its fee, so a refunded order can go
 * negative on purpose.
 */
export function estimateOrderNetCents(order: FinanceOrder, settings: FinanceSettings): number {
  const base = order.totalUsdCents - order.taxUsdCents;
  if (base <= 0) return 0;
  const fee = Math.round((base * settings.lsFeePercent) / 100) + settings.lsFeeFixedCents;
  return base - fee - order.refundedUsdCents;
}

export type RecordedPayout = {
  id: string;
  amountCents: number;
  paidAt: string; // YYYY-MM-DD
  note: string | null;
};

export type PayoutForecast = {
  /** Estimated lifetime net revenue after LS fees and refunds. */
  estimatedNetAllTimeCents: number;
  /** Estimated LS fees paid, lifetime. */
  estimatedFeesAllTimeCents: number;
  /** Sum of payouts the owner has recorded as received. */
  recordedPayoutsCents: number;
  /** Estimated balance still sitting at LS (net minus recorded payouts). */
  estimatedUnpaidCents: number;
  /** Next expected payout date (from lsPayoutDayOfMonth), YYYY-MM-DD. */
  nextPayoutDate: string;
  /** Estimated amount of that payout (orders old enough to be included). */
  nextPayoutEstimateCents: number;
  /**
   * Calibration drift: recorded payouts minus the estimate for the same
   * horizon. Positive = we underestimate fees, negative = overestimate.
   * Null until at least one payout is recorded.
   */
  driftCents: number | null;
};

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Next occurrence of `dayOfMonth` strictly after `nowMs` (UTC). */
export function nextPayoutDateMs(nowMs: number, dayOfMonth: number): number {
  const d = new Date(nowMs);
  const thisMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), dayOfMonth);
  if (thisMonth > nowMs) return thisMonth;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, dayOfMonth);
}

export function computePayoutForecast(
  orders: FinanceOrder[],
  recorded: RecordedPayout[],
  settings: FinanceSettings,
  nowMs: number,
): PayoutForecast {
  let netAllTime = 0;
  let feesAllTime = 0;
  for (const order of orders) {
    const base = order.totalUsdCents - order.taxUsdCents;
    if (base > 0) {
      feesAllTime += Math.round((base * settings.lsFeePercent) / 100) + settings.lsFeeFixedCents;
    }
    netAllTime += estimateOrderNetCents(order, settings);
  }

  const recordedTotal = recorded.reduce((sum, p) => sum + p.amountCents, 0);

  const nextMs = nextPayoutDateMs(nowMs, settings.lsPayoutDayOfMonth);
  const eligibleCutoffMs = nextMs - settings.lsPayoutNetDelayDays * DAY_MS;
  let eligibleNet = 0;
  for (const order of orders) {
    if (!order.createdAt) continue;
    const createdMs = new Date(order.createdAt).getTime();
    if (Number.isFinite(createdMs) && createdMs <= eligibleCutoffMs) {
      eligibleNet += estimateOrderNetCents(order, settings);
    }
  }

  // Drift: compare what actually landed in the bank against the estimate for
  // the same horizon (orders old enough to have been included in the last
  // recorded payout).
  let driftCents: number | null = null;
  const lastPaidAt = recorded
    .map((p) => new Date(`${p.paidAt}T00:00:00Z`).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)[0];
  if (lastPaidAt !== undefined) {
    const horizonMs = lastPaidAt - settings.lsPayoutNetDelayDays * DAY_MS;
    let estimatedByHorizon = 0;
    for (const order of orders) {
      if (!order.createdAt) continue;
      const createdMs = new Date(order.createdAt).getTime();
      if (Number.isFinite(createdMs) && createdMs <= horizonMs) {
        estimatedByHorizon += estimateOrderNetCents(order, settings);
      }
    }
    driftCents = recordedTotal - estimatedByHorizon;
  }

  return {
    estimatedNetAllTimeCents: netAllTime,
    estimatedFeesAllTimeCents: feesAllTime,
    recordedPayoutsCents: recordedTotal,
    estimatedUnpaidCents: netAllTime - recordedTotal,
    nextPayoutDate: isoDate(nextMs),
    nextPayoutEstimateCents: Math.max(0, eligibleNet - recordedTotal),
    driftCents,
  };
}
