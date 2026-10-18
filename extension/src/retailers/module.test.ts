import { describe, expect, it, vi } from "vitest";

// chrome.storage is touched by the rate-card cache the module imports; stub it
// so the module resolves in a plain test environment.
vi.stubGlobal("chrome", {
  storage: { local: { get: async () => ({}), set: async () => undefined } },
});

const { retailerModule } = await import("./module");

describe("retailerModule", () => {
  it("exposes an Amazon module that builds /dp/ urls and validates ASINs", () => {
    const m = retailerModule("amazon");
    expect(m.retailer).toBe("amazon");
    expect(m.marketplaceFor("https://www.amazon.co.uk/dp/B01JGG5CH4")).toBe("amazon.co.uk");
    expect(m.canonicalProductUrl("B01JGG5CH4", "amazon.com")).toBe(
      "https://www.amazon.com/dp/B01JGG5CH4",
    );
    expect(m.productIdValid("B01JGG5CH4")).toBe(true);
    expect(m.productIdValid("10450114")).toBe(false);
    expect(m.defaultRatePct({ commissionRatePct: 3.5 } as never)).toBe(3.5);
  });

  it("exposes a Walmart module that builds /ip/ urls and validates item ids", () => {
    const m = retailerModule("walmart");
    expect(m.retailer).toBe("walmart");
    expect(m.marketplaceFor("https://www.walmart.com/ip/10450114")).toBe("walmart.com");
    expect(m.canonicalProductUrl("10450114", "walmart.com")).toBe(
      "https://www.walmart.com/ip/10450114",
    );
    expect(m.productIdValid("10450114")).toBe(true);
    expect(m.productIdValid("B01JGG5CH4")).toBe(false);
    expect(m.defaultRatePct({ commissionRatePct: 3.5 } as never)).toBe(1);
  });

  it("exposes a Target module that builds /p/ urls, validates TCINs and has real capabilities", () => {
    const m = retailerModule("target");
    expect(m.retailer).toBe("target");
    expect(m.marketplaceFor("https://www.target.com/p/x/-/A-79344798")).toBe("target.com");
    expect(m.canonicalProductUrl("79344798", "target.com")).toBe(
      "https://www.target.com/p/-/A-79344798",
    );
    expect(m.extractProductId("https://www.target.com/p/cereal/-/A-79344798?x=1")).toBe("79344798");
    expect(m.productIdValid("79344798")).toBe(true);
    expect(m.productIdValid("B01JGG5CH4")).toBe(false);
    expect(m.defaultRatePct({ commissionRatePct: 3.5 } as never)).toBe(1);
    // Amazon-only data sources stay off; the grid hooks are on (deal push waits
    // for the desktop receiver).
    expect(m.capabilities.ccRates).toBe(false);
    expect(m.capabilities.rerenderWatcher).toBe(true);
    expect(m.capabilities.sendDeals).toBe(false);
    expect(m.capabilities.autoSortByScore).toBe(false);
  });
});
