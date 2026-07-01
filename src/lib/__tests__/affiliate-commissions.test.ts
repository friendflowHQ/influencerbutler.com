/**
 * Summary: Unit tests for the shared affiliate commission engine (owed top-up math).
 * Dependencies: vitest, ../affiliate-commissions.
 */

import { describe, it, expect } from "vitest";
import {
  computeAffiliateOwed,
  computeOrderOwed,
  orderEconomics,
  resolveRatePercent,
  periodBounds,
  orderInPeriod,
  monthKeyOf,
  recentMonthLabels,
  type AffiliateTerms,
  type CommissionOrder,
} from "../affiliate-commissions";

const LIFETIME_70: AffiliateTerms = { commissionPercent: 70, commissionDurationMonths: null };
const YEARLY_70: AffiliateTerms = { commissionPercent: 70, commissionDurationMonths: 12 };

function order(overrides: Partial<CommissionOrder>): CommissionOrder {
  return {
    lsOrderId: overrides.lsOrderId ?? "o1",
    buyerUserId: overrides.buyerUserId ?? "buyer1",
    totalCents: overrides.totalCents ?? 10000, // $100
    currency: overrides.currency ?? "USD",
    status: overrides.status ?? "paid",
    attributionStatus: overrides.attributionStatus ?? "live",
    reconciledAt: overrides.reconciledAt ?? null,
    createdAt: overrides.createdAt ?? "2026-01-15T00:00:00.000Z",
  };
}

describe("resolveRatePercent", () => {
  it("uses the affiliate's rate when set", () => {
    expect(resolveRatePercent(LIFETIME_70)).toBe(70);
  });
  it("falls back to 30 when unset or invalid", () => {
    expect(resolveRatePercent(null)).toBe(30);
    expect(resolveRatePercent({ commissionPercent: null, commissionDurationMonths: null })).toBe(30);
    expect(resolveRatePercent({ commissionPercent: 200, commissionDurationMonths: null })).toBe(30);
  });
});

describe("computeOrderOwed", () => {
  it("live order within 12mo owes rate minus LS 30%", () => {
    // $100 order, 70% promised, LS paid 30% => owe 40% = $40.
    const line = computeOrderOwed(
      order({ createdAt: "2026-03-01T00:00:00.000Z", attributionStatus: "live" }),
      LIFETIME_70,
      new Date("2026-01-01T00:00:00.000Z").getTime(),
    );
    expect(line).not.toBeNull();
    expect(line!.lsPaidCents).toBe(3000);
    expect(line!.owedCents).toBe(4000);
  });

  it("lifetime live renewal past 12mo owes the full rate (LS paid nothing)", () => {
    // Order 14 months after the customer's first order: LS's window has closed.
    const line = computeOrderOwed(
      order({ createdAt: "2027-03-01T00:00:00.000Z", attributionStatus: "live" }),
      LIFETIME_70,
      new Date("2026-01-01T00:00:00.000Z").getTime(),
    );
    expect(line).not.toBeNull();
    expect(line!.lsPaidCents).toBe(0);
    expect(line!.owedCents).toBe(7000); // full 70%
  });

  it("pending gap order owes the full rate", () => {
    const line = computeOrderOwed(
      order({ attributionStatus: "pending" }),
      LIFETIME_70,
      new Date("2026-01-01T00:00:00.000Z").getTime(),
    );
    expect(line).not.toBeNull();
    expect(line!.lsPaidCents).toBe(0);
    expect(line!.owedCents).toBe(7000);
  });

  it("yearly-duration affiliate order past its window owes nothing", () => {
    // 14 months after first order, duration is 12 months => outside window.
    const line = computeOrderOwed(
      order({ createdAt: "2027-03-01T00:00:00.000Z", attributionStatus: "live" }),
      YEARLY_70,
      new Date("2026-01-01T00:00:00.000Z").getTime(),
    );
    expect(line).toBeNull();
  });

  it("refunded order is excluded", () => {
    const line = computeOrderOwed(order({ status: "refunded" }), LIFETIME_70, null);
    expect(line).toBeNull();
  });

  it("already-reconciled order is excluded", () => {
    const line = computeOrderOwed(
      order({ reconciledAt: "2026-02-01T00:00:00.000Z" }),
      LIFETIME_70,
      null,
    );
    expect(line).toBeNull();
  });

  it("default 30% affiliate on a live order owes nothing (LS already covers it)", () => {
    const line = computeOrderOwed(order({ attributionStatus: "live" }), null, null);
    expect(line).not.toBeNull();
    expect(line!.owedCents).toBe(0);
  });
});

describe("computeAffiliateOwed", () => {
  it("aggregates a mix of live and pending orders and anchors windows per buyer", () => {
    const orders: CommissionOrder[] = [
      order({ lsOrderId: "a", buyerUserId: "b1", createdAt: "2026-01-10T00:00:00.000Z", attributionStatus: "live" }),
      order({ lsOrderId: "b", buyerUserId: "b1", createdAt: "2026-02-10T00:00:00.000Z", attributionStatus: "live" }),
      order({ lsOrderId: "c", buyerUserId: "b2", createdAt: "2026-02-10T00:00:00.000Z", attributionStatus: "pending" }),
    ];
    const result = computeAffiliateOwed(LIFETIME_70, orders);
    expect(result.orderCount).toBe(3);
    expect(result.grossCents).toBe(30000);
    // Two live within window: 30% each = 6000; one pending: 0 LS paid.
    expect(result.lsPaidCents).toBe(6000);
    // 70% of 30000 = 21000, minus 6000 LS = 15000 owed.
    expect(result.owedCents).toBe(15000);
    expect(result.ratePercent).toBe(70);
    expect(result.durationMonths).toBeNull();
  });
});

describe("orderEconomics (analytics, includes paid orders)", () => {
  it("still counts a reconciled order (unlike computeOrderOwed)", () => {
    const paid = order({ reconciledAt: "2026-02-01T00:00:00.000Z", attributionStatus: "live" });
    expect(computeOrderOwed(paid, LIFETIME_70, null)).toBeNull();
    const econ = orderEconomics(paid, LIFETIME_70, new Date("2026-01-01T00:00:00.000Z").getTime());
    expect(econ).not.toBeNull();
    expect(econ!.grossCents).toBe(10000);
    expect(econ!.lsPaidCents).toBe(3000);
    expect(econ!.owedCents).toBe(4000);
  });
  it("excludes refunded and out-of-window orders", () => {
    expect(orderEconomics(order({ status: "refunded" }), LIFETIME_70, null)).toBeNull();
    expect(
      orderEconomics(
        order({ createdAt: "2027-03-01T00:00:00.000Z" }),
        YEARLY_70,
        new Date("2026-01-01T00:00:00.000Z").getTime(),
      ),
    ).toBeNull();
  });
});

describe("month helpers", () => {
  it("monthKeyOf extracts YYYY-MM (UTC)", () => {
    expect(monthKeyOf("2026-06-15T23:00:00.000Z")).toBe("2026-06");
    expect(monthKeyOf(null)).toBeNull();
    expect(monthKeyOf("2026")).toBeNull();
  });
  it("recentMonthLabels returns trailing months oldest-first, crossing year boundary", () => {
    expect(recentMonthLabels(2026, 2, 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(recentMonthLabels(2026, 7, 1)).toEqual(["2026-07"]);
  });
});

describe("periodBounds / orderInPeriod", () => {
  it("parses a YYYY-MM period into UTC bounds", () => {
    const bounds = periodBounds("2026-06");
    expect(bounds).toEqual({
      startIso: "2026-06-01T00:00:00.000Z",
      endIso: "2026-07-01T00:00:00.000Z",
    });
  });
  it("rejects malformed periods", () => {
    expect(periodBounds("2026-13")).toBeNull();
    expect(periodBounds("nope")).toBeNull();
  });
  it("includes orders in the month and excludes the boundary", () => {
    const bounds = periodBounds("2026-06")!;
    expect(orderInPeriod(order({ createdAt: "2026-06-15T00:00:00.000Z" }), bounds)).toBe(true);
    expect(orderInPeriod(order({ createdAt: "2026-07-01T00:00:00.000Z" }), bounds)).toBe(false);
    expect(orderInPeriod(order({ createdAt: "2026-05-31T23:59:59.000Z" }), bounds)).toBe(false);
  });
});
