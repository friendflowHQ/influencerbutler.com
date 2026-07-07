import { describe, expect, it } from "vitest";
import { calculate, competitionShare, formatCents } from "./model";

const base = {
  priceCents: 4000,
  commissionRatePct: 2.5,
  viewsPerMonth: 1000,
  conversionPct: 2,
  minutesPerVideo: 60,
  hourlyValueCents: 2500,
  influencerCompetition: 3,
};

describe("calculate", () => {
  it("computes commission per sale from price and rate", () => {
    expect(calculate(base).commissionPerSaleCents).toBe(100);
  });

  it("computes sales and views to break even", () => {
    const result = calculate(base);
    expect(result.timeInvestmentCents).toBe(2500);
    expect(result.salesToBreakEven).toBe(25);
    expect(result.viewsToBreakEven).toBe(1250);
  });

  it("adds the purchase price for the purchased break-even", () => {
    const result = calculate(base);
    // time 2500c + price 4000c = 6500c to earn back; /100c per sale = 65 sales.
    expect(result.totalToEarnBackPurchasedCents).toBe(6500);
    expect(result.salesToBreakEvenPurchased).toBe(65);
    expect(result.viewsToBreakEvenPurchased).toBe(3250); // 65 / 2%
  });

  it("estimates monthly profit dampened by competition", () => {
    const result = calculate(base);
    // 1000 views * 1/4 share * 2% conversion = 5 sales * $1 commission
    expect(result.estMonthlySalesShare).toBeCloseTo(5);
    expect(result.estMonthlyProfitCents).toBe(500);
  });

  it("returns Infinity break-even when commission is zero", () => {
    const result = calculate({ ...base, priceCents: 0 });
    expect(result.salesToBreakEven).toBe(Infinity);
    expect(result.viewsToBreakEven).toBe(Infinity);
  });

  it("clamps out-of-range percentages", () => {
    const result = calculate({ ...base, commissionRatePct: 250 });
    expect(result.commissionPerSaleCents).toBe(4000);
  });
});

describe("competitionShare", () => {
  it("gives full share with no competitors", () => {
    expect(competitionShare(0)).toBe(1);
  });

  it("splits share across competitors plus the new video", () => {
    expect(competitionShare(4)).toBe(0.2);
  });

  it("treats negative competition as zero", () => {
    expect(competitionShare(-3)).toBe(1);
  });
});

describe("formatCents", () => {
  it("formats dollars", () => {
    expect(formatCents(123456)).toBe("$1234.56");
  });

  it("handles Infinity", () => {
    expect(formatCents(Infinity)).toBe("n/a");
  });
});
