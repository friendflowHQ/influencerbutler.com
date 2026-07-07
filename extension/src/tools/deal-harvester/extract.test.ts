import { describe, expect, it } from "vitest";
import { extractDeals } from "./extract";
import { findingKey } from "../../transport/types";
import type { DealFinding } from "../../transport/types";

describe("extractDeals", () => {
  it("pulls ASINs from absolute Amazon links and reads the marketplace host", () => {
    const html = `
      <a href="https://www.amazon.com/dp/B0AAAAAAAA">Blender</a>
      <a href="https://www.amazon.co.uk/gp/product/B0BBBBBBBB">Kettle</a>
    `;
    const deals = extractDeals(html, "https://savewithcindy.shop/");
    expect(deals).toEqual([
      { asin: "B0AAAAAAAA", marketplace: "amazon.com", sourceUrl: "https://savewithcindy.shop/", promoCode: null },
      { asin: "B0BBBBBBBB", marketplace: "amazon.co.uk", sourceUrl: "https://savewithcindy.shop/", promoCode: null },
    ]);
  });

  it("handles relative /dp links, asin= params, and data-asin attributes", () => {
    const html = `
      <a href="/dp/B0CCCCCCCC/ref=abc">Relative</a>
      <a href="/gp/product/B0DDDDDDDD?tag=x">GP</a>
      <a href="https://redirect.example/out?asin=B0EEEEEEEE">Wrapped</a>
      <div data-asin="B0FFFFFFFF"></div>
    `;
    const asins = extractDeals(html, "https://elvasdailydeals.com/").map((d) => d.asin);
    expect(asins).toEqual(["B0CCCCCCCC", "B0DDDDDDDD", "B0EEEEEEEE", "B0FFFFFFFF"]);
  });

  it("dedupes the same product across multiple links, keeping first order", () => {
    const html = `
      <a href="https://www.amazon.com/dp/B0AAAAAAAA">card</a>
      <img src="https://www.amazon.com/dp/B0AAAAAAAA/thumb" />
      <a href="/dp/B0GGGGGGGG">second</a>
      <a href="https://www.amazon.com/dp/B0AAAAAAAA">again</a>
    `;
    const asins = extractDeals(html, "https://noelsdailydeals.com/").map((d) => d.asin);
    expect(asins).toEqual(["B0AAAAAAAA", "B0GGGGGGGG"]);
  });

  it("pairs a promo code when the ASIN and code ride the same element", () => {
    const html = `<div data-asin="B0HHHHHHHH" data-coupon="SAVE20">deal</div>`;
    const deals = extractDeals(html, "https://promos4creators.com/");
    expect(deals).toHaveLength(1);
    expect(deals[0]?.asin).toBe("B0HHHHHHHH");
    expect(deals[0]?.promoCode).toBe("SAVE20");
  });

  it("extracts nothing from a page with no Amazon products", () => {
    const html = `<a href="https://example.com/thing">Not amazon</a><p>ABCDEFGHIJ</p>`;
    expect(extractDeals(html, "https://onlineatthelake.com/")).toEqual([]);
  });

  it("finds ASINs inside published Google Doc HTML", () => {
    // Google Docs wrap outbound links in a redirect; the asin= / dp form still
    // surfaces the product id in the href.
    const html = `<a href="https://www.google.com/url?q=https://www.amazon.com/dp/B0IIIIIIII&amp;sa=D">Deal 1</a>`;
    const asins = extractDeals(html, "https://docs.google.com/document/d/abc").map((d) => d.asin);
    expect(asins).toContain("B0IIIIIIII");
  });
});

describe("findingKey for deals", () => {
  it("keys on asin, marketplace, and day so a same-day re-harvest updates in place", () => {
    const base: DealFinding = {
      type: "deal",
      asin: "B0AAAAAAAA",
      marketplace: "amazon.com",
      sourceUrl: "https://savewithcindy.shop/",
      detectedAt: "2026-07-07T12:00:00.000Z",
    };
    const later: DealFinding = { ...base, detectedAt: "2026-07-07T18:30:00.000Z" };
    expect(findingKey(base)).toBe(findingKey(later));
    expect(findingKey(base)).toBe("deal:B0AAAAAAAA:amazon.com:2026-07-07");
  });
});
