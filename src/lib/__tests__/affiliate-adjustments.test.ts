/**
 * Summary: Unit tests for the affiliate make-whole math.
 * Dependencies: vitest, ../affiliate-adjustments.
 */

import { describe, it, expect } from "vitest";
import {
  computeMakeWhole,
  makeWholeWindowMonths,
  compMakeWholePayableMonths,
  sumAdjustmentsCents,
  MAKE_WHOLE_MAX_WINDOW_MONTHS,
} from "../affiliate-adjustments";

describe("computeMakeWhole", () => {
  it("annual: 30% of the $58.50 diff, 1 billing (Beth/Michelle case)", () => {
    const r = computeMakeWhole({
      ratePercent: 30,
      referredPriceCents: 33150, // $331.50
      newPriceCents: 27300, // $273.00
      interval: "year",
      windowMonths: 12,
    });
    expect(r.perBillingCents).toBe(1755); // $17.55
    expect(r.billings).toBe(1);
    expect(r.amountCents).toBe(1755);
  });

  it("monthly: diff per month times the 12-month window", () => {
    const r = computeMakeWhole({
      ratePercent: 30,
      referredPriceCents: 3900, // $39.00
      newPriceCents: 3000, // $30.00
      interval: "month",
      windowMonths: 12,
    });
    expect(r.perBillingCents).toBe(270); // 30% of $9.00
    expect(r.billings).toBe(12);
    expect(r.amountCents).toBe(3240); // $32.40
  });

  it("never claws back: a price increase yields 0", () => {
    const r = computeMakeWhole({
      ratePercent: 30,
      referredPriceCents: 27300,
      newPriceCents: 33150,
      interval: "year",
      windowMonths: 12,
    });
    expect(r.amountCents).toBe(0);
  });

  it("custom rate flows through (70% lifetime affiliate, annual)", () => {
    const r = computeMakeWhole({
      ratePercent: 70,
      referredPriceCents: 39000,
      newPriceCents: 29000,
      interval: "year",
      windowMonths: 12,
    });
    expect(r.perBillingCents).toBe(7000); // 70% of $100
    expect(r.amountCents).toBe(7000);
  });

  it("clamps the rate and window defensively", () => {
    const r = computeMakeWhole({
      ratePercent: 250,
      referredPriceCents: 1000,
      newPriceCents: 0,
      interval: "month",
      windowMonths: 0,
    });
    // rate clamped to 100, window floored to 1 billing.
    expect(r.perBillingCents).toBe(1000);
    expect(r.billings).toBe(1);
  });
});

describe("makeWholeWindowMonths", () => {
  it("lifetime (null) and over-cap collapse to the 12-month cap", () => {
    expect(makeWholeWindowMonths(null)).toBe(MAKE_WHOLE_MAX_WINDOW_MONTHS);
    expect(makeWholeWindowMonths(48)).toBe(12);
  });
  it("a shorter honored window is preserved", () => {
    expect(makeWholeWindowMonths(6)).toBe(6);
  });
});

describe("compMakeWholePayableMonths", () => {
  it("bounds to the remaining window (12-month window, 2 already paid -> 10)", () => {
    expect(
      compMakeWholePayableMonths({ compMonths: 12, windowMonths: 12, monthsAlreadyPaid: 2 }),
    ).toBe(10);
  });

  it("uses the comp length when it is the smaller bound", () => {
    expect(
      compMakeWholePayableMonths({ compMonths: 3, windowMonths: 12, monthsAlreadyPaid: 0 }),
    ).toBe(3);
  });

  it("returns 0 when the affiliate has already earned their whole window", () => {
    expect(
      compMakeWholePayableMonths({ compMonths: 12, windowMonths: 12, monthsAlreadyPaid: 12 }),
    ).toBe(0);
    // over-paid past the window never goes negative
    expect(
      compMakeWholePayableMonths({ compMonths: 12, windowMonths: 12, monthsAlreadyPaid: 15 }),
    ).toBe(0);
  });
});

describe("comp make-whole amount (computeMakeWhole with newPrice 0)", () => {
  it("full commission on the referred monthly price for each payable month", () => {
    // Kay: 30% affiliate, Jenna paid $23/mo, comped for a year after 2 paid months.
    const payableMonths = compMakeWholePayableMonths({
      compMonths: 12,
      windowMonths: makeWholeWindowMonths(null), // default/lifetime caps at 12
      monthsAlreadyPaid: 2,
    });
    expect(payableMonths).toBe(10);
    const r = computeMakeWhole({
      ratePercent: 30,
      referredPriceCents: 2300, // $23.00/mo
      newPriceCents: 0, // comp is fully free
      interval: "month",
      windowMonths: payableMonths,
    });
    expect(r.perBillingCents).toBe(690); // 30% of $23.00
    expect(r.billings).toBe(10);
    expect(r.amountCents).toBe(6900); // $69.00
  });
});

describe("sumAdjustmentsCents", () => {
  it("sums amounts and tolerates undefined", () => {
    expect(sumAdjustmentsCents(undefined)).toBe(0);
    expect(
      sumAdjustmentsCents([
        { id: "1", amountCents: 1755, note: null, source: "makewhole", period: null, createdAt: null },
        { id: "2", amountCents: 500, note: null, source: "manual", period: null, createdAt: null },
      ]),
    ).toBe(2255);
  });
});
