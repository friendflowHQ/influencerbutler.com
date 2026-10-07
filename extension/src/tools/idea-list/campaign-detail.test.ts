import { describe, expect, it } from "vitest";
import { budgetLevel, campaignEnd, formatEndDay, perSaleCents } from "./campaign-detail";

const NOW = new Date(2026, 9, 7, 9, 0, 0); // Oct 7 2026, local

describe("campaignEnd", () => {
  it("reads a date-only stamp (midnight UTC) as that calendar day", () => {
    const end = campaignEnd("2026-10-31T00:00:00.000Z", NOW);
    expect(end?.day.getMonth()).toBe(9);
    expect(end?.day.getDate()).toBe(31);
    expect(end?.daysLeft).toBe(24);
  });

  it("reads a US end-of-day stamp (early hours UTC next day) as the day before", () => {
    // 2026-10-31 23:59:00 Pacific
    const end = campaignEnd("2026-11-01T06:59:00.000Z", NOW);
    expect(end?.day.getMonth()).toBe(9);
    expect(end?.day.getDate()).toBe(31);
  });

  it("reads a 23:59:59Z stamp as the same day", () => {
    const end = campaignEnd("2026-10-31T23:59:59.000Z", NOW);
    expect(end?.day.getDate()).toBe(31);
  });

  it("reports 0 days on the last day and negative once over", () => {
    expect(campaignEnd("2026-10-07T00:00:00.000Z", NOW)?.daysLeft).toBe(0);
    expect(campaignEnd("2026-10-05T00:00:00.000Z", NOW)?.daysLeft).toBe(-2);
  });

  it("returns null for a missing or unparseable stamp", () => {
    expect(campaignEnd(null, NOW)).toBeNull();
    expect(campaignEnd("", NOW)).toBeNull();
    expect(campaignEnd("not a date", NOW)).toBeNull();
  });
});

describe("formatEndDay", () => {
  it("omits the year within the current year and adds it otherwise", () => {
    expect(formatEndDay(new Date(2026, 9, 31), NOW)).not.toMatch(/2026/);
    expect(formatEndDay(new Date(2027, 0, 5), NOW)).toMatch(/2027/);
  });
});

describe("perSaleCents", () => {
  it("applies the percent to the price and rounds to cents", () => {
    expect(perSaleCents(4599, 12)).toBe(552);
    expect(perSaleCents(1498, 10)).toBe(150);
  });

  it("is null without a price", () => {
    expect(perSaleCents(null, 12)).toBeNull();
  });
});

describe("budgetLevel", () => {
  it("normalizes Amazon's labels and rejects anything else", () => {
    expect(budgetLevel(" High ")).toBe("high");
    expect(budgetLevel("medium")).toBe("medium");
    expect(budgetLevel("Low")).toBe("low");
    expect(budgetLevel("huge")).toBeNull();
    expect(budgetLevel(null)).toBeNull();
  });
});
