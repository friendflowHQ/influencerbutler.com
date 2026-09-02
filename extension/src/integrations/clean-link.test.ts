import { describe, expect, it, vi } from "vitest";

// clean-link imports the retailer registry, whose rate-card cache touches
// chrome.storage at import time; stub it so the module resolves in a plain test
// environment (same shim as module.test.ts).
vi.stubGlobal("chrome", {
  storage: { local: { get: async () => ({}), set: async () => undefined } },
});

const { cleanLink, isShortenerUrl, shortenerOriginPattern } = await import("./clean-link");

describe("cleanLink: Amazon", () => {
  it("rebuilds a canonical /dp/ url, dropping a foreign tag and browse junk", () => {
    const r = cleanLink(
      "https://www.amazon.com/Some-Product/dp/B01JGG5CH4?tag=someoneelse-20&ref=sr_1_3&psc=1&th=1",
    );
    expect(r.matched).toBe(true);
    expect(r.retailer).toBe("amazon");
    expect(r.productId).toBe("B01JGG5CH4");
    expect(r.marketplace).toBe("amazon.com");
    expect(r.cleanUrl).toBe("https://www.amazon.com/dp/B01JGG5CH4");
  });

  it("handles a bare /dp/ url and a foreign locale host", () => {
    const r = cleanLink("https://www.amazon.co.uk/dp/B01JGG5CH4/?tag=rival-21");
    expect(r.matched).toBe(true);
    expect(r.marketplace).toBe("amazon.co.uk");
    expect(r.cleanUrl).toBe("https://www.amazon.co.uk/dp/B01JGG5CH4");
  });

  it("handles a /gp/product/ url", () => {
    const r = cleanLink("https://www.amazon.com/gp/product/B01JGG5CH4?tag=x-20&linkCode=ll1");
    expect(r.matched).toBe(true);
    expect(r.cleanUrl).toBe("https://www.amazon.com/dp/B01JGG5CH4");
  });
});

describe("cleanLink: Walmart", () => {
  it("rebuilds a canonical /ip/ url, dropping athbdg tracking", () => {
    const r = cleanLink(
      "https://www.walmart.com/ip/Great-Thing/10450114?athbdg=L1600&athcpid=abc&sourceid=xyz",
    );
    expect(r.matched).toBe(true);
    expect(r.retailer).toBe("walmart");
    expect(r.productId).toBe("10450114");
    expect(r.cleanUrl).toBe("https://www.walmart.com/ip/10450114");
  });
});

describe("cleanLink: fallback strip", () => {
  it("strips known trackers off a retailer non-product url without a canonical rebuild", () => {
    const r = cleanLink(
      "https://www.amazon.com/s?k=air+fryer&ref=nb_sb&tag=someoneelse-20&utm_source=ig",
    );
    expect(r.matched).toBe(false);
    expect(r.retailer).toBe("amazon");
    expect(r.cleanUrl).toContain("k=air+fryer");
    expect(r.cleanUrl).not.toContain("tag=");
    expect(r.cleanUrl).not.toContain("ref=");
    expect(r.cleanUrl).not.toContain("utm_source");
  });

  it("strips trackers off a stranger host and reports no retailer", () => {
    const r = cleanLink("https://example.com/thing?id=5&gclid=abc&fbclid=def&utm_medium=cpc");
    expect(r.matched).toBe(false);
    expect(r.retailer).toBe(null);
    expect(r.cleanUrl).toContain("id=5");
    expect(r.cleanUrl).not.toContain("gclid");
    expect(r.cleanUrl).not.toContain("fbclid");
    expect(r.cleanUrl).not.toContain("utm_medium");
  });

  it("hands back an unparseable string untouched", () => {
    const r = cleanLink("not a url");
    expect(r.matched).toBe(false);
    expect(r.cleanUrl).toBe("not a url");
  });
});

describe("shortener detection", () => {
  it("recognizes known shorteners and builds an origin pattern", () => {
    expect(isShortenerUrl("https://a.co/d/abc123")).toBe(true);
    expect(isShortenerUrl("https://amzn.to/xyz")).toBe(true);
    expect(isShortenerUrl("https://geni.us/abc")).toBe(true);
    expect(isShortenerUrl("https://goto.walmart.com/c/123")).toBe(true);
    expect(shortenerOriginPattern("https://a.co/d/abc123")).toBe("https://a.co/*");
  });

  it("does not treat a direct product url as a shortener", () => {
    expect(isShortenerUrl("https://www.amazon.com/dp/B01JGG5CH4")).toBe(false);
    expect(shortenerOriginPattern("https://www.amazon.com/dp/B01JGG5CH4")).toBe(null);
  });
});
