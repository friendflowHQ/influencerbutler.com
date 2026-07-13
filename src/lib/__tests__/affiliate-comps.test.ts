/**
 * Summary: Unit tests for the affiliate comp policy layer - duration clamping to
 *   the 2-month / 60-day ceiling, quota state math, month boundary, plus the
 *   addDaysUtc helper that day-granular comps rely on.
 * Dependencies: vitest, @/lib/affiliate-comps, @/lib/comp-codes.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeAffiliateCompDuration,
  compQuotaState,
  monthStartIso,
  AFFILIATE_COMP_MAX_DAYS,
  AFFILIATE_COMP_MAX_MONTHS,
} from "@/lib/affiliate-comps";
import { addDaysUtc } from "@/lib/comp-codes";

describe("normalizeAffiliateCompDuration", () => {
  it("accepts a month value at or under the ceiling", () => {
    expect(normalizeAffiliateCompDuration({ unit: "month", amount: 1 })).toEqual({
      ok: true,
      days: null,
      months: 1,
    });
    expect(normalizeAffiliateCompDuration({ unit: "month", amount: 2 })).toEqual({
      ok: true,
      days: null,
      months: 2,
    });
  });

  it("accepts a day value at or under the ceiling", () => {
    expect(normalizeAffiliateCompDuration({ unit: "day", amount: 14 })).toEqual({
      ok: true,
      days: 14,
      months: null,
    });
    expect(normalizeAffiliateCompDuration({ unit: "day", amount: AFFILIATE_COMP_MAX_DAYS })).toEqual(
      { ok: true, days: 60, months: null },
    );
  });

  it("rejects months over the 2-month ceiling", () => {
    const r = normalizeAffiliateCompDuration({ unit: "month", amount: 3 });
    expect(r.ok).toBe(false);
  });

  it("rejects days over the 60-day ceiling (e.g. 90 days)", () => {
    const r = normalizeAffiliateCompDuration({ unit: "day", amount: 90 });
    expect(r.ok).toBe(false);
  });

  it("rejects zero, negative, and non-integer amounts", () => {
    expect(normalizeAffiliateCompDuration({ unit: "day", amount: 0 }).ok).toBe(false);
    expect(normalizeAffiliateCompDuration({ unit: "month", amount: -1 }).ok).toBe(false);
    expect(normalizeAffiliateCompDuration({ unit: "day", amount: 1.5 }).ok).toBe(false);
  });

  it("coerces a numeric string amount", () => {
    expect(normalizeAffiliateCompDuration({ unit: "day", amount: "7" })).toEqual({
      ok: true,
      days: 7,
      months: null,
    });
  });

  it("rejects an unknown unit", () => {
    expect(normalizeAffiliateCompDuration({ unit: "week", amount: 2 }).ok).toBe(false);
    expect(normalizeAffiliateCompDuration({ unit: undefined, amount: 2 }).ok).toBe(false);
  });

  it("keeps the month ceiling at 2", () => {
    expect(AFFILIATE_COMP_MAX_MONTHS).toBe(2);
  });
});

describe("compQuotaState", () => {
  it("is disabled when the quota is null or zero", () => {
    expect(compQuotaState(null, 0).enabled).toBe(false);
    expect(compQuotaState(0, 0).enabled).toBe(false);
  });

  it("computes remaining from quota minus used", () => {
    expect(compQuotaState(5, 2)).toEqual({
      enabled: true,
      quota: 5,
      usedThisMonth: 2,
      remaining: 3,
    });
  });

  it("never returns negative remaining when over-used", () => {
    expect(compQuotaState(3, 5).remaining).toBe(0);
  });

  it("floors fractional quota and used", () => {
    const s = compQuotaState(5.9, 1.9);
    expect(s.quota).toBe(5);
    expect(s.usedThisMonth).toBe(1);
    expect(s.remaining).toBe(4);
  });
});

describe("monthStartIso", () => {
  it("returns the UTC first-of-month for the given instant", () => {
    expect(monthStartIso(new Date("2026-07-13T18:30:00.000Z"))).toBe("2026-07-01T00:00:00.000Z");
    expect(monthStartIso(new Date("2026-01-31T23:59:59.000Z"))).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("addDaysUtc", () => {
  it("adds whole days across a month boundary", () => {
    expect(addDaysUtc("2026-07-20T12:00:00.000Z", 14)).toBe("2026-08-03T12:00:00.000Z");
  });

  it("adds 60 days (the affiliate ceiling)", () => {
    expect(addDaysUtc("2026-01-01T00:00:00.000Z", 60)).toBe("2026-03-02T00:00:00.000Z");
  });

  it("preserves the time of day", () => {
    expect(addDaysUtc("2026-07-01T09:15:30.000Z", 1)).toBe("2026-07-02T09:15:30.000Z");
  });
});
