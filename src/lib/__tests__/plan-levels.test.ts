/**
 * Beginner / Power User plan levels: plan-string round trips (public "trio",
 * internal "duo"), seat tier + price resolution for level plans, the
 * price-change window, LS variant -> level with the pre-split variants reading
 * as legacy, and the entitlements payload.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  LEVEL_PRICE_CENTS,
  PRICE_CHANGE,
  PRICE_CENTS,
  levelPlanString,
  parseLevelPlan,
  levelForPlan,
  levelTiers,
  levelPriceCents,
  levelFuturePriceCents,
  priceChangeActive,
  planMetaFor,
  tierForPlan,
} from "../pricing-constants";
import { planForVariantId, planLevelForVariantId } from "../lemonsqueezy";
import { BEGINNER_BUTLER_SLUGS, FREE_BUTLER_SLUGS, entitlementsFor, levelUnlocks } from "../entitlements";

describe("level plan strings", () => {
  it("round-trips every level x tier x cadence, using the public word trio", () => {
    for (const level of ["beginner", "power"] as const) {
      for (const tier of ["solo", "duo", "team", "agency"] as const) {
        for (const interval of ["monthly", "annual"] as const) {
          const plan = levelPlanString(level, tier, interval);
          expect(plan).toBe(`${level}-${tier === "duo" ? "trio" : tier}-${interval}`);
          expect(parseLevelPlan(plan)).toEqual({ level, tier, interval });
          expect(tierForPlan(plan)).toBe(tier);
          expect(levelForPlan(plan)).toBe(level);
        }
      }
    }
  });

  it("every pre-split plan string and the add-on are legacy", () => {
    for (const plan of ["monthly", "annual", "solo-monthly", "duo-annual", "team-monthly", "agency-annual", "daily-deals-addon", "", null, undefined, "gold-solo-monthly"]) {
      expect(parseLevelPlan(plan)).toBeNull();
      expect(levelForPlan(plan)).toBe("legacy");
    }
    expect(tierForPlan("duo-annual")).toBe("duo");
  });

  it("prices: Beginner undercuts Power on every shared tier, annual is 10x monthly, Beginner Team is not sold", () => {
    expect(levelTiers("beginner")).toEqual(["solo", "duo", "agency"]);
    expect(levelTiers("power")).toEqual(["solo", "duo", "team", "agency"]);
    for (const tier of levelTiers("beginner")) {
      const b = LEVEL_PRICE_CENTS.beginner[tier]!;
      const p = LEVEL_PRICE_CENTS.power[tier]!;
      expect(b.monthly).toBeLessThan(p.monthly);
      // Beginner annual is "10 months" rounded to a clean sticker ($249, not $249.90).
      expect(b.annual).toBeLessThanOrEqual(b.monthly * 10);
      expect(b.annual).toBeGreaterThan(b.monthly * 9);
      expect(p.annual).toBe(p.monthly * 10);
    }
    // Power keeps today's list prices.
    for (const tier of ["solo", "duo", "team", "agency"] as const) {
      expect(LEVEL_PRICE_CENTS.power[tier]).toEqual(PRICE_CENTS[tier]);
    }
    expect(levelPriceCents("beginner", "solo", "monthly")).toBe(2499);
    expect(levelPriceCents("beginner", "team", "monthly")).toBeNull();
    expect(planMetaFor("beginner-solo-monthly")).toEqual({ priceCents: 2499, interval: "month" });
    expect(planMetaFor("power-trio-annual")).toEqual({ priceCents: 69000, interval: "year" });
    expect(planMetaFor("beginner-team-monthly")).toBeNull();
  });

  it("price change: active before November 28 2026 with the announced numbers, gone after", () => {
    const before = Date.parse("2026-11-01T00:00:00Z");
    const after = Date.parse("2026-11-28T00:00:01Z");
    expect(priceChangeActive(before)).toBe(true);
    expect(priceChangeActive(after)).toBe(false);
    expect(levelFuturePriceCents("beginner", "solo", "monthly", before)).toBe(2900);
    expect(levelFuturePriceCents("power", "solo", "monthly", before)).toBe(4900);
    expect(levelFuturePriceCents("power", "duo", "monthly", before)).toBe(8900);
    expect(levelFuturePriceCents("power", "team", "monthly", before)).toBeNull();
    expect(levelFuturePriceCents("beginner", "solo", "monthly", after)).toBeNull();
    expect(PRICE_CHANGE.effectiveAt).toBe("2026-11-28T00:00:00Z");
  });
});

describe("LS variant -> plan level", () => {
  const saved: Record<string, string | undefined> = {};
  const VARS = {
    LEMONSQUEEZY_VARIANT_MONTHLY: "1533734",
    LEMONSQUEEZY_VARIANT_BEGINNER_SOLO_MONTHLY: "2100001",
    LEMONSQUEEZY_VARIANT_POWER_TRIO_ANNUAL: "2100012",
  };
  afterEach(() => {
    for (const k of Object.keys(VARS)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("new variants resolve to their level; the pre-split variant and unknowns are legacy", () => {
    for (const [k, v] of Object.entries(VARS)) { saved[k] = process.env[k]; process.env[k] = v; }
    expect(planForVariantId("2100001")).toBe("beginner-solo-monthly");
    expect(planLevelForVariantId("2100001")).toBe("beginner");
    expect(planLevelForVariantId(2100012)).toBe("power");
    expect(planLevelForVariantId("1533734")).toBe("legacy");
    expect(planLevelForVariantId("999")).toBe("legacy");
    expect(planLevelForVariantId(null)).toBe("legacy");
  });
});

describe("entitlements", () => {
  it("beginner slugs include every free slug plus the starter engines", () => {
    for (const slug of FREE_BUTLER_SLUGS) expect(BEGINNER_BUTLER_SLUGS).toContain(slug);
    expect(BEGINNER_BUTLER_SLUGS).toContain("deals-butler");
    expect(BEGINNER_BUTLER_SLUGS).not.toContain("levanta-butler");
    expect(levelUnlocks("beginner", "deals-butler")).toBe(true);
    expect(levelUnlocks("beginner", "levanta-butler")).toBe(false);
    expect(levelUnlocks("power", "levanta-butler")).toBe(true);
    expect(levelUnlocks("legacy", "levanta-butler")).toBe(true);
    expect(levelUnlocks(undefined, "levanta-butler")).toBe(true);
  });

  it("entitlementsFor carries the level and the beginner list only for beginners", () => {
    const legacy = entitlementsFor("pro", "active");
    expect(legacy.planLevel).toBe("legacy");
    expect(legacy.beginnerButlerSlugs).toEqual([]);
    const beginner = entitlementsFor("pro", "active", "beginner");
    expect(beginner.planLevel).toBe("beginner");
    expect(beginner.beginnerButlerSlugs).toEqual(BEGINNER_BUTLER_SLUGS);
    expect(beginner.allButlersUnlocked).toBe(true);
    expect(entitlementsFor("free", null, "beginner").planLevel).toBe("beginner");
  });
});
