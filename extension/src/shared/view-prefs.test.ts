import { describe, expect, it } from "vitest";
import { defaultPrefs, isDefaultPrefs, priceForCurrency, sanitizePrefs } from "./view-prefs";

describe("view prefs", () => {
  it("falls back to defaults for junk", () => {
    expect(sanitizePrefs(null, "score")).toEqual(defaultPrefs("score"));
    expect(sanitizePrefs("x", "relevance")).toEqual(defaultPrefs("relevance"));
    const bad = sanitizePrefs({ sort: "nope", campaignOnly: "yes", minPriceCents: -5, badgesHidden: 1 }, "score");
    expect(bad).toEqual(defaultPrefs("score"));
  });

  it("keeps valid values and drops currency without a price", () => {
    const p = sanitizePrefs({ sort: "revenue", campaignOnly: true, minPriceCents: 2500, currency: "USD", badgesHidden: true }, "score");
    expect(p).toEqual({ sort: "revenue", campaignOnly: true, minPriceCents: 2500, currency: "USD", badgesHidden: true });
    expect(sanitizePrefs({ currency: "USD" }, "score").currency).toBeNull();
  });

  it("detects the default view per retailer", () => {
    expect(isDefaultPrefs(defaultPrefs("score"), "score")).toBe(true);
    expect(isDefaultPrefs(defaultPrefs("relevance"), "score")).toBe(false);
    expect(isDefaultPrefs({ ...defaultPrefs("score"), campaignOnly: true }, "score")).toBe(false);
  });

  it("ignores a saved price on a page in another currency", () => {
    const p = { ...defaultPrefs("score"), minPriceCents: 2000, currency: "USD" };
    expect(priceForCurrency(p, "USD")).toBe(2000);
    expect(priceForCurrency(p, "CAD")).toBeNull();
    expect(priceForCurrency(p, null)).toBe(2000);
  });
});
