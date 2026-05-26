/**
 * Summary: Unit tests for the best-discount / first-touch-affiliate resolver.
 * Dependencies: vitest, ../promo-resolver, ../lemonsqueezy-discount-lookup, ../affiliate-lookup.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyStackingRules,
  computeSavedCents,
  pickWinner,
  resolveAttribution,
  resolveCheckoutDiscount,
  COMPARISON_HORIZON_MONTHS,
  type CandidateCode,
} from "../promo-resolver";
import type { LsDiscount } from "../lemonsqueezy-discount-lookup";

vi.mock("../lemonsqueezy-discount-lookup", async () => {
  const actual = await vi.importActual<typeof import("../lemonsqueezy-discount-lookup")>(
    "../lemonsqueezy-discount-lookup",
  );
  return {
    ...actual,
    fetchDiscountByCode: vi.fn(),
  };
});

vi.mock("../affiliate-lookup", async () => {
  const actual = await vi.importActual<typeof import("../affiliate-lookup")>(
    "../affiliate-lookup",
  );
  return {
    ...actual,
    lookupAffiliateByCode: vi.fn(),
  };
});

import { fetchDiscountByCode } from "../lemonsqueezy-discount-lookup";
import { lookupAffiliateByCode } from "../affiliate-lookup";

const fetchMock = fetchDiscountByCode as unknown as ReturnType<typeof vi.fn>;
const affMock = lookupAffiliateByCode as unknown as ReturnType<typeof vi.fn>;

function ls(partial: Partial<LsDiscount> & { code: string }): LsDiscount {
  return {
    id: partial.id ?? `id-${partial.code}`,
    code: partial.code,
    amount: partial.amount ?? 30,
    amountType: partial.amountType ?? "percent",
    duration: partial.duration ?? "once",
    durationInMonths: partial.durationInMonths ?? null,
  };
}

function candidate(overrides: Partial<CandidateCode> & { code: string }): CandidateCode {
  const lsRecord = overrides.ls ?? ls({ code: overrides.code });
  return {
    source: overrides.source ?? "typed",
    code: overrides.code,
    ls: lsRecord,
    isAffiliate: overrides.isAffiliate ?? false,
    lsAffiliateId: overrides.lsAffiliateId ?? null,
    savedCents: overrides.savedCents ?? computeSavedCents(lsRecord, MONTHLY_PLAN),
  };
}

const MONTHLY_PLAN = { priceCents: 2900, interval: "month" as const };
const ANNUAL_PLAN = { priceCents: 26100, interval: "year" as const };

describe("computeSavedCents", () => {
  it("percent + once + monthly = single-billing percent off", () => {
    const d = ls({ code: "WELCOME30", amount: 30, amountType: "percent", duration: "once" });
    // 2900 * 0.30 = 870 cents, one billing
    expect(computeSavedCents(d, MONTHLY_PLAN)).toBe(870);
  });

  it("percent + once + annual = percent of yearly", () => {
    const d = ls({ code: "ANNDEAL", amount: 25, amountType: "percent", duration: "once" });
    // 26100 * 0.25 = 6525 cents, one billing
    expect(computeSavedCents(d, ANNUAL_PLAN)).toBe(6525);
  });

  it("percent + repeating monthly + monthly plan multiplies by months", () => {
    const d = ls({
      code: "TWELVE",
      amount: 20,
      amountType: "percent",
      duration: "repeating",
      durationInMonths: 12,
    });
    // 2900 * 0.20 = 580 cents, 12 of them
    expect(computeSavedCents(d, MONTHLY_PLAN)).toBe(580 * 12);
  });

  it("repeating 6 months on annual plan rounds up to 1 billing", () => {
    const d = ls({
      code: "SIXMO",
      amount: 50,
      amountType: "percent",
      duration: "repeating",
      durationInMonths: 6,
    });
    // 26100 * 0.50 = 13050 cents, 1 billing (ceil(6/12) = 1)
    expect(computeSavedCents(d, ANNUAL_PLAN)).toBe(13050);
  });

  it("forever discount caps at 24-month horizon for monthly", () => {
    const d = ls({
      code: "FOREVER10",
      amount: 10,
      amountType: "percent",
      duration: "forever",
    });
    // 2900 * 0.10 = 290 cents, 24 billings
    expect(computeSavedCents(d, MONTHLY_PLAN)).toBe(290 * 24);
  });

  it("forever discount caps at 2 yearly billings for annual", () => {
    const d = ls({
      code: "FOREVER10",
      amount: 10,
      amountType: "percent",
      duration: "forever",
    });
    // 26100 * 0.10 = 2610 cents, 2 billings (24/12)
    expect(computeSavedCents(d, ANNUAL_PLAN)).toBe(2610 * 2);
  });

  it("fixed amount discount is applied per billing", () => {
    const d = ls({ code: "FIVE", amount: 500, amountType: "fixed", duration: "once" });
    expect(computeSavedCents(d, MONTHLY_PLAN)).toBe(500);
  });

  it("fixed amount discount clamps to plan price", () => {
    const d = ls({ code: "HUGE", amount: 999_999, amountType: "fixed", duration: "once" });
    // Clamped at 2900 (plan price)
    expect(computeSavedCents(d, MONTHLY_PLAN)).toBe(2900);
  });

  it("zero or negative amount yields zero savings", () => {
    expect(computeSavedCents(ls({ code: "ZERO", amount: 0 }), MONTHLY_PLAN)).toBe(0);
  });

  it("once 40% on annual beats forever 10% on annual", () => {
    const once40 = ls({ code: "ONCE40", amount: 40, amountType: "percent", duration: "once" });
    const forever10 = ls({
      code: "FOREVER10",
      amount: 10,
      amountType: "percent",
      duration: "forever",
    });
    // once: 26100 * 0.40 = 10440
    // forever: 26100 * 0.10 * 2 = 5220
    expect(computeSavedCents(once40, ANNUAL_PLAN)).toBeGreaterThan(
      computeSavedCents(forever10, ANNUAL_PLAN),
    );
  });

  it("custom horizon respected for forever discount", () => {
    const d = ls({ code: "FOREVER10", amount: 10, amountType: "percent", duration: "forever" });
    expect(computeSavedCents(d, MONTHLY_PLAN, 6)).toBe(290 * 6);
  });
});

describe("pickWinner", () => {
  it("returns null when no candidates", () => {
    expect(pickWinner([])).toBeNull();
  });

  it("picks the highest savedCents", () => {
    const winner = pickWinner([
      candidate({ code: "A", savedCents: 100 }),
      candidate({ code: "B", savedCents: 200 }),
      candidate({ code: "C", savedCents: 150 }),
    ]);
    expect(winner?.code).toBe("B");
  });

  it("tie-breaks by isAffiliate (affiliate wins)", () => {
    const winner = pickWinner([
      candidate({ code: "MARKETING", savedCents: 500, isAffiliate: false }),
      candidate({ code: "ALICE", savedCents: 500, isAffiliate: true, lsAffiliateId: "lsa_1" }),
    ]);
    expect(winner?.code).toBe("ALICE");
  });

  it("tie-breaks by source priority when savedCents+isAffiliate equal", () => {
    const winner = pickWinner([
      candidate({ code: "A", savedCents: 100, source: "welcome-cookie" }),
      candidate({ code: "B", savedCents: 100, source: "url-code" }),
      candidate({ code: "C", savedCents: 100, source: "typed" }),
    ]);
    expect(winner?.code).toBe("B"); // url-code priority
  });
});

describe("resolveAttribution (first-touch wins)", () => {
  it("returns null when no candidate is an affiliate", () => {
    expect(resolveAttribution([candidate({ code: "WELCOME30" })])).toBeNull();
  });

  it("returns the only affiliate candidate", () => {
    const attr = resolveAttribution([
      candidate({ code: "ALICE", source: "typed", isAffiliate: true, lsAffiliateId: "ls_alice" }),
    ]);
    expect(attr?.lsAffiliateId).toBe("ls_alice");
    expect(attr?.source).toBe("typed");
  });

  it("URL-sourced affiliate beats typed affiliate (first-touch)", () => {
    const attr = resolveAttribution([
      candidate({ code: "ALICE", source: "url-code", isAffiliate: true, lsAffiliateId: "ls_alice" }),
      candidate({ code: "BOB", source: "typed", isAffiliate: true, lsAffiliateId: "ls_bob" }),
    ]);
    expect(attr?.lsAffiliateId).toBe("ls_alice");
    expect(attr?.sourceCode).toBe("ALICE");
  });

  it("falls back to typed affiliate when no URL-sourced affiliate exists", () => {
    const attr = resolveAttribution([
      candidate({ code: "MARKETING", source: "url-code", isAffiliate: false }),
      candidate({ code: "BOB", source: "typed", isAffiliate: true, lsAffiliateId: "ls_bob" }),
    ]);
    expect(attr?.lsAffiliateId).toBe("ls_bob");
  });

  it("ignores affiliate candidates without an lsAffiliateId", () => {
    const attr = resolveAttribution([
      candidate({ code: "ORPHAN", source: "url-code", isAffiliate: true, lsAffiliateId: null }),
      candidate({ code: "BOB", source: "typed", isAffiliate: true, lsAffiliateId: "ls_bob" }),
    ]);
    // ORPHAN passed `isAffiliate=true` but no lsAffiliateId - skipped from candidates set
    expect(attr?.lsAffiliateId).toBe("ls_bob");
  });
});

describe("resolveCheckoutDiscount (integration)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    affMock.mockReset();
  });

  it("PRIMARY (XOR): URL affiliate suppresses WELCOME30 even though WELCOME would save more", async () => {
    // ALICE = 10% off once → 26100 * 0.10 = 2610 cents
    // WELCOME30 = 30% off once → 26100 * 0.30 = 7830 cents (would win on $; dropped by XOR)
    fetchMock.mockImplementation(async (code: string) => {
      if (code === "ALICE")
        return ls({ code: "ALICE", amount: 10, amountType: "percent", duration: "once" });
      return null;
    });
    affMock.mockImplementation(async (code: string) => {
      if (code.toUpperCase() === "ALICE")
        return { lsAffiliateId: "ls_alice", code: "ALICE" };
      return null;
    });

    const result = await resolveCheckoutDiscount({
      typedCode: null,
      urlCode: "ALICE",
      cookieTier: "first",
      plan: ANNUAL_PLAN,
      storeId: "store-1",
    });

    // XOR rule: with an affiliate candidate present, WELCOME30 is dropped before
    // pickWinner. ALICE wins both the discount and the attribution.
    expect(result.winner?.code).toBe("ALICE");
    expect(result.attribution?.lsAffiliateId).toBe("ls_alice");
    expect(result.attribution?.source).toBe("url-code");
    // And the welcome candidate must not survive into the candidates list.
    expect(result.candidates.find((c) => c.source === "welcome-cookie")).toBeUndefined();
  });

  it("bogus typed code is silently dropped", async () => {
    fetchMock.mockResolvedValue(null);
    affMock.mockResolvedValue(null);
    const result = await resolveCheckoutDiscount({
      typedCode: "ZZZZZ",
      urlCode: null,
      cookieTier: "first",
      plan: MONTHLY_PLAN,
      storeId: "store-1",
    });
    // WELCOME30 still resolves (synthesized) → wins by default
    expect(result.winner?.code).toBe("WELCOME30");
    expect(result.attribution).toBeNull();
  });

  it("dedupes when typed = URL = WELCOME code", async () => {
    fetchMock.mockResolvedValue(
      ls({ code: "WELCOME30", amount: 30, amountType: "percent", duration: "once" }),
    );
    affMock.mockResolvedValue(null);

    const result = await resolveCheckoutDiscount({
      typedCode: "welcome30",
      urlCode: "WELCOME30",
      cookieTier: "first",
      plan: MONTHLY_PLAN,
      storeId: "store-1",
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.source).toBe("url-code");
  });

  it("tiny affiliate discount still wins under XOR (welcome is suppressed)", async () => {
    fetchMock.mockImplementation(async (code: string) => {
      if (code === "ALICE")
        // Defensive case - a published 1-cent fixed discount on an affiliate code.
        return ls({ code: "ALICE", amount: 1, amountType: "fixed", duration: "once" });
      return null;
    });
    affMock.mockImplementation(async (code: string) => {
      if (code.toUpperCase() === "ALICE")
        return { lsAffiliateId: "ls_alice", code: "ALICE" };
      return null;
    });

    const result = await resolveCheckoutDiscount({
      typedCode: null,
      urlCode: "ALICE",
      cookieTier: "first",
      plan: MONTHLY_PLAN,
      storeId: "store-1",
    });

    // Under XOR, WELCOME30 is dropped → ALICE is the only candidate left.
    expect(result.winner?.code).toBe("ALICE");
    expect(result.attribution?.lsAffiliateId).toBe("ls_alice");
  });

  it("typed affiliate beats WELCOME when typed has bigger lifetime value", async () => {
    fetchMock.mockImplementation(async (code: string) => {
      if (code === "ALICE")
        return ls({
          code: "ALICE",
          amount: 20,
          amountType: "percent",
          duration: "repeating",
          durationInMonths: 12,
        });
      return null;
    });
    affMock.mockImplementation(async (code: string) => {
      if (code.toUpperCase() === "ALICE")
        return { lsAffiliateId: "ls_alice", code: "ALICE" };
      return null;
    });

    const result = await resolveCheckoutDiscount({
      typedCode: "ALICE",
      urlCode: null,
      cookieTier: "first",
      plan: MONTHLY_PLAN,
      storeId: "store-1",
    });
    // ALICE: 580 * 12 = 6960. WELCOME30: 870. ALICE wins.
    expect(result.winner?.code).toBe("ALICE");
    expect(result.attribution?.lsAffiliateId).toBe("ls_alice");
  });
});

describe("applyStackingRules (affiliate XOR welcome)", () => {
  it("keeps welcome candidate when no affiliate is present", () => {
    const cands = [
      candidate({ code: "WELCOME30", source: "welcome-cookie" }),
      candidate({ code: "TYPED10", source: "typed", isAffiliate: false }),
    ];
    expect(applyStackingRules(cands)).toEqual(cands);
  });

  it("drops welcome-cookie candidate when a URL affiliate is present", () => {
    const cands = [
      candidate({
        code: "ALICE",
        source: "url-code",
        isAffiliate: true,
        lsAffiliateId: "ls_alice",
      }),
      candidate({ code: "WELCOME30", source: "welcome-cookie" }),
    ];
    const out = applyStackingRules(cands);
    expect(out.map((c) => c.code)).toEqual(["ALICE"]);
  });

  it("drops welcome-cookie candidate when a typed affiliate is present", () => {
    const cands = [
      candidate({ code: "WELCOME30", source: "welcome-cookie" }),
      candidate({
        code: "BOB",
        source: "typed",
        isAffiliate: true,
        lsAffiliateId: "ls_bob",
      }),
    ];
    const out = applyStackingRules(cands);
    expect(out.map((c) => c.code)).toEqual(["BOB"]);
  });

  it("keeps everything when only welcome-cookie candidates exist", () => {
    const cands = [candidate({ code: "WELCOME15", source: "welcome-cookie" })];
    expect(applyStackingRules(cands)).toEqual(cands);
  });

  it("does NOT drop welcome based on a non-affiliate typed/url code", () => {
    // A marketing campaign code from a URL is not an affiliate. It shouldn't
    // trigger the XOR suppression.
    const cands = [
      candidate({ code: "MARKETING", source: "url-code", isAffiliate: false }),
      candidate({ code: "WELCOME30", source: "welcome-cookie" }),
    ];
    const out = applyStackingRules(cands);
    expect(out.map((c) => c.code).sort()).toEqual(["MARKETING", "WELCOME30"]);
  });
});

describe("COMPARISON_HORIZON_MONTHS sanity", () => {
  it("is a positive integer divisible by 12", () => {
    expect(COMPARISON_HORIZON_MONTHS).toBeGreaterThan(0);
    expect(COMPARISON_HORIZON_MONTHS % 12).toBe(0);
  });
});
