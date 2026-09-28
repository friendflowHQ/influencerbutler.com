/**
 * Summary: Unit tests for the shared affiliate commission engine (owed top-up math).
 * Dependencies: vitest, ../affiliate-commissions.
 */

import { describe, it, expect } from "vitest";
import {
  amortizationPeriods,
  applyClawbacks,
  computeAffiliateEarnedCents,
  computeAffiliateOwed,
  computeAffiliatePayable,
  computeOrderOwed,
  orderCommission,
  orderEconomics,
  resolveRatePercent,
  resolveDurationMonths,
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
    billingInterval: overrides.billingInterval ?? null,
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

describe("resolveDurationMonths", () => {
  it("caps a default-rate affiliate at 12 months", () => {
    expect(resolveDurationMonths(null)).toBe(12);
    expect(resolveDurationMonths({ commissionPercent: null, commissionDurationMonths: null })).toBe(12);
  });
  it("treats a custom-rate affiliate with no explicit duration as lifetime", () => {
    expect(resolveDurationMonths(LIFETIME_70)).toBeNull();
  });
  it("honors an explicit positive duration for either kind", () => {
    expect(resolveDurationMonths(YEARLY_70)).toBe(12);
    expect(resolveDurationMonths({ commissionPercent: null, commissionDurationMonths: 6 })).toBe(6);
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

describe("computeAffiliateEarnedCents", () => {
  it("counts full earnings on all orders, INCLUDING reconciled ones", () => {
    const orders: CommissionOrder[] = [
      // pending, unreconciled: full 70% of $100 = 7000.
      order({ lsOrderId: "a", buyerUserId: "b1", attributionStatus: "pending" }),
      // pending, already reconciled: computeAffiliateOwed excludes it, earned counts it.
      order({
        lsOrderId: "b",
        buyerUserId: "b2",
        attributionStatus: "pending",
        reconciledAt: "2026-02-01T00:00:00.000Z",
      }),
    ];
    // Owed excludes the reconciled order.
    expect(computeAffiliateOwed(LIFETIME_70, orders).owedCents).toBe(7000);
    // Earned includes both: 7000 + 7000.
    expect(computeAffiliateEarnedCents(LIFETIME_70, orders)).toBe(14000);
  });

  it("earned on a live in-window order is the full promised rate (lsPaid + owed)", () => {
    // $100 live within LS window: LS paid 30% (3000), we owe 40% (4000), earned = 70% (7000).
    const orders = [
      order({
        createdAt: "2026-03-01T00:00:00.000Z",
        attributionStatus: "live",
        buyerUserId: "b1",
      }),
    ];
    const anchor: CommissionOrder[] = [
      order({ lsOrderId: "anchor", createdAt: "2026-01-01T00:00:00.000Z", buyerUserId: "b1" }),
      ...orders,
    ];
    expect(computeAffiliateEarnedCents(LIFETIME_70, orders, anchor)).toBe(7000);
  });

  it("excludes non-commissionable orders (refunded / out of window)", () => {
    const orders: CommissionOrder[] = [order({ status: "refunded" })];
    expect(computeAffiliateEarnedCents(LIFETIME_70, orders)).toBe(0);
  });
});

describe("amortizationPeriods", () => {
  it("annual spreads over 12, everything else is a single period", () => {
    expect(amortizationPeriods("year")).toBe(12);
    expect(amortizationPeriods("month")).toBe(1);
    expect(amortizationPeriods(null)).toBe(1);
    expect(amortizationPeriods(undefined)).toBe(1);
  });
});

describe("orderCommission (recognition + clearing)", () => {
  const ms = (iso: string) => new Date(iso).getTime();

  it("monthly order inside the 14-day clear is recognized but NOT payable", () => {
    const o = order({ createdAt: "2026-01-01T00:00:00.000Z", attributionStatus: "pending" });
    const oc = orderCommission(o, LIFETIME_70, null, ms("2026-01-06T00:00:00.000Z"));
    expect(oc).not.toBeNull();
    expect(oc!.fullOwedCents).toBe(7000); // 70% of $100
    expect(oc!.recognizedOwedCents).toBe(7000);
    expect(oc!.payableOwedCents).toBe(0);
    expect(oc!.clearingOwedCents).toBe(7000);
  });

  it("monthly order past the 14-day clear is fully payable", () => {
    const o = order({ createdAt: "2026-01-01T00:00:00.000Z", attributionStatus: "pending" });
    const oc = orderCommission(o, LIFETIME_70, null, ms("2026-01-20T00:00:00.000Z"));
    expect(oc!.payableOwedCents).toBe(7000);
    expect(oc!.clearingOwedCents).toBe(0);
    expect(oc!.upcomingOwedCents).toBe(0);
  });

  it("annual order amortizes 1/12 per month; only cleared twelfths are payable", () => {
    // $1200 annual, 70% => $840 full owed, $70 per twelfth.
    const o = order({
      totalCents: 120000,
      createdAt: "2026-01-15T00:00:00.000Z",
      attributionStatus: "pending",
      billingInterval: "year",
    });
    // By Mar 20: twelfths recognized at Jan15, Feb15, Mar15 => 3 recognized.
    // Payable (recognition + 14d): Jan29, Mar01, Mar29 <= Mar20 => 2 payable.
    const oc = orderCommission(o, LIFETIME_70, null, ms("2026-03-20T00:00:00.000Z"));
    expect(oc!.fullOwedCents).toBe(84000);
    expect(oc!.recognizedOwedCents).toBe(21000); // 3/12
    expect(oc!.payableOwedCents).toBe(14000); // 2/12
    expect(oc!.clearingOwedCents).toBe(7000); // 1/12
    expect(oc!.upcomingOwedCents).toBe(63000); // 9/12
  });

  it("annual order past a full year is fully recognized and payable", () => {
    const o = order({
      totalCents: 120000,
      createdAt: "2026-01-15T00:00:00.000Z",
      attributionStatus: "pending",
      billingInterval: "year",
    });
    const oc = orderCommission(o, LIFETIME_70, null, ms("2027-06-01T00:00:00.000Z"));
    expect(oc!.recognizedOwedCents).toBe(84000);
    expect(oc!.payableOwedCents).toBe(84000);
    expect(oc!.upcomingOwedCents).toBe(0);
  });
});

describe("computeAffiliatePayable", () => {
  const ms = (iso: string) => new Date(iso).getTime();

  it("nets already-paid amounts out of the payable bucket", () => {
    const o = order({
      lsOrderId: "annual1",
      totalCents: 120000,
      createdAt: "2026-01-15T00:00:00.000Z",
      attributionStatus: "pending",
      billingInterval: "year",
    });
    // Same anchor as above: 2/12 = $140 payable, we've already paid $70 (1/12).
    const paid = new Map<string, number>([["annual1", 7000]]);
    const res = computeAffiliatePayable(LIFETIME_70, [o], paid, ms("2026-03-20T00:00:00.000Z"));
    expect(res.fullOwedCents).toBe(84000);
    expect(res.paidCents).toBe(7000);
    expect(res.payableCents).toBe(7000); // 14000 payable - 7000 already paid
    expect(res.clearingCents).toBe(7000);
    expect(res.upcomingCents).toBe(63000);
    expect(res.lines).toEqual([
      { lsOrderId: "annual1", fullOwedCents: 84000, paidCents: 7000, payableNowCents: 7000 },
    ]);
  });

  it("a monthly order in the clearing window contributes 0 payable", () => {
    const o = order({
      lsOrderId: "m1",
      createdAt: "2026-01-01T00:00:00.000Z",
      attributionStatus: "pending",
    });
    const res = computeAffiliatePayable(
      LIFETIME_70,
      [o],
      new Map(),
      ms("2026-01-05T00:00:00.000Z"),
    );
    expect(res.payableCents).toBe(0);
    expect(res.clearingCents).toBe(7000);
    expect(res.lines).toEqual([]); // nothing payable yet -> no payout lines
  });
});

describe("applyClawbacks", () => {
  it("nets a fully-covered clawback and reports the id", () => {
    const res = applyClawbacks(10000, [{ id: "c1", amountCents: -3000 }]);
    expect(res.netPayableCents).toBe(7000);
    expect(res.clawbackCents).toBe(3000);
    expect(res.appliedAdjustmentIds).toEqual(["c1"]);
  });

  it("leaves a clawback larger than the payable OPEN (no partial settle)", () => {
    const res = applyClawbacks(2000, [{ id: "c1", amountCents: -3000 }]);
    expect(res.netPayableCents).toBe(2000);
    expect(res.clawbackCents).toBe(0);
    expect(res.appliedAdjustmentIds).toEqual([]);
  });

  it("ignores positive (make-whole) adjustments", () => {
    const res = applyClawbacks(5000, [
      { id: "p1", amountCents: 4000 },
      { id: "c1", amountCents: -1500 },
    ]);
    expect(res.netPayableCents).toBe(3500);
    expect(res.appliedAdjustmentIds).toEqual(["c1"]);
  });

  it("applies multiple clawbacks greedily while they fit", () => {
    const res = applyClawbacks(5000, [
      { id: "c1", amountCents: -2000 },
      { id: "c2", amountCents: -2000 },
      { id: "c3", amountCents: -2000 }, // would overflow the remaining 1000 -> stays open
    ]);
    expect(res.netPayableCents).toBe(1000);
    expect(res.clawbackCents).toBe(4000);
    expect(res.appliedAdjustmentIds).toEqual(["c1", "c2"]);
  });
});

describe("post-cutover steady state (all captures are 'pending')", () => {
  // After the self-hosted cutover we never append aff_ref, so LS pays nothing
  // and every new referred order is captured 'pending'. The engine then owes the
  // FULL promised rate with lsPaidCents=0, subtracting nothing. How long that
  // keeps accruing depends on the affiliate's honored window: a custom-rate deal
  // (e.g. Samantha) with no explicit duration runs for the customer's lifetime,
  // while a default-rate affiliate is capped at 12 months to match the advertised
  // offer. These cases document that steady state.
  const DEFAULT_30: AffiliateTerms = { commissionPercent: null, commissionDurationMonths: null };

  it("default-30% affiliate now owes the full 30% within its window (LS no longer covers it)", () => {
    // Contrast with the legacy 'live' case below, where the same affiliate owed 0.
    const line = computeOrderOwed(order({ attributionStatus: "pending" }), DEFAULT_30, null);
    expect(line).not.toBeNull();
    expect(line!.lsPaidCents).toBe(0);
    expect(line!.owedCents).toBe(3000); // full 30% of $100
  });

  it("default-30% affiliate owes nothing past its 12-month window", () => {
    // 14 months after the buyer's first order: a default affiliate is capped at
    // 12 months, so no top-up accrues (unlike a custom-lifetime affiliate).
    const line = computeOrderOwed(
      order({ createdAt: "2027-03-01T00:00:00.000Z", attributionStatus: "pending" }),
      DEFAULT_30,
      new Date("2026-01-01T00:00:00.000Z").getTime(),
    );
    expect(line).toBeNull();
  });

  it("legacy live default-30% order still owes 0 (overlap-period regression guard)", () => {
    const line = computeOrderOwed(order({ attributionStatus: "live" }), DEFAULT_30, null);
    expect(line!.owedCents).toBe(0);
  });

  it("all-pending cohort: monthly, annual, and past-12mo renewals all owe full rate", () => {
    const anchor = new Date("2026-01-01T00:00:00.000Z").getTime();
    const orders: CommissionOrder[] = [
      order({ lsOrderId: "m1", buyerUserId: "b1", createdAt: "2026-01-10T00:00:00.000Z", attributionStatus: "pending" }),
      order({ lsOrderId: "m2", buyerUserId: "b1", createdAt: "2026-06-10T00:00:00.000Z", attributionStatus: "pending" }),
      // 15 months out: irrelevant now that LS is out of the loop.
      order({ lsOrderId: "m3", buyerUserId: "b1", createdAt: "2027-04-10T00:00:00.000Z", attributionStatus: "pending" }),
    ];
    const result = computeAffiliateOwed(LIFETIME_70, orders, orders);
    expect(result.lsPaidCents).toBe(0);
    expect(result.grossCents).toBe(30000);
    expect(result.owedCents).toBe(21000); // full 70% of $300, nothing subtracted
    void anchor;
  });

  it("a yearly-duration affiliate still stops owing past their own window", () => {
    // The cutover does NOT change the affiliate's own honored duration window;
    // only LS's 12-month subtraction becomes moot. A 12-month affiliate still
    // earns nothing on an order 14 months after the buyer's first order.
    const line = computeOrderOwed(
      order({ createdAt: "2027-03-01T00:00:00.000Z", attributionStatus: "pending" }),
      YEARLY_70,
      new Date("2026-01-01T00:00:00.000Z").getTime(),
    );
    expect(line).toBeNull();
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
