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
});
