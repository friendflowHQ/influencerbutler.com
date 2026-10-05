/**
 * Summary: Unit tests for the growth dashboard's pure logic - goal target
 * suggestion, monthly idea rotation, date/delta helpers, and the GA4 JWT
 * claim builder (claims only; signing needs a real key).
 * Dependencies: vitest, ../growth-goals, ../growth-ideas, ../growth-metrics, ../ga4.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { suggestTarget, DEFAULT_FLOOR } from "../growth-goals";
import {
  pickMonthlyIdeas,
  GROWTH_IDEA_LIBRARY,
  IDEAS_PER_MONTH,
} from "../growth-ideas";
import {
  deltaPercent,
  monthKey,
  currentMonthKey,
  prevMonthKey,
  monthBounds,
  bucketRows,
  bucketLevelRows,
  projectedTrialConversionCents,
  billsWithinWindow,
} from "../growth-metrics";
import { PRICE_CENTS } from "../pricing-constants";
import { buildJwtParts } from "../ga4";

describe("suggestTarget", () => {
  it("proposes ~10% over last month's actual", () => {
    expect(suggestTarget("trials_started", 20)).toBe(22);
    expect(suggestTarget("revenue_cents", 100000)).toBe(110000);
  });

  it("always moves at least +1 above small baselines", () => {
    // ceil(3 * 1.1) = 4, which is also 3 + 1
    expect(suggestTarget("trials_started", 3)).toBe(4);
    // ceil(1 * 1.1) = 2
    expect(suggestTarget("new_subscriptions", 1)).toBe(2);
  });

  it("falls back to the metric floor at zero baseline", () => {
    expect(suggestTarget("trial_clicks", 0)).toBe(DEFAULT_FLOOR.trial_clicks);
    expect(suggestTarget("email_subscribers", null)).toBe(DEFAULT_FLOOR.email_subscribers);
    expect(suggestTarget("download_leads", 0)).toBe(DEFAULT_FLOOR.download_leads);
  });

  it("skips floorless metrics with no history", () => {
    expect(suggestTarget("revenue_cents", 0)).toBeNull();
    expect(suggestTarget("active_subscriptions", null)).toBeNull();
  });
});

describe("pickMonthlyIdeas", () => {
  it("is deterministic for the same month", () => {
    const a = pickMonthlyIdeas("2026-07");
    const b = pickMonthlyIdeas("2026-07");
    expect(a.map((i) => i.key)).toEqual(b.map((i) => i.key));
    expect(a).toHaveLength(IDEAS_PER_MONTH);
  });

  it("takes at most 2 ideas per category", () => {
    for (const month of ["2026-01", "2026-07", "2027-03"]) {
      const counts = new Map<string, number>();
      for (const idea of pickMonthlyIdeas(month)) {
        counts.set(idea.category, (counts.get(idea.category) ?? 0) + 1);
      }
      for (const [, n] of counts) expect(n).toBeLessThanOrEqual(2);
    }
  });

  it("rotates across months and covers the whole library over a year", () => {
    expect(pickMonthlyIdeas("2026-07").map((i) => i.key)).not.toEqual(
      pickMonthlyIdeas("2026-08").map((i) => i.key),
    );
    const seen = new Set<string>();
    for (let m = 1; m <= 12; m++) {
      for (const idea of pickMonthlyIdeas(`2026-${String(m).padStart(2, "0")}`)) {
        seen.add(idea.key);
      }
    }
    expect(seen.size).toBe(GROWTH_IDEA_LIBRARY.length);
  });

  it("returns nothing for garbage months", () => {
    expect(pickMonthlyIdeas("garbage")).toEqual([]);
  });

  it("has unique keys in the library", () => {
    const keys = GROWTH_IDEA_LIBRARY.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("date + delta helpers", () => {
  it("monthKey uses UTC", () => {
    expect(monthKey(new Date(Date.UTC(2026, 6, 1)))).toBe("2026-07");
    expect(monthKey(new Date(Date.UTC(2026, 11, 31, 23, 59)))).toBe("2026-12");
  });

  it("prevMonthKey wraps the year", () => {
    expect(prevMonthKey("2026-07")).toBe("2026-06");
    expect(prevMonthKey("2026-01")).toBe("2025-12");
  });

  it("monthBounds spans the UTC month and counts days when given UTC", () => {
    const b = monthBounds("2026-02", "UTC");
    expect(b?.startIso).toBe("2026-02-01T00:00:00.000Z");
    expect(b?.nextIso).toBe("2026-03-01T00:00:00.000Z");
    expect(b?.days).toBe(28);
    expect(monthBounds("2024-02", "UTC")?.days).toBe(29);
    expect(monthBounds("nope")).toBeNull();
    expect(monthBounds("2026-13")).toBeNull();
  });

  it("monthBounds defaults to the business timezone (America/Denver), not UTC", () => {
    // Denver is MST (UTC-7) in February, so local midnight Feb 1 is 07:00 UTC -
    // the window must start there, not at UTC midnight, or the last ~7 hours
    // of Jan 31 local time would be miscounted as February.
    const b = monthBounds("2026-02");
    expect(b?.startIso).toBe("2026-02-01T07:00:00.000Z");
    expect(b?.nextIso).toBe("2026-03-01T07:00:00.000Z");
    expect(b?.days).toBe(28);
  });

  it("currentMonthKey uses the business timezone, not UTC", () => {
    // 2026-09-30T23:38 local (MDT, UTC-6) is 2026-10-01T05:38Z - still
    // September locally even though UTC has already rolled into October.
    const sept30Evening = new Date("2026-10-01T05:38:00.000Z");
    expect(currentMonthKey(sept30Evening)).toBe("2026-09");
    expect(currentMonthKey(sept30Evening, "UTC")).toBe("2026-10");
  });

  it("deltaPercent handles zero and unknown baselines", () => {
    expect(deltaPercent(110, 100)).toBeCloseTo(0.1);
    expect(deltaPercent(50, 100)).toBeCloseTo(-0.5);
    expect(deltaPercent(0, 0)).toBe(0);
    expect(deltaPercent(5, 0)).toBeNull();
    expect(deltaPercent(null, 100)).toBeNull();
    expect(deltaPercent(100, null)).toBeNull();
  });
});

describe("projectedTrialConversionCents", () => {
  // planForVariantId resolves an LS variant id via these env vars, so stub a
  // few so a known variant maps to a real price and everything else falls back.
  const SAVED: Record<string, string | undefined> = {};
  const STUBS = {
    LEMONSQUEEZY_VARIANT_MONTHLY: "v-solo-monthly",
    LEMONSQUEEZY_VARIANT_ANNUAL: "v-solo-annual",
    LEMONSQUEEZY_VARIANT_DUO_MONTHLY: "v-duo-monthly",
  };

  beforeAll(() => {
    for (const [k, v] of Object.entries(STUBS)) {
      SAVED[k] = process.env[k];
      process.env[k] = v;
    }
  });

  afterAll(() => {
    for (const k of Object.keys(STUBS)) {
      if (SAVED[k] === undefined) delete process.env[k];
      else process.env[k] = SAVED[k];
    }
  });

  it("is zero for no trials", () => {
    expect(projectedTrialConversionCents([], PRICE_CENTS.solo.monthly)).toBe(0);
  });

  it("values each trial at its plan's first payment", () => {
    expect(
      projectedTrialConversionCents(
        ["v-solo-monthly", "v-solo-annual", "v-duo-monthly"],
        PRICE_CENTS.solo.monthly,
      ),
    ).toBe(PRICE_CENTS.solo.monthly + PRICE_CENTS.solo.annual + PRICE_CENTS.duo.monthly);
  });

  it("falls back for unmapped or missing variants", () => {
    expect(
      projectedTrialConversionCents(["nope", null, undefined], PRICE_CENTS.solo.monthly),
    ).toBe(PRICE_CENTS.solo.monthly * 3);
    // A known variant plus one unmapped: real price + one fallback.
    expect(
      projectedTrialConversionCents(["v-duo-monthly", "nope"], PRICE_CENTS.solo.monthly),
    ).toBe(PRICE_CENTS.duo.monthly + PRICE_CENTS.solo.monthly);
  });
});

describe("billsWithinWindow", () => {
  // September 2026, UTC.
  const start = Date.parse("2026-09-01T00:00:00.000Z");
  const next = Date.parse("2026-10-01T00:00:00.000Z");

  it("keeps a charge date inside the month", () => {
    expect(billsWithinWindow("2026-09-15T12:00:00Z", start, next)).toBe(true);
    expect(billsWithinWindow("2026-09-01T00:00:00Z", start, next)).toBe(true);
  });

  it("excludes next-month and prior-month charge dates", () => {
    // Common near month-end: a trial that started mid-Sept renews in Oct.
    expect(billsWithinWindow("2026-10-01T00:00:00Z", start, next)).toBe(false);
    expect(billsWithinWindow("2026-10-08T09:30:00Z", start, next)).toBe(false);
    expect(billsWithinWindow("2026-08-31T23:59:59Z", start, next)).toBe(false);
  });

  it("handles offset timezones by absolute instant, not string order", () => {
    // 2026-09-30T23:00:00-02:00 == 2026-10-01T01:00Z, which is next month.
    expect(billsWithinWindow("2026-09-30T23:00:00-02:00", start, next)).toBe(false);
    // 2026-10-01T01:00:00+03:00 == 2026-09-30T22:00Z, still September.
    expect(billsWithinWindow("2026-10-01T01:00:00+03:00", start, next)).toBe(true);
  });

  it("treats a missing or unparseable date as not billing this month", () => {
    expect(billsWithinWindow(null, start, next)).toBe(false);
    expect(billsWithinWindow(undefined, start, next)).toBe(false);
    expect(billsWithinWindow("", start, next)).toBe(false);
    expect(billsWithinWindow("not-a-date", start, next)).toBe(false);
    expect(billsWithinWindow(12345, start, next)).toBe(false);
  });
});

describe("buildJwtParts", () => {
  it("builds RS256 service-account claims for the analytics scope", () => {
    const now = 1_750_000_000;
    const { header, claims } = buildJwtParts("bot@project.iam.gserviceaccount.com", now);
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(claims.iss).toBe("bot@project.iam.gserviceaccount.com");
    expect(claims.scope).toBe("https://www.googleapis.com/auth/analytics.readonly");
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
    expect(claims.iat).toBe(now);
    expect(claims.exp).toBe(now + 3600);
  });
});

describe("bucketRows", () => {
  it("buckets by UTC date when given UTC (legacy behavior, for contrast)", () => {
    // 11:38pm Sept 30 Denver time = 05:38am Oct 1 UTC.
    const rows = [{ created_at: "2026-10-01T05:38:00.000Z" }];
    const utc = bucketRows(rows, "created_at", "2026-09", "2026-10", 31, () => 1, "UTC");
    expect(utc.current).toBe(1);
    expect(utc.previous).toBe(0);
  });

  it("buckets a late-evening local event into the local day/month it actually happened in", () => {
    // Same instant as above, but bucketed in the business's local timezone:
    // it's still September 30th in Denver, so it must land in September, not
    // get swallowed into an empty October.
    const rows = [{ created_at: "2026-10-01T05:38:00.000Z" }];
    const denver = bucketRows(rows, "created_at", "2026-09", "2026-10", 31, () => 1, "America/Denver");
    expect(denver.current).toBe(0);
    expect(denver.previous).toBe(1);
  });

  it("defaults to the business timezone (America/Denver)", () => {
    const rows = [{ created_at: "2026-10-01T05:38:00.000Z" }];
    const snap = bucketRows(rows, "created_at", "2026-09", "2026-10", 31, () => 1);
    expect(snap.current).toBe(0);
    expect(snap.previous).toBe(1);
  });

  it("sums same-month rows and indexes the sparkline by local day", () => {
    const rows = [
      { created_at: "2026-09-05T18:00:00.000Z", total: 100 }, // local Sept 5
      { created_at: "2026-09-16T01:30:00.000Z", total: 50 }, // local Sept 15 (7:30pm MDT)
    ];
    const snap = bucketRows(
      rows,
      "created_at",
      "2026-08",
      "2026-09",
      30,
      (r) => Number(r.total),
      "America/Denver",
    );
    expect(snap.current).toBe(150);
    expect(snap.series?.[4]).toBe(100); // day 5
    expect(snap.series?.[14]).toBe(50); // day 15
  });
});

describe("bucketLevelRows", () => {
  const rows = [
    { captured_on: "2026-08-31", member_count: 340 },
    { captured_on: "2026-09-01", member_count: 345 },
    { captured_on: "2026-09-03", member_count: 350 },
  ];

  it("reads current as the latest count in the month and previous as last month's end", () => {
    const snap = bucketLevelRows(rows, "captured_on", "member_count", "2026-08", "2026-09", 30);
    expect(snap.current).toBe(350);
    expect(snap.previous).toBe(340);
  });

  it("carries the last known level forward across gap days", () => {
    const snap = bucketLevelRows(rows, "captured_on", "member_count", "2026-08", "2026-09", 30);
    expect(snap.series?.[0]).toBe(345); // day 1
    expect(snap.series?.[1]).toBe(345); // day 2, carried from day 1
    expect(snap.series?.[2]).toBe(350); // day 3
    expect(snap.series?.[29]).toBe(350); // month end, carried
  });

  it("seeds the line from last month's end before the first snapshot of the month", () => {
    const late = [
      { captured_on: "2026-08-31", member_count: 340 },
      { captured_on: "2026-09-05", member_count: 360 },
    ];
    const snap = bucketLevelRows(late, "captured_on", "member_count", "2026-08", "2026-09", 30);
    expect(snap.series?.[0]).toBe(340); // day 1 shows last month's ending level
    expect(snap.series?.[4]).toBe(360); // day 5, first snapshot of the month
  });

  it("is null when no rows fall in the window", () => {
    const snap = bucketLevelRows(
      [{ captured_on: "2026-07-15", member_count: 300 }],
      "captured_on",
      "member_count",
      "2026-08",
      "2026-09",
      30,
    );
    expect(snap.current).toBeNull();
    expect(snap.previous).toBeNull();
    expect(snap.series).toBeNull();
  });
});
