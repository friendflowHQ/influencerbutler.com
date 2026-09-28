import { describe, expect, it, beforeEach } from "vitest";
import { setDealsFeed, getDealsFeed, dealsFeedSize, imageIdFromUrl } from "./deals-feed";

// The feed store is a module singleton, so each test resets it by overwriting
// every ASIN it touches; tests use disjoint ASINs to stay independent.

describe("imageIdFromUrl", () => {
  it("extracts the media id before the first size suffix", () => {
    expect(imageIdFromUrl("https://m.media-amazon.com/images/I/71abcXYZ._AC_UL320_.jpg")).toBe(
      "71abcXYZ",
    );
    expect(imageIdFromUrl("https://images-na.ssl-images-amazon.com/images/I/61qQ2r.__AC_.jpg")).toBe(
      "61qQ2r",
    );
  });

  it("returns null for non-media urls and empties", () => {
    expect(imageIdFromUrl(null)).toBeNull();
    expect(imageIdFromUrl(undefined)).toBeNull();
    expect(imageIdFromUrl("https://www.amazon.com/deals")).toBeNull();
  });
});

describe("setDealsFeed / getDealsFeed", () => {
  it("keeps only valid 10-char ASINs, upper-cased", () => {
    setDealsFeed([
      { asin: "b0aaaa1111", imageUrl: null, title: null, priceCents: null, currency: "USD" },
      { asin: "short", imageUrl: null, title: null, priceCents: null, currency: "USD" },
    ]);
    const feed = getDealsFeed();
    expect(feed.some((i) => i.asin === "B0AAAA1111")).toBe(true);
    expect(feed.some((i) => i.asin === "SHORT")).toBe(false);
  });

  it("tops up an ASIN-only record in place when a richer one arrives", () => {
    setDealsFeed([
      { asin: "B0BBBB2222", imageUrl: null, title: null, priceCents: null, currency: "USD" },
    ]);
    setDealsFeed([
      {
        asin: "B0BBBB2222",
        imageUrl: "https://m.media-amazon.com/images/I/71img._AC_.jpg",
        title: "A Widget",
        priceCents: 1999,
        currency: "USD",
      },
    ]);
    const item = getDealsFeed().find((i) => i.asin === "B0BBBB2222");
    expect(item?.imageUrl).toContain("71img");
    expect(item?.title).toBe("A Widget");
    expect(item?.priceCents).toBe(1999);
  });

  it("does not clobber existing fields with a later null-only record", () => {
    setDealsFeed([
      {
        asin: "B0CCCC3333",
        imageUrl: "https://m.media-amazon.com/images/I/71keep._AC_.jpg",
        title: "Keep Me",
        priceCents: 500,
        currency: "USD",
      },
    ]);
    setDealsFeed([
      { asin: "B0CCCC3333", imageUrl: null, title: null, priceCents: null, currency: "USD" },
    ]);
    const item = getDealsFeed().find((i) => i.asin === "B0CCCC3333");
    expect(item?.title).toBe("Keep Me");
    expect(item?.priceCents).toBe(500);
    expect(item?.imageUrl).toContain("71keep");
  });

  it("counts distinct ASINs", () => {
    const before = dealsFeedSize();
    setDealsFeed([
      { asin: "B0DDDD4444", imageUrl: null, title: null, priceCents: null, currency: "USD" },
      { asin: "B0DDDD4444", imageUrl: null, title: null, priceCents: null, currency: "USD" },
    ]);
    expect(dealsFeedSize()).toBe(before + 1);
  });
});
