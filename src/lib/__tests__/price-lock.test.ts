// Price lock (deadline Nov 30 2026, 11:59pm Pacific): new checkouts switch to
// the new-price variants at the deadline, everyone already on a variant keeps
// its family, and stale old-price checkouts expire.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  planForVariantId,
  planLevelForVariantId,
  planMetaForVariantId,
  postDeadlineVariantFor,
  resolveCheckoutVariant,
  variantFamilyOf,
  variantIdForPlanInFamily,
  getDiscountableVariantIds,
} from "../lemonsqueezy";
import { keepsPreDeadlinePrice } from "../price-lock";

const BEFORE = Date.parse("2026-11-20T12:00:00Z");
const LAST_SECOND = Date.parse("2026-12-01T07:59:59Z");
const AFTER = Date.parse("2026-12-01T08:00:00Z");

const ENV: Record<string, string> = {
  LEMONSQUEEZY_VARIANT_MONTHLY: "1533734",
  LEMONSQUEEZY_VARIANT_ANNUAL: "1533746",
  LEMONSQUEEZY_VARIANT_DUO_MONTHLY: "2029189",
  LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON: "9000001",
  LEMONSQUEEZY_VARIANT_BEGINNER_SOLO_MONTHLY: "2243998",
  LEMONSQUEEZY_VARIANT_POWER_SOLO_MONTHLY: "2244107",
  LEMONSQUEEZY_VARIANT_POWER_SOLO_ANNUAL: "2244052",
  LEMONSQUEEZY_VARIANT_POWER_TRIO_MONTHLY: "2244111",
  LEMONSQUEEZY_NEXT_VARIANT_BEGINNER_SOLO_MONTHLY: "3000001",
  LEMONSQUEEZY_NEXT_VARIANT_POWER_SOLO_MONTHLY: "3000007",
  LEMONSQUEEZY_NEXT_VARIANT_POWER_SOLO_ANNUAL: "3000008",
  LEMONSQUEEZY_NEXT_VARIANT_POWER_TRIO_MONTHLY: "3000009",
};
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("resolveCheckoutVariant", () => {
  it("sells today's variant before the deadline, expiring 2 hours after it", () => {
    const r = resolveCheckoutVariant("beginner-solo-monthly", undefined, { now: BEFORE });
    expect(r).toMatchObject({ ok: true, variantId: "2243998", family: "current" });
    expect(r.ok && r.expiresAt).toBe("2026-12-01T10:00:00.000Z");
    expect(resolveCheckoutVariant("beginner-solo-monthly", undefined, { now: LAST_SECOND })).toMatchObject({
      variantId: "2243998",
    });
  });

  it("sells the new-price variant from the deadline on, with no expiry", () => {
    const r = resolveCheckoutVariant("beginner-solo-monthly", undefined, { now: AFTER });
    expect(r).toMatchObject({ ok: true, variantId: "3000001", family: "next", expiresAt: null });
  });

  it("routes new legacy checkouts to Power User after the deadline, not before", () => {
    expect(resolveCheckoutVariant("monthly", undefined, { now: BEFORE })).toMatchObject({ variantId: "1533734" });
    expect(resolveCheckoutVariant("monthly", undefined, { now: AFTER })).toMatchObject({
      variantId: "3000007",
      plan: "power-solo-monthly",
    });
    expect(resolveCheckoutVariant("annual", undefined, { now: AFTER })).toMatchObject({ variantId: "3000008" });
    expect(resolveCheckoutVariant("duo-monthly", undefined, { now: AFTER })).toMatchObject({ variantId: "3000009" });
  });

  it("maps a raw variant id to its new twin after the deadline and rejects unknown ids", () => {
    expect(resolveCheckoutVariant(undefined, "2243998", { now: BEFORE })).toMatchObject({ variantId: "2243998" });
    expect(resolveCheckoutVariant(undefined, "2243998", { now: AFTER })).toMatchObject({ variantId: "3000001" });
    expect(resolveCheckoutVariant(undefined, "424242", { now: BEFORE })).toEqual({ ok: false, reason: "unknown-variant" });
  });

  it("keeps the old price when the family is forced (trial started before the deadline)", () => {
    expect(resolveCheckoutVariant("beginner-solo-monthly", undefined, { now: AFTER, family: "current" })).toMatchObject({
      variantId: "2243998",
      family: "current",
      expiresAt: null,
    });
  });

  it("falls back to today's variant if a new id is missing, so checkout never breaks", () => {
    delete process.env.LEMONSQUEEZY_NEXT_VARIANT_POWER_SOLO_ANNUAL;
    expect(resolveCheckoutVariant("power-solo-annual", undefined, { now: AFTER })).toMatchObject({
      ok: true,
      variantId: "2244052",
      family: "current",
    });
  });

  it("never touches the add-on", () => {
    expect(resolveCheckoutVariant("daily-deals-addon", undefined, { now: AFTER })).toMatchObject({
      variantId: "9000001",
      expiresAt: null,
    });
  });
});

describe("both families map to the same plan", () => {
  it("reverse lookups, level and list price follow the variant actually held", () => {
    expect(planForVariantId("3000001")).toBe("beginner-solo-monthly");
    expect(planLevelForVariantId("3000001")).toBe("beginner");
    expect(variantFamilyOf("3000001")).toBe("next");
    expect(variantFamilyOf("2243998")).toBe("current");
    expect(variantFamilyOf("1533734")).toBe("current");
    expect(variantFamilyOf("424242")).toBeNull();
    expect(planMetaForVariantId("2243998")).toEqual({ priceCents: 2499, interval: "month" });
    expect(planMetaForVariantId("3000001")).toEqual({ priceCents: 2999, interval: "month" });
  });

  it("plan switches stay in the subscriber's own family", () => {
    expect(variantIdForPlanInFamily("power-trio-monthly", "current")).toBe("2244111");
    expect(variantIdForPlanInFamily("power-trio-monthly", "next")).toBe("3000009");
  });

  it("discount codes cover level variants in both families", () => {
    const ids = getDiscountableVariantIds();
    expect(ids).toEqual(expect.arrayContaining(["2243998", "3000001", "1533734"]));
    expect(ids).not.toContain("9000001");
  });
});

describe("comps and trials", () => {
  it("a comp adding a card keeps its variant before the deadline and gets the new price after", () => {
    expect(postDeadlineVariantFor("2243998", BEFORE)).toBe("2243998");
    expect(postDeadlineVariantFor("2243998", AFTER)).toBe("3000001");
    expect(postDeadlineVariantFor("1533734", AFTER)).toBe("3000007"); // legacy -> Power User
    expect(postDeadlineVariantFor("3000001", AFTER)).toBe("3000001");
  });

  it("a no-card trial that began before the deadline keeps the old price while it runs", () => {
    const day = 24 * 60 * 60 * 1000;
    const trial = (endMs: number) => ({ kind: "trial", expiresAt: new Date(endMs).toISOString(), cancelledAt: null });
    expect(keepsPreDeadlinePrice([trial(AFTER + 5 * day)], AFTER + day)).toBe(true); // started Nov 22
    expect(keepsPreDeadlinePrice([trial(AFTER + 15 * day)], AFTER + day)).toBe(false); // started Dec 2
    expect(keepsPreDeadlinePrice([trial(AFTER - day)], AFTER + day)).toBe(false); // already ended
    expect(keepsPreDeadlinePrice([{ ...trial(AFTER + 5 * day), kind: "admin" }], AFTER + day)).toBe(false);
    expect(keepsPreDeadlinePrice([trial(AFTER + 5 * day)], BEFORE)).toBe(false); // nothing to keep yet
  });
});
