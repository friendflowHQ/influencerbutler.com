/**
 * Summary: Unit tests for the growth dashboard's pure logic - goal target
 * suggestion, monthly idea rotation, date/delta helpers, and the GA4 JWT
 * claim builder (claims only; signing needs a real key).
 * Dependencies: vitest, ../growth-goals, ../growth-ideas, ../growth-metrics, ../ga4.
 */

import { describe, it, expect } from "vitest";
import { suggestTarget, DEFAULT_FLOOR } from "../growth-goals";
import {
  pickMonthlyIdeas,
  GROWTH_IDEA_LIBRARY,
  IDEAS_PER_MONTH,
} from "../growth-ideas";
import { deltaPercent, monthKey, prevMonthKey, monthBounds } from "../growth-metrics";
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

  it("monthBounds spans the month and counts days", () => {
    const b = monthBounds("2026-02");
    expect(b?.startIso).toBe("2026-02-01T00:00:00.000Z");
    expect(b?.nextIso).toBe("2026-03-01T00:00:00.000Z");
    expect(b?.days).toBe(28);
    expect(monthBounds("2024-02")?.days).toBe(29);
    expect(monthBounds("nope")).toBeNull();
    expect(monthBounds("2026-13")).toBeNull();
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
