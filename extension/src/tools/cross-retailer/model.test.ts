import { describe, expect, it } from "vitest";
import {
  cacheKey,
  cacheTtlMs,
  canLookUp,
  normalizeResult,
  otherRetailer,
  priceDelta,
  searchUrlFor,
  type CrossSource,
} from "./model";

const targetSrc: CrossSource = {
  retailer: "target",
  id: "79344798",
  upc: "016000275683",
  title: "Cheerios Heart Healthy Cereal 18 oz",
  brand: "General Mills",
  priceCents: 599,
};

describe("otherRetailer", () => {
  it("flips between the two", () => {
    expect(otherRetailer("target")).toBe("walmart");
    expect(otherRetailer("walmart")).toBe("target");
  });
});

describe("searchUrlFor", () => {
  it("searches the other retailer by barcode, falling back to title", () => {
    expect(searchUrlFor("target", { upc: "016000275683", title: "x" })).toBe(
      "https://www.target.com/s?searchTerm=016000275683",
    );
    expect(searchUrlFor("walmart", { upc: null, title: "Nail Lamp" })).toBe(
      "https://www.walmart.com/search?q=Nail%20Lamp",
    );
    expect(searchUrlFor("walmart", { upc: null, title: null })).toBeNull();
  });
});

describe("canLookUp", () => {
  it("needs a barcode or a real title", () => {
    expect(canLookUp(targetSrc)).toBe(true);
    expect(canLookUp({ ...targetSrc, upc: null, title: "ab" })).toBe(false);
    expect(canLookUp({ ...targetSrc, upc: null, title: "Cheerios cereal" })).toBe(true);
  });
});

describe("cache", () => {
  it("keys on the barcode so a repeat visit hits the cache", () => {
    expect(cacheKey(targetSrc)).toBe("target:016000275683");
    expect(cacheKey({ ...targetSrc, upc: null })).toBe("target:79344798");
  });
  it("holds hits longer than misses and never caches a failed check", () => {
    const found = normalizeResult(
      { status: "found", match: { id: "1", url: "https://www.walmart.com/ip/1" } },
      targetSrc,
    );
    expect(cacheTtlMs(found)).toBeGreaterThan(cacheTtlMs({ status: "none" }));
    expect(cacheTtlMs({ status: "none" })).toBeGreaterThan(0);
    expect(cacheTtlMs({ status: "unchecked", searchUrl: null })).toBe(0);
  });
});

describe("priceDelta", () => {
  it("reports whether the OTHER retailer is cheaper", () => {
    expect(priceDelta(599, 499)).toEqual({ cents: 100, direction: "cheaper" });
    expect(priceDelta(599, 699)).toEqual({ cents: 100, direction: "pricier" });
    expect(priceDelta(599, 599)).toEqual({ cents: 0, direction: "same" });
  });
  it("is null when either price is unknown", () => {
    expect(priceDelta(null, 499)).toBeNull();
    expect(priceDelta(599, null)).toBeNull();
  });
});

describe("normalizeResult", () => {
  it("accepts a Walmart match and defaults to an exact UPC match", () => {
    const r = normalizeResult(
      {
        status: "found",
        match: { id: "555", title: "Cheerios", priceCents: 499, inStock: true, url: "https://www.walmart.com/ip/555" },
      },
      targetSrc,
    );
    expect(r.status).toBe("found");
    if (r.status === "found") {
      expect(r.match.retailer).toBe("walmart");
      expect(r.match.matchType).toBe("upc");
      expect(r.match.priceCents).toBe(499);
    }
  });

  it("keeps the 'similar' label", () => {
    const r = normalizeResult(
      { status: "found", match: { id: "555", url: "https://www.walmart.com/ip/555", matchType: "similar" } },
      targetSrc,
    );
    expect(r.status === "found" && r.match.matchType).toBe("similar");
  });

  it("passes a genuine miss through as none", () => {
    expect(normalizeResult({ status: "none" }, targetSrc)).toEqual({ status: "none" });
  });

  it("turns a failed or garbled reply into unchecked with a search link, never none", () => {
    const expected = { status: "unchecked", searchUrl: "https://www.walmart.com/search?q=016000275683" };
    expect(normalizeResult(null, targetSrc)).toEqual(expected);
    expect(normalizeResult({ status: "unchecked" }, targetSrc)).toEqual(expected);
    expect(normalizeResult({ status: "found", match: {} }, targetSrc)).toEqual(expected);
  });

  it("refuses a link that is not the other retailer's product page", () => {
    const evil = normalizeResult(
      { status: "found", match: { id: "1", url: "https://evil.example/ip/1" } },
      targetSrc,
    );
    const wrongSide = normalizeResult(
      { status: "found", match: { id: "1", url: "https://www.target.com/p/-/A-1234567" } },
      targetSrc,
    );
    expect(evil.status).toBe("unchecked");
    expect(wrongSide.status).toBe("unchecked");
  });
});
