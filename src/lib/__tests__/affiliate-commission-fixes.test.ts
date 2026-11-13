// Affiliate commission fixes (2026-11-13): per-order interval, net USD base from
// a cutoff, partial refunds, refunded renewals, duplicate first charges, and the
// month-12 window edge.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  NET_BASIS_FROM,
  commissionBaseCents,
  orderCommission,
  orderEconomics,
  type CommissionOrder,
} from "../affiliate-commissions";
import { intervalByAmount, resolveOrderInterval } from "../order-interval";
import { clawbackTargetCents, isDuplicateInitialCharge, refundedShare } from "../order-refunds";

const DEFAULT_TERMS = { commissionPercent: null, commissionDurationMonths: null }; // 30%, 12 months

function order(over: Partial<CommissionOrder>): CommissionOrder {
  return {
    lsOrderId: "o1",
    buyerUserId: "b1",
    totalCents: 3900,
    currency: "USD",
    status: "paid",
    attributionStatus: "pending",
    reconciledAt: null,
    createdAt: "2026-12-05T00:00:00Z",
    ...over,
  };
}

const saved: Record<string, string | undefined> = {};
const ENV = { LEMONSQUEEZY_VARIANT_MONTHLY: "1533734", LEMONSQUEEZY_VARIANT_ANNUAL: "1533746" };
beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
});
afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("each order keeps its own monthly/annual label", () => {
  it("a monthly charge stays monthly after the buyer switches to annual", () => {
    // Buyer now on the annual variant; this $39 order was a monthly charge.
    expect(resolveOrderInterval({ chargeCents: 3900, variantId: "1533746", fallback: "year" })).toBe("month");
  });

  it("the switch charge (annual minus one month of credit) reads as annual", () => {
    expect(resolveOrderInterval({ chargeCents: 39000 - 3900, variantId: "1533746", fallback: "year" })).toBe("year");
  });

  it("an annual charge stays annual after the buyer moves back to monthly", () => {
    expect(resolveOrderInterval({ chargeCents: 39000, variantId: "1533734", fallback: "month" })).toBe("year");
  });

  it("a stamped interval always wins", () => {
    expect(resolveOrderInterval({ stored: "month", chargeCents: 39000, variantId: "1533734" })).toBe("month");
  });

  it("falls back to the buyer's interval when nothing else is known", () => {
    expect(resolveOrderInterval({ chargeCents: null, variantId: null, fallback: "year" })).toBe("year");
    expect(intervalByAmount(3900 * 2, 3900)).toBe("month"); // tax/odd amounts never cross 2.5x
  });

  it("the annual switch charge is paid out over 12 months, a monthly order at once", () => {
    const now = Date.parse("2027-01-01T00:00:00Z");
    const annual = orderCommission(order({ totalCents: 35100, billingInterval: "year" }), DEFAULT_TERMS, null, now)!;
    expect(annual.periods).toBe(12);
    expect(annual.fullOwedCents).toBe(Math.round(35100 * 0.3));
    const monthly = orderCommission(order({ billingInterval: "month" }), DEFAULT_TERMS, null, now)!;
    expect(monthly.periods).toBe(1);
    expect(monthly.payableOwedCents).toBe(Math.round(3900 * 0.3));
  });
});

describe("commission on net USD revenue from the cutoff", () => {
  it("new orders: USD total minus tax", () => {
    const o = order({ totalCents: 4290, totalUsdCents: 4290, taxUsdCents: 390, createdAt: NET_BASIS_FROM });
    expect(commissionBaseCents(o)).toBe(3900);
    expect(orderEconomics(o, DEFAULT_TERMS, null)!.owedCents).toBe(1170);
  });

  it("new non-USD orders use the USD figures", () => {
    const o = order({ totalCents: 3600, currency: "EUR", totalUsdCents: 4100, taxUsdCents: 700 });
    expect(commissionBaseCents(o)).toBe(3400);
  });

  it("orders before the cutoff keep their old gross basis", () => {
    const o = order({ totalCents: 4290, totalUsdCents: 4290, taxUsdCents: 390, createdAt: "2026-11-01T00:00:00Z" });
    expect(commissionBaseCents(o)).toBe(4290);
  });
});

describe("refunds", () => {
  it("a partial refund keeps commission on the unrefunded part", () => {
    const o = order({ status: "partial_refund", totalCents: 39000, totalUsdCents: 39000, refundedUsdCents: 9750, billingInterval: "year" });
    expect(commissionBaseCents(o)).toBe(29250);
    expect(orderEconomics(o, DEFAULT_TERMS, null)!.owedCents).toBe(Math.round(29250 * 0.3));
    // Old orders too: scaled by the unrefunded share.
    const old = order({ status: "partial_refund", totalCents: 39000, totalUsdCents: 39000, refundedUsdCents: 9750, createdAt: "2026-10-01T00:00:00Z" });
    expect(commissionBaseCents(old)).toBe(29250);
  });

  it("a full refund earns nothing", () => {
    expect(orderEconomics(order({ status: "refunded" }), DEFAULT_TERMS, null)).toBeNull();
  });

  it("claws back only the refunded share, and tops up on a later full refund", () => {
    expect(refundedShare("partial_refund", 9750, 39000)).toBeCloseTo(0.25);
    expect(refundedShare("refunded", null, null)).toBe(1);
    expect(refundedShare("partial_refund", null, 39000)).toBe(0);
    expect(clawbackTargetCents(4000, 0.25)).toBe(1000);
    // Webhook inserts target minus what was already clawed back.
    expect(clawbackTargetCents(4000, 1) - 1000).toBe(3000);
  });
});

describe("duplicate first charges", () => {
  it("skips an initial invoice that order_created already stored", () => {
    const recent = [{ ls_order_id: "ord_1", total: 3900, status: "paid" }];
    expect(isDuplicateInitialCharge("inv_9", 3900, recent)).toBe(true);
    expect(isDuplicateInitialCharge("ord_1", 3900, recent)).toBe(false); // same row: upsert merges
    expect(isDuplicateInitialCharge("inv_9", 0, recent)).toBe(false); // $0 trial start
    expect(isDuplicateInitialCharge("inv_9", 4900, recent)).toBe(false); // different charge
  });
});

describe("12-month window edge", () => {
  it("a renewal on the month-12 anniversary still counts; month 13 does not", () => {
    const first = Date.parse("2026-01-15T10:00:00Z");
    const atTwelve = order({ createdAt: "2027-01-15T10:00:30Z" });
    expect(orderEconomics(atTwelve, DEFAULT_TERMS, first)).not.toBeNull();
    const atThirteen = order({ createdAt: "2027-02-15T10:00:00Z" });
    expect(orderEconomics(atThirteen, DEFAULT_TERMS, first)).toBeNull();
  });

  it("lifetime (custom-rate) affiliates have no window", () => {
    const first = Date.parse("2024-01-01T00:00:00Z");
    expect(orderEconomics(order({}), { commissionPercent: 70, commissionDurationMonths: null }, first)!.owedCents).toBe(2730);
  });
});
