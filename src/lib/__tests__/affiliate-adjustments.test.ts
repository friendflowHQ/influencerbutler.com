/**
 * Summary: Unit tests for the affiliate make-whole math.
 * Dependencies: vitest, ../affiliate-adjustments.
 */

import { describe, it, expect } from "vitest";
import {
  computeMakeWhole,
  makeWholeWindowMonths,
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
