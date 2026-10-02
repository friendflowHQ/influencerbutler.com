/**
 * Summary: Unit tests for the valuation snapshot's pure math - the
 * most-recent-Monday boundary and the multiple-range constants. The
 * DB-reading computeValuationSnapshot is not covered here.
 * Dependencies: vitest, ../valuation.
 */

import { describe, it, expect } from "vitest";
import { mostRecentMonday, MULTIPLE_LOW, MULTIPLE_BASE, MULTIPLE_HIGH } from "../valuation";
import { localDateStr, DEFAULT_TIMEZONE } from "../timezone";

describe("mostRecentMonday", () => {
  it("returns the same day when asked on a Monday", () => {
    // 2026-09-28 is a Monday.
    const monday = mostRecentMonday(new Date("2026-09-28T18:00:00.000Z"));
    expect(localDateStr(monday, DEFAULT_TIMEZONE)).toBe("2026-09-28");
  });

  it("steps back to the prior Monday mid-week", () => {
    // 2026-10-01 is a Thursday.
    const monday = mostRecentMonday(new Date("2026-10-01T18:00:00.000Z"));
    expect(localDateStr(monday, DEFAULT_TIMEZONE)).toBe("2026-09-28");
  });

  it("steps back to the prior Monday on a Sunday", () => {
    // 2026-10-04 is a Sunday.
    const monday = mostRecentMonday(new Date("2026-10-04T18:00:00.000Z"));
    expect(localDateStr(monday, DEFAULT_TIMEZONE)).toBe("2026-09-28");
  });

  it("returns local midnight for the Monday", () => {
    const monday = mostRecentMonday(new Date("2026-10-01T23:00:00.000Z"));
    expect(localDateStr(monday, DEFAULT_TIMEZONE)).toBe("2026-09-28");
    // America/Denver midnight on 2026-09-28 is 06:00 UTC (MDT, UTC-6).
    expect(monday.toISOString()).toBe("2026-09-28T06:00:00.000Z");
  });
});

describe("valuation multiples", () => {
  it("are ordered conservative < base < optimistic", () => {
    expect(MULTIPLE_LOW).toBeLessThan(MULTIPLE_BASE);
    expect(MULTIPLE_BASE).toBeLessThan(MULTIPLE_HIGH);
  });
});
