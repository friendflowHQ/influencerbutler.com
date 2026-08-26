import { describe, expect, it } from "vitest";
import {
  computeRevenueBuckets,
  earnedCentsForOrder,
  buildRevenueSeries,
  recognitionBaseCents,
} from "@/lib/finance-revenue";
import { estimateOrderNetCents, computePayoutForecast, nextPayoutDateMs } from "@/lib/finance-ls-payouts";
import { computeTaxSetAside, taxQuartersForYear, nextDeadline, daysUntil } from "@/lib/finance-tax";
import {
  expandRecurring,
  defaultUseTaxForCategory,
  computeItemUseTax,
} from "@/lib/finance-expenses";
import { DEFAULT_FINANCE_SETTINGS, normalizeFinanceSettings } from "@/lib/finance-settings";
import { buildPnlFromData } from "@/lib/finance-report";
import type { FinanceOrder } from "@/lib/finance-orders-data";

const DAY_MS = 24 * 60 * 60 * 1000;

function order(overrides: Partial<FinanceOrder>): FinanceOrder {
  return {
    lsOrderId: "1",
    createdAt: "2026-01-01T00:00:00Z",
    status: "paid",
    totalUsdCents: 29000,
    taxUsdCents: 0,
    refundedUsdCents: 0,
    refundedAt: null,
    interval: "year",
    enriched: true,
    ...overrides,
  };
}

describe("finance-revenue", () => {
  const created = Date.UTC(2026, 0, 1);
  const annual = order({ totalUsdCents: 29000, interval: "year" });

  it("annual order earns 0% at day 0, ~50% at day 182.5, 100% at day 365", () => {
    expect(earnedCentsForOrder(annual, created)).toBe(0);
    const half = earnedCentsForOrder(annual, created + 182.5 * DAY_MS);
    expect(half).toBe(14500);
    expect(earnedCentsForOrder(annual, created + 365 * DAY_MS)).toBe(29000);
    // Never exceeds the base after the period ends.
    expect(earnedCentsForOrder(annual, created + 900 * DAY_MS)).toBe(29000);
  });

  it("monthly order earns fully over 30 days", () => {
    const monthly = order({ totalUsdCents: 2900, interval: "month" });
    expect(earnedCentsForOrder(monthly, created + 15 * DAY_MS)).toBe(1450);
    expect(earnedCentsForOrder(monthly, created + 30 * DAY_MS)).toBe(2900);
  });

  it("recognition base excludes LS-remitted tax and refunds", () => {
    const o = order({ totalUsdCents: 2900, taxUsdCents: 200, refundedUsdCents: 500 });
    expect(recognitionBaseCents(o)).toBe(2200);
  });

  it("refund hold keeps young orders out of releasable", () => {
    const settings = DEFAULT_FINANCE_SETTINGS; // 30-day hold
    const young = order({ lsOrderId: "y", interval: "month", totalUsdCents: 3000, createdAt: new Date(created).toISOString() });
    const now = created + 15 * DAY_MS; // earned 1500, but only 15 days old
    const buckets = computeRevenueBuckets([young], settings, now);
    expect(buckets.earnedCents).toBe(1500);
    expect(buckets.releasableCents).toBe(0);
    expect(buckets.heldCents).toBe(1500);
    const later = computeRevenueBuckets([young], settings, created + 31 * DAY_MS);
    expect(later.releasableCents).toBe(later.earnedCents);
  });

  it("series distributes earned revenue across buckets and sums to earned-to-date", () => {
    const monthly = order({ totalUsdCents: 3000, interval: "month" });
    const now = created + 30 * DAY_MS;
    const series = buildRevenueSeries([monthly], "day", created, now, now);
    const summed = series.reduce((s, p) => s + p.earnedCents, 0);
    expect(Math.abs(summed - 3000)).toBeLessThanOrEqual(series.length); // rounding
    expect(series.reduce((s, p) => s + p.collectedCents, 0)).toBe(3000);
  });
});

describe("finance-ls-payouts", () => {
  it("estimates net after the configurable fee", () => {
    const o = order({ totalUsdCents: 10050, taxUsdCents: 50 });
    // base 10000 -> 5% (500) + 50 fixed = 9450
    expect(estimateOrderNetCents(o, DEFAULT_FINANCE_SETTINGS)).toBe(9450);
  });

  it("refunds subtract from the balance while LS keeps its fee", () => {
    const o = order({ totalUsdCents: 10000, refundedUsdCents: 10000 });
    // base 10000, fee 550, refund 10000 -> -550
    expect(estimateOrderNetCents(o, DEFAULT_FINANCE_SETTINGS)).toBe(-550);
  });

  it("next payout date rolls to next month after the payout day", () => {
    const before = Date.UTC(2026, 7, 5);
    expect(new Date(nextPayoutDateMs(before, 10)).toISOString().slice(0, 10)).toBe("2026-08-10");
    const after = Date.UTC(2026, 7, 26);
    expect(new Date(nextPayoutDateMs(after, 10)).toISOString().slice(0, 10)).toBe("2026-09-10");
  });

  it("forecast nets recorded payouts and respects the delay window", () => {
    const now = Date.UTC(2026, 7, 26);
    const oldOrder = order({ lsOrderId: "a", createdAt: "2026-07-01T00:00:00Z", totalUsdCents: 10050, taxUsdCents: 50 });
    const freshOrder = order({ lsOrderId: "b", createdAt: "2026-08-30T00:00:00Z", totalUsdCents: 10050, taxUsdCents: 50 });
    const forecast = computePayoutForecast(
      [oldOrder, freshOrder],
      [{ id: "p1", amountCents: 5000, paidAt: "2026-08-10", note: null }],
      DEFAULT_FINANCE_SETTINGS,
      now,
    );
    expect(forecast.estimatedNetAllTimeCents).toBe(18900);
    expect(forecast.recordedPayoutsCents).toBe(5000);
    expect(forecast.estimatedUnpaidCents).toBe(13900);
    // Next payout 2026-09-10, cutoff 08-27: only the old order is eligible,
    // so the estimate is its net (9450) minus the 5000 already paid out.
    expect(forecast.nextPayoutDate).toBe("2026-09-10");
    expect(forecast.nextPayoutEstimateCents).toBe(4450);
    expect(forecast.driftCents).not.toBeNull();
  });
});

describe("finance-tax", () => {
  it("defines the four IRS quarters with correct due dates", () => {
    const q = taxQuartersForYear(2026);
    expect(q[0].dueDate).toBe("2026-04-15");
    expect(q[1].dueDate).toBe("2026-06-15");
    expect(q[2].dueDate).toBe("2026-09-15");
    expect(q[3].dueDate).toBe("2027-01-15");
  });

  it("finds the next deadline across year boundaries", () => {
    expect(nextDeadline("2026-08-26").quarter.dueDate).toBe("2026-09-15");
    expect(nextDeadline("2026-12-20").quarter.dueDate).toBe("2027-01-15");
    expect(nextDeadline("2026-01-10").quarter.dueDate).toBe("2026-01-15");
    expect(daysUntil("2026-08-26", "2026-09-15")).toBe(20);
  });

  it("passthrough set-aside stacks SE + federal + Utah", () => {
    const s = DEFAULT_FINANCE_SETTINGS;
    const result = computeTaxSetAside(1000000, s); // $10,000 profit
    // SE: 10000 * .9235 * .153 = 1412.955 -> 141,296 cents? No: cents math.
    const seBase = Math.round((1000000 * 92.35) / 100);
    const seTax = Math.round((seBase * 15.3) / 100);
    expect(result.seTaxCents).toBe(seTax);
    // SE tax splits into Social Security (12.4/15.3) + Medicare (remainder).
    const ss = Math.round(seTax * (12.4 / 15.3));
    expect(result.socialSecurityCents).toBe(ss);
    expect(result.medicareCents).toBe(seTax - ss);
    expect(result.socialSecurityCents + result.medicareCents).toBe(seTax);
    // Federal uses the configured rate (default 12%).
    const federal = Math.round((1000000 - Math.round(seTax / 2)) * (s.federalRatePercent / 100));
    expect(result.federalCents).toBe(federal);
    expect(result.utahCents).toBe(Math.round(1000000 * 0.0455));
    expect(result.totalCents).toBe(seTax + federal + result.utahCents);
  });

  it("scorp mode drops SE tax and uses the distribution rate", () => {
    const s = normalizeFinanceSettings({ ...DEFAULT_FINANCE_SETTINGS, taxMode: "scorp" });
    const result = computeTaxSetAside(1000000, s);
    expect(result.seTaxCents).toBe(0);
    expect(result.federalCents).toBe(200000);
  });

  it("losses set aside nothing", () => {
    expect(computeTaxSetAside(-5000, DEFAULT_FINANCE_SETTINGS).totalCents).toBe(0);
  });
});

describe("finance-expenses expandRecurring", () => {
  const template = {
    id: "t1",
    vendor: "Resend",
    category: "software_hosting" as const,
    amountCents: 2000,
    dayOfMonth: 1,
    startsOn: "2026-09-01",
    cancelledOn: null as string | null,
    note: null,
    useTax: "na" as const,
  };

  it("emits one occurrence per month from starts_on", () => {
    const items = expandRecurring([template], "2026-08-01", "2026-11-30");
    expect(items.map((i) => i.date)).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
  });

  it("stops at cancelled_on", () => {
    const items = expandRecurring(
      [{ ...template, cancelledOn: "2026-11-01" }],
      "2026-08-01",
      "2026-12-31",
    );
    expect(items.map((i) => i.date)).toEqual(["2026-09-01", "2026-10-01"]);
  });
});

describe("finance use tax", () => {
  it("defaults software/hosting to the configured software default, else na", () => {
    expect(defaultUseTaxForCategory("software_hosting", "review")).toBe("review");
    expect(defaultUseTaxForCategory("software_hosting", "na")).toBe("na");
    expect(defaultUseTaxForCategory("office_expense", "review")).toBe("na");
    expect(defaultUseTaxForCategory("insurance", "review")).toBe("na");
  });

  it("computes use tax only for owed/review rows at the given rate", () => {
    // $2,000 at 7.25% = $145.00
    expect(computeItemUseTax({ amountCents: 200000, useTax: "owed" }, 7.25)).toBe(14500);
    expect(computeItemUseTax({ amountCents: 200000, useTax: "review" }, 7.25)).toBe(14500);
    expect(computeItemUseTax({ amountCents: 200000, useTax: "na" }, 7.25)).toBe(0);
    expect(computeItemUseTax({ amountCents: 200000, useTax: "exempt" }, 7.25)).toBe(0);
  });

  it("P&L sums use tax only for 'owed' rows", () => {
    const orders: FinanceOrder[] = [];
    const expenses = [
      { category: "software_hosting", amountCents: 2686, useTax: "owed" as const },
      { category: "software_hosting", amountCents: 2000, useTax: "review" as const },
      { category: "office_expense", amountCents: 2000, useTax: "na" as const },
    ];
    const pnl = buildPnlFromData(
      orders,
      expenses,
      "2026-08-01",
      "2026-08-31",
      DEFAULT_FINANCE_SETTINGS,
    );
    // Only the 'owed' row: round(2686 * 7.25 / 100) = 195
    expect(pnl.useTaxOwedCents).toBe(Math.round((2686 * 7.25) / 100));
  });
});

describe("finance-report buildPnlFromData", () => {
  it("computes net revenue, expenses by category, and set-aside", () => {
    const orders = [
      order({ lsOrderId: "a", createdAt: "2026-08-01T00:00:00Z", totalUsdCents: 10050, taxUsdCents: 50 }),
      order({
        lsOrderId: "b",
        createdAt: "2026-08-05T00:00:00Z",
        totalUsdCents: 2000,
        refundedUsdCents: 2000,
        refundedAt: "2026-08-10T00:00:00Z",
        status: "refunded",
      }),
    ];
    const expenses = [
      { category: "software_hosting", amountCents: 2686 },
      { category: "commissions_fees", amountCents: 1000 },
    ];
    const pnl = buildPnlFromData(orders, expenses, "2026-08-01", "2026-08-31", DEFAULT_FINANCE_SETTINGS);
    expect(pnl.revenue.grossCents).toBe(12050);
    expect(pnl.revenue.taxRemittedByLsCents).toBe(50);
    expect(pnl.revenue.refundsCents).toBe(2000);
    // fees: order a base 10000 -> 550; order b base 2000 -> 150
    expect(pnl.revenue.estimatedLsFeesCents).toBe(700);
    expect(pnl.revenue.netCents).toBe(12050 - 50 - 2000 - 700);
    expect(pnl.totalExpensesCents).toBe(3686);
    expect(pnl.netProfitCents).toBe(pnl.revenue.netCents - 3686);
    expect(pnl.taxSetAside.totalCents).toBeGreaterThan(0);
    expect(pnl.expensesByCategory.map((c) => c.category)).toEqual([
      "commissions_fees",
      "software_hosting",
    ]);
  });
});
