import { describe, expect, it } from "vitest";
import {
  daysUntil,
  parseBudgetText,
  parseCampaignText,
  parseDateRange,
  parsePctText,
  parseUsDate,
} from "./creator-campaigns";

// The DOM-walking pieces (extractCampaignAsins, parseCampaignCard,
// findCampaignCards, readCampaignGrid) require a browser document. This repo runs
// vitest in the `node` environment with no jsdom, so, per the existing
// convention (search-results.test.ts, creator-hub.test.ts test only pure
// functions), the tests below cover the pure text/date extraction that carries
// the real logic. The DOM heuristic is the explicitly UNVERIFIED seam and is
// validated by the live smoke test on a real campaign grid.

describe("parseUsDate", () => {
  it("parses M/D/YY into a 2000s date", () => {
    const d = parseUsDate("9/6/26");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(8); // September (0-based)
    expect(d?.getDate()).toBe(6);
  });

  it("parses M/D/YYYY", () => {
    expect(parseUsDate("12/31/2026")?.getFullYear()).toBe(2026);
  });

  it("rejects garbage and impossible dates", () => {
    expect(parseUsDate("not a date")).toBeNull();
    expect(parseUsDate("13/40/26")).toBeNull();
    expect(parseUsDate("2/31/26")).toBeNull(); // Feb 31 overflow
  });
});

describe("daysUntil", () => {
  it("counts whole calendar days, with today = 0", () => {
    const now = new Date(2026, 6, 10); // Jul 10 2026
    expect(daysUntil(new Date(2026, 6, 10), now)).toBe(0);
    expect(daysUntil(new Date(2026, 6, 17), now)).toBe(7);
    expect(daysUntil(new Date(2026, 6, 5), now)).toBe(-5); // already past
  });
});

describe("parseCampaignText", () => {
  it("pulls rate, budget, and date range from a card's rendered text", () => {
    const text =
      "AmeriGas\nSkip the Propane Run - Spare Tank\nCommission rate: 10%\nRemaining budget: $5,000.00\nDates: 7/6/26 - 9/6/26";
    const out = parseCampaignText(text);
    expect(out.commissionRatePct).toBe(10);
    expect(out.remainingBudgetCents).toBe(500_000);
    expect(out.startsAt?.getMonth()).toBe(6); // July
    expect(out.endsAt?.getMonth()).toBe(8); // September
  });

  it("reads a 15% rate and a comma-grouped budget without decimals", () => {
    const out = parseCampaignText("Commission rate: 15%\nRemaining budget: $10,000");
    expect(out.commissionRatePct).toBe(15);
    expect(out.remainingBudgetCents).toBe(1_000_000);
  });

  it("returns nulls when the fields are absent", () => {
    const out = parseCampaignText("Just some unrelated text");
    expect(out.commissionRatePct).toBeNull();
    expect(out.remainingBudgetCents).toBeNull();
    expect(out.endsAt).toBeNull();
  });
});

// The CC grid's per-field testids hold just the value (verified live 2026-07-10):
// commission "10%", budget "$1,000,000.00", date range "7/13/26 - 8/13/26".
describe("per-field testid parsers", () => {
  it("parsePctText reads a bare percentage", () => {
    expect(parsePctText("10%")).toBe(10);
    expect(parsePctText("15 %")).toBe(15);
    expect(parsePctText(null)).toBeNull();
    expect(parsePctText("n/a")).toBeNull();
  });

  it("parseBudgetText reads a bare currency amount into cents", () => {
    expect(parseBudgetText("$1,000,000.00")).toBe(100_000_000);
    expect(parseBudgetText("$5,000.00")).toBe(500_000);
    expect(parseBudgetText(null)).toBeNull();
  });

  it("parseDateRange reads a bare 'M/D/YY - M/D/YY' range (no label)", () => {
    const { startsAt, endsAt } = parseDateRange("7/13/26 - 8/13/26");
    expect(startsAt?.getMonth()).toBe(6); // July
    expect(endsAt?.getMonth()).toBe(7); // August
    expect(endsAt?.getFullYear()).toBe(2026);
  });

  it("parseDateRange returns nulls for non-ranges", () => {
    const { startsAt, endsAt } = parseDateRange("Ongoing");
    expect(startsAt).toBeNull();
    expect(endsAt).toBeNull();
  });
});
