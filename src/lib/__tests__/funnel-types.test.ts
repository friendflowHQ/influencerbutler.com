import { afterEach, describe, expect, it } from "vitest";
import { normalizeTag } from "@/lib/email-audience";
import {
  ALL_MANAGED_TAGS,
  ALL_MODULE_KEYS,
  MANAGED_TAG_PREFIXES,
  MODULE_KEYS,
  ONBOARDING_VOCAB,
  PLAN_BASES,
  PLAN_TAGS,
  WT_MKT_INTL_TAG,
  WT_TAG_PREFIX,
  contentKey,
  contentKeyFallbacks,
  contentKeyTier,
  funnelsV2Enabled,
  funnelsV2StartMs,
  isBareKey,
  isManagedTag,
  parseContentKey,
  planBaseForLevel,
} from "@/lib/funnel-types";

// Mirrors src/app/api/admin/emails/sequences/route.ts: a tag ending in
// "-<letter>" is read as an A/B sibling group.
const VARIANT_TAG_RE = /^(.+)-[a-z]$/;

describe("content keys", () => {
  it("builds keys per the grammar", () => {
    expect(contentKey("day5")).toBe("day5");
    expect(contentKey("day5", { base: "beginner" })).toBe("day5.beginner");
    expect(contentKey("day5", { module: "walmart" })).toBe("day5.mod-walmart");
    expect(contentKey("day5", { module: "walmart", base: "power" })).toBe("day5.mod-walmart.power");
    expect(contentKey("comp_t1", { base: "starter" })).toBe("comp_t1.starter");
  });

  it("round-trips every base x module combination", () => {
    for (const tier of ["day0", "comp_t1", "1h", "u1"]) {
      expect(parseContentKey(contentKey(tier))).toEqual({ tier });
      for (const base of PLAN_BASES) {
        expect(parseContentKey(contentKey(tier, { base }))).toEqual({ tier, base });
        for (const mod of ALL_MODULE_KEYS) {
          expect(parseContentKey(contentKey(tier, { module: mod }))).toEqual({ tier, module: mod });
          const k = contentKey(tier, { module: mod, base });
          expect(parseContentKey(k)).toEqual({ tier, module: mod, base });
          expect(contentKeyTier(k)).toBe(tier);
        }
      }
    }
  });

  it("rejects junk", () => {
    const bad = [
      "",
      "Day5",
      "day5.",
      "day5.gold",
      "day5.mod-nope",
      "day5.power.mod-walmart",
      "day5.beginner.power",
      "a.b.c.d",
      "day5~b",
    ];
    for (const k of bad) expect(parseContentKey(k), k).toBeNull();
  });

  it("orders fallbacks most specific first, ending at the bare tier", () => {
    expect(contentKeyFallbacks("day5.mod-walmart.power")).toEqual([
      "day5.mod-walmart.power",
      "day5.mod-walmart",
      "day5.power",
      "day5",
    ]);
    expect(contentKeyFallbacks("day5.mod-walmart")).toEqual(["day5.mod-walmart", "day5"]);
    expect(contentKeyFallbacks("day5.beginner")).toEqual(["day5.beginner", "day5"]);
    expect(contentKeyFallbacks("day5")).toEqual(["day5"]);
    expect(contentKeyFallbacks("not a key")).toEqual(["not a key"]);
    expect(isBareKey("day5")).toBe(true);
    expect(isBareKey("day5.power")).toBe(false);
  });

  it("v1 modules are a subset of all modules", () => {
    for (const m of MODULE_KEYS) expect(ALL_MODULE_KEYS).toContain(m);
  });
});

describe("managed tag vocabulary", () => {
  it("every tag passes normalizeTag unchanged and is not an A/B variant tag", () => {
    expect(ALL_MANAGED_TAGS.length).toBeGreaterThan(30);
    for (const tag of ALL_MANAGED_TAGS) {
      expect(normalizeTag(tag), tag).toBe(tag);
      expect(VARIANT_TAG_RE.test(tag), tag).toBe(false);
      expect(tag.length).toBeLessThanOrEqual(40);
      expect(isManagedTag(tag)).toBe(true);
    }
  });

  it("covers every vocab value with the documented prefixes", () => {
    for (const f of Object.keys(WT_TAG_PREFIX) as (keyof typeof WT_TAG_PREFIX)[]) {
      for (const v of ONBOARDING_VOCAB[f]) expect(ALL_MANAGED_TAGS).toContain(`${WT_TAG_PREFIX[f]}${v}`);
    }
    for (const t of [
      WT_MKT_INTL_TAG,
      "wt-mode-onsite",
      "wt-plat-deals-influencer",
      "wt-goal-cc-auto-accept",
      "wt-exp-brand-new",
      "wt-path-associates-first",
      "wt-run-automation",
      "wt-deals-auto",
      "wt-done-complete",
    ]) {
      expect(ALL_MANAGED_TAGS).toContain(t);
    }
    expect(Object.values(PLAN_TAGS)).toEqual(["plan-beginner", "plan-power", "plan-legacy"]);
    expect(new Set(ALL_MANAGED_TAGS).size).toBe(ALL_MANAGED_TAGS.length);
    expect([...MANAGED_TAG_PREFIXES]).toEqual(["wt-", "plan-"]);
    expect(isManagedTag("cold-ig-amazon-a")).toBe(false);
  });

  it("marketplace codes are 2 letters (never tagged singly in v1)", () => {
    for (const m of ONBOARDING_VOCAB.marketplaces) expect(m).toMatch(/^[a-z]{2}$/);
  });
});

describe("plan base + flags", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("legacy reads as power", () => {
    expect(planBaseForLevel("legacy")).toBe("power");
    expect(planBaseForLevel("beginner")).toBe("beginner");
    expect(planBaseForLevel(null)).toBe("unknown");
  });

  it("reads FUNNELS_V2 and FUNNELS_V2_START from env", () => {
    delete process.env.FUNNELS_V2;
    expect(funnelsV2Enabled()).toBe(false);
    process.env.FUNNELS_V2 = "1";
    expect(funnelsV2Enabled()).toBe(true);
    delete process.env.FUNNELS_V2_START;
    expect(funnelsV2StartMs()).toBe(Date.parse("2026-11-09T00:00:00Z"));
    process.env.FUNNELS_V2_START = "2026-12-01T00:00:00Z";
    expect(funnelsV2StartMs()).toBe(Date.parse("2026-12-01T00:00:00Z"));
    process.env.FUNNELS_V2_START = "garbage";
    expect(funnelsV2StartMs()).toBe(Date.parse("2026-11-09T00:00:00Z"));
  });
});
