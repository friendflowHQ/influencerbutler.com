// Revenue recognition ("safe to spend") math for the Finance dashboard.
//
// Model (modeled on the affiliate commission engine's recognition buckets):
// each order's recognition base is what actually belongs to the LLC:
// total - tax (LS is merchant of record and remits the tax) - refunds. The
// base earns out straight-line daily over the subscription's service period:
// 365 days for annual, 30 for monthly and one-time. On top of earning, a
// configurable refund-hold window keeps freshly earned money out of the
// "releasable to the team" bucket until the order is refundHoldDays old.
//
// Pure functions only, so the math is unit-testable without a database.

import type { FinanceOrder, FinanceInterval } from "@/lib/finance-orders-data";
import type { FinanceSettings } from "@/lib/finance-settings";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Service period, in days, for a billing interval. */
export function recognitionPeriodDays(interval: FinanceInterval): number {
  return interval === "year" ? 365 : 30;
}

/** What the LLC actually keeps of an order (never negative). */
export function recognitionBaseCents(order: FinanceOrder): number {
  return Math.max(0, order.totalUsdCents - order.taxUsdCents - order.refundedUsdCents);
}

/** Straight-line earned-to-date portion of one order's base at `nowMs`. */
export function earnedCentsForOrder(order: FinanceOrder, nowMs: number): number {
  const base = recognitionBaseCents(order);
  if (base <= 0 || !order.createdAt) return 0;
  const createdMs = new Date(order.createdAt).getTime();
  if (!Number.isFinite(createdMs)) return 0;
  const periodDays = recognitionPeriodDays(order.interval);
  const elapsedDays = (nowMs - createdMs) / DAY_MS;
  const fraction = Math.min(1, Math.max(0, elapsedDays / periodDays));
  return Math.round(base * fraction);
}

export type RevenueBuckets = {
  /** Money collected that belongs to the LLC (total - tax - refunds). */
  collectedCents: number;
  /** Earned to date (services delivered): safe in an accounting sense. */
  earnedCents: number;
  /** Collected but not yet earned (future service still owed). */
  deferredCents: number;
  /** Earned AND past the refund-hold window: releasable to the team. */
  releasableCents: number;
  /** Earned but still inside the refund-hold window. */
  heldCents: number;
  orderCount: number;
};

export function computeRevenueBuckets(
  orders: FinanceOrder[],
  settings: FinanceSettings,
  nowMs: number,
): RevenueBuckets {
  let collected = 0;
  let earned = 0;
  let releasable = 0;
  let orderCount = 0;

  for (const order of orders) {
    const base = recognitionBaseCents(order);
    if (base <= 0) continue;
    orderCount++;
    collected += base;
    const orderEarned = earnedCentsForOrder(order, nowMs);
    earned += orderEarned;

    const createdMs = order.createdAt ? new Date(order.createdAt).getTime() : NaN;
    const pastHold =
      Number.isFinite(createdMs) &&
      nowMs - createdMs >= settings.refundHoldDays * DAY_MS;
    if (pastHold) releasable += orderEarned;
  }

  return {
    collectedCents: collected,
    earnedCents: earned,
    deferredCents: Math.max(0, collected - earned),
    releasableCents: releasable,
    heldCents: Math.max(0, earned - releasable),
    orderCount,
  };
}

export type RevenueGranularity = "day" | "week" | "month";

export type RevenueSeriesPoint = {
  /** Bucket start date, YYYY-MM-DD (UTC). */
  bucket: string;
  /** Net collections from orders created in this bucket. */
  collectedCents: number;
  /** Revenue earned (recognized) during this bucket across all orders. */
  earnedCents: number;
};

function utcDayStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function bucketStartMs(ms: number, granularity: RevenueGranularity): number {
  const d = new Date(ms);
  if (granularity === "month") {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  if (granularity === "week") {
    // Weeks start Monday (UTC).
    const day = utcDayStart(ms);
    const dow = new Date(day).getUTCDay(); // 0 = Sunday
    const offset = (dow + 6) % 7;
    return day - offset * DAY_MS;
  }
  return utcDayStart(ms);
}

function nextBucketStartMs(startMs: number, granularity: RevenueGranularity): number {
  if (granularity === "month") {
    const d = new Date(startMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return startMs + (granularity === "week" ? 7 : 1) * DAY_MS;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Time series of collections and earned revenue between [fromMs, toMs].
 * Earned revenue is distributed across buckets by overlapping each order's
 * daily earn-out with the bucket window (clipped at `nowMs`).
 */
export function buildRevenueSeries(
  orders: FinanceOrder[],
  granularity: RevenueGranularity,
  fromMs: number,
  toMs: number,
  nowMs: number,
): RevenueSeriesPoint[] {
  const points = new Map<number, { collected: number; earned: number }>();
  for (
    let start = bucketStartMs(fromMs, granularity);
    start <= toMs;
    start = nextBucketStartMs(start, granularity)
  ) {
    points.set(start, { collected: 0, earned: 0 });
  }

  for (const order of orders) {
    const base = recognitionBaseCents(order);
    if (base <= 0 || !order.createdAt) continue;
    const createdMs = new Date(order.createdAt).getTime();
    if (!Number.isFinite(createdMs)) continue;

    // Collections land in the bucket the order was created in.
    if (createdMs >= fromMs && createdMs <= toMs) {
      const key = bucketStartMs(createdMs, granularity);
      const p = points.get(key);
      if (p) p.collected += base;
    }

    // Earn-out: base spread evenly over the service period, clipped at now.
    const periodMs = recognitionPeriodDays(order.interval) * DAY_MS;
    const earnEnd = Math.min(createdMs + periodMs, nowMs);
    if (earnEnd <= createdMs) continue;
    const ratePerMs = base / periodMs;
    for (const [key, p] of points) {
      const bucketEnd = nextBucketStartMs(key, granularity);
      const overlap = Math.min(earnEnd, bucketEnd) - Math.max(createdMs, key);
      if (overlap > 0) p.earned += ratePerMs * overlap;
    }
  }

  return Array.from(points.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([key, p]) => ({
      bucket: isoDate(key),
      collectedCents: Math.round(p.collected),
      earnedCents: Math.round(p.earned),
    }));
}
