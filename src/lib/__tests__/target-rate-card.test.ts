import { describe, expect, it } from "vitest";
import { buildTargetRateCard, TARGET_MARKETPLACE } from "../target-rate-card";
import { parseRetailer, retailerIdRe, TARGET_TCIN_RE } from "../extension-api";

describe("buildTargetRateCard", () => {
  const card = buildTargetRateCard();

  it("is served in the shared rate-card shape for target.com", () => {
    expect(card.marketplace).toBe(TARGET_MARKETPLACE);
    expect(card.version).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(card.defaultRatePct).toBe(1);
    expect(card.snsBounty).toEqual([]);
    expect(card.rows.length).toBeGreaterThan(0);
  });

  it("keeps every rate at or below the 8% program ceiling, with unique labels", () => {
    for (const row of card.rows) {
      expect(row.ratePct).toBeGreaterThan(0);
      expect(row.ratePct).toBeLessThanOrEqual(8);
      expect(row.tokens.length).toBeGreaterThan(0);
    }
    const labels = card.rows.map((r) => r.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("retailer parsing for the market routes", () => {
  it("accepts target and still defaults to amazon", () => {
    expect(parseRetailer("target")).toBe("target");
    expect(parseRetailer("walmart")).toBe("walmart");
    expect(parseRetailer("bogus")).toBe("amazon");
    expect(parseRetailer(undefined)).toBe("amazon");
  });

  it("validates ids per retailer", () => {
    expect(TARGET_TCIN_RE.test("79344798")).toBe(true);
    expect(TARGET_TCIN_RE.test("123")).toBe(false);
    expect(retailerIdRe("target").test("79344798")).toBe(true);
    expect(retailerIdRe("target").test("12")).toBe(false);
    expect(retailerIdRe("walmart").test("123")).toBe(true);
  });
});
