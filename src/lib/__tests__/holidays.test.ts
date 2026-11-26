import { describe, it, expect } from "vitest";
import { holidayBusyRanges, holidaysForYear } from "../holidays";
import { computeDaySlots, type AvailabilityRule } from "../scheduling";

const RULES: AvailabilityRule[] = [1, 2, 3, 4, 5].map((wd) => ({
  weekday: wd, start_min: 600, end_min: 1020, timezone: "America/Denver", effective_from: null, effective_to: null,
}));

function slotsOn(dateISO: string) {
  const nowMs = Date.parse("2026-01-01T12:00:00Z");
  return computeDaySlots({
    dateISO,
    callType: "demo",
    rules: RULES,
    busy: holidayBusyRanges(nowMs, Date.parse("2028-02-01T00:00:00Z")),
    nowMs,
    leadHours: 0,
    decoyOpts: { minPerDay: 0, maxPerDay: 0 },
  });
}

describe("holidaysForYear", () => {
  it("computes the moving and fixed dates", () => {
    expect(holidaysForYear(2026).map((h) => h.date)).toEqual([
      "2026-01-01", "2026-05-25", "2026-07-04", "2026-09-07", "2026-11-26",
      "2026-11-27", "2026-12-24", "2026-12-25", "2026-12-31",
    ]);
    expect(holidaysForYear(2027).map((h) => h.date)).toEqual([
      "2027-01-01", "2027-05-31", "2027-07-04", "2027-09-06", "2027-11-25",
      "2027-11-26", "2027-12-24", "2027-12-25", "2027-12-31",
    ]);
  });
});

describe("holidayBusyRanges", () => {
  it("offers nothing on a holiday", () => {
    for (const d of ["2026-11-26", "2026-11-27", "2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01"]) {
      expect(slotsOn(d), d).toEqual([]);
    }
  });
  it("leaves the days around a holiday bookable", () => {
    for (const d of ["2026-11-25", "2026-11-30", "2026-12-23", "2026-12-28", "2027-01-04"]) {
      expect(slotsOn(d).length, d).toBeGreaterThan(0);
    }
  });
  it("covers the whole local day and nothing more", () => {
    const [r] = holidayBusyRanges(Date.parse("2026-11-26T18:00:00Z"), Date.parse("2026-11-26T19:00:00Z"));
    expect(new Date(r.startMs).toISOString()).toBe("2026-11-26T07:00:00.000Z");
    expect(new Date(r.endMs).toISOString()).toBe("2026-11-27T07:00:00.000Z");
  });
  it("is empty for an ordinary week or a reversed range", () => {
    expect(holidayBusyRanges(Date.parse("2026-10-05T00:00:00Z"), Date.parse("2026-10-12T00:00:00Z"))).toEqual([]);
    expect(holidayBusyRanges(2, 1)).toEqual([]);
  });
});
