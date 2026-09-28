import { describe, expect, it } from "vitest";
import {
  dealFromAmazonUrl,
  extractDeals,
  extractShortLinks,
  matchAmazonProductUrl,
  siteLinkMatcher,
} from "./extract";
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

  it("keeps the same ASIN on two different marketplaces (both absolute links)", () => {
    // A creator with US and UK tags can promote both; the deal must not collapse
    // to whichever marketplace happened to appear first on the page.
    const html = `
      <a href="https://www.amazon.com/dp/B0AAAAAAAA">US</a>
      <a href="https://www.amazon.co.uk/dp/B0AAAAAAAA">UK</a>
    `;
    const deals = extractDeals(html, "https://savewithcindy.shop/");
    expect(deals).toEqual([
      { asin: "B0AAAAAAAA", marketplace: "amazon.com", sourceUrl: "https://savewithcindy.shop/", promoCode: null },
      { asin: "B0AAAAAAAA", marketplace: "amazon.co.uk", sourceUrl: "https://savewithcindy.shop/", promoCode: null },
    ]);
  });

  it("does not invent a .com row from the relative tail of an absolute non-US link", () => {
    // The relative regex also matches the /dp/<asin> inside the absolute URL; a
    // naive marketplace-keyed dedup would wrongly add a second amazon.com row.
    const html = `<a href="https://www.amazon.co.uk/dp/B0BBBBBBBB/ref=x">UK only</a>`;
    const deals = extractDeals(html, "https://x.shop/");
    expect(deals).toEqual([
      { asin: "B0BBBBBBBB", marketplace: "amazon.co.uk", sourceUrl: "https://x.shop/", promoCode: null },
    ]);
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

describe("extractShortLinks", () => {
  it("finds amzn.to and a.co links, deduped, order preserved", () => {
    const html = `
      <a href="https://amzn.to/3AbCdEf">Deal 1</a>
      <a href="https://a.co/d/8xYz12Ab">Deal 2</a>
      <a href="https://amzn.to/3AbCdEf">Deal 1 again</a>
      <a href="http://amzn.to/4GhIjKl">Deal 3 (http)</a>
    `;
    expect(extractShortLinks(html)).toEqual([
      "https://amzn.to/3AbCdEf",
      "https://a.co/d/8xYz12Ab",
      "https://amzn.to/4GhIjKl",
    ]);
  });

  it("finds regional short hosts (amzn.eu, amzn.asia)", () => {
    const html = `
      <a href="https://amzn.eu/d/aBcD1234">EU</a>
      <a href="https://amzn.asia/d/eFgH5678">Asia</a>
    `;
    expect(extractShortLinks(html)).toEqual([
      "https://amzn.eu/d/aBcD1234",
      "https://amzn.asia/d/eFgH5678",
    ]);
  });

  it("returns nothing when the page has no short links", () => {
    const html = `<a href="https://www.amazon.com/dp/B0AAAAAAAA">direct</a>`;
    expect(extractShortLinks(html)).toEqual([]);
  });
});

describe("dealFromAmazonUrl", () => {
  it("maps a resolved product URL to a deal attributed to the aggregator page", () => {
    const deal = dealFromAmazonUrl(
      "https://www.amazon.com/BISSELL-Little-Green/dp/B0016HF5GK?ref_=short_url",
      "https://savewithcindy.shop/",
    );
    expect(deal).toEqual({
      asin: "B0016HF5GK",
      marketplace: "amazon.com",
      sourceUrl: "https://savewithcindy.shop/",
      promoCode: null,
    });
  });

  it("reads the marketplace off a non-US final URL", () => {
    const deal = dealFromAmazonUrl("https://www.amazon.co.uk/dp/B0BBBBBBBB", "https://x.shop/");
    expect(deal?.marketplace).toBe("amazon.co.uk");
  });

  it("returns null for a non-product landing (expired link, bot wall)", () => {
    expect(dealFromAmazonUrl("https://www.amazon.com/errors/404", "https://x.shop/")).toBeNull();
    expect(dealFromAmazonUrl("", "https://x.shop/")).toBeNull();
  });

  it("is stateful-regex safe: two calls in a row both match", () => {
    // The underlying pattern is a /g/ regex; a stale lastIndex must not make
    // every second resolution silently miss.
    const url = "https://www.amazon.com/dp/B0016HF5GK";
    expect(dealFromAmazonUrl(url, "https://x.shop/")?.asin).toBe("B0016HF5GK");
    expect(dealFromAmazonUrl(url, "https://x.shop/")?.asin).toBe("B0016HF5GK");
  });
});

describe("matchAmazonProductUrl", () => {
  it("returns asin + marketplace for an absolute product link", () => {
    expect(matchAmazonProductUrl("https://www.amazon.com/dp/B0AAAAAAAA?th=1&psc=1")).toEqual({
      asin: "B0AAAAAAAA",
      marketplace: "amazon.com",
    });
  });

  it("returns null for a non-product URL", () => {
    expect(matchAmazonProductUrl("https://www.amazon.com/errors/404")).toBeNull();
  });

  it("is stateful-regex safe across repeated calls (per-anchor scan on a page)", () => {
    const url = "https://www.amazon.com/dp/B0AAAAAAAA";
    expect(matchAmazonProductUrl(url)).toEqual({ asin: "B0AAAAAAAA", marketplace: "amazon.com" });
    expect(matchAmazonProductUrl(url)).toEqual({ asin: "B0AAAAAAAA", marketplace: "amazon.com" });
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

describe("SITE_PARSERS: koupon.ai", () => {
  // Shape taken from the live Next.js payload: productLink then code, with the
  // ampersand unicode-escaped and koupon's own Associates tag on the link.
  const payload =
    '{"items":[' +
    '{"productLink":"https://www.amazon.com/gp/product/B0H8DJ7VDV?psc=1\u0026tag=koupondesk-20","code":"Q4RT8WZ2"},' +
    '{"productLink":"https://www.amazon.com/dp/B0GSD9JVB2?psc=1\u0026tag=koupondesk-20","code":"9KMP3XQD"}' +
    "]}";

  it("pairs each product with its promo code", () => {
    const deals = extractDeals(payload, "https://www.koupon.ai/collection/amazon-promo-codes");
    const byAsin = new Map(deals.map((d) => [d.asin, d]));
    expect(byAsin.get("B0H8DJ7VDV")?.promoCode).toBe("Q4RT8WZ2");
    expect(byAsin.get("B0GSD9JVB2")?.promoCode).toBe("9KMP3XQD");
  });

  it("never carries the aggregator's own affiliate tag into the deal", () => {
    const deals = extractDeals(payload, "https://www.koupon.ai/collection/amazon-promo-codes");
    expect(deals.length).toBeGreaterThan(0);
    for (const deal of deals) {
      expect(JSON.stringify(deal)).not.toMatch(/koupondesk/);
    }
  });

  it("leaves a page with no pairs to the generic sweep", () => {
    const html = '<a href="https://www.amazon.com/dp/B0AAAAAAAA">x</a>';
    const deals = extractDeals(html, "https://www.koupon.ai/collection/amazon-promo-codes");
    expect(deals).toEqual([
      { asin: "B0AAAAAAAA", marketplace: "amazon.com", sourceUrl: "https://www.koupon.ai/collection/amazon-promo-codes", promoCode: null },
    ]);
  });
});

describe("SITE_PARSERS: onlineatthelake.com", () => {
  // The site never links to a retailer: every card routes through its own
  // click-tracked redirect, which names the retailer and the id outright.
  const html =
    '<a href="/d/amazon_asin_B0CYV4H86N?src=All+Finds">a</a>' +
    '<a href="/d/walmart_sku_17566810931?src=All+Finds">b</a>' +
    '<a href="/d/amazon_asin_B0CYV4H86N?src=Deal+Detail">dupe</a>';
  const source = "https://onlineatthelake.com/all-finds";

  it("reads both retailers out of the redirect, with no link on the page at all", () => {
    const deals = extractDeals(html, source);
    expect(deals).toEqual([
      { asin: "B0CYV4H86N", marketplace: "amazon.com", sourceUrl: source, promoCode: null },
      { asin: "17566810931", marketplace: "walmart.com", sourceUrl: source, promoCode: null },
    ]);
  });

  it("rejects a malformed id rather than inventing a product", () => {
    const deals = extractDeals('<a href="/d/amazon_asin_NOPE12">x</a>', source);
    expect(deals).toEqual([]);
  });
});

describe("siteLinkMatcher", () => {
  it("lets the on-page chip recognise a site's own redirect link", () => {
    const match = siteLinkMatcher("https://onlineatthelake.com/all-finds");
    expect(match).toBeTruthy();
    expect(match?.("/d/amazon_asin_B0CYV4H86N?src=All+Finds")).toEqual({
      asin: "B0CYV4H86N",
      marketplace: "amazon.com",
    });
    expect(match?.("/d/walmart_sku_17566810931")).toEqual({
      asin: "17566810931",
      marketplace: "walmart.com",
    });
    expect(match?.("/about")).toBeNull();
  });

  it("is null for a host with no override, so the generic Amazon matcher stands alone", () => {
    expect(siteLinkMatcher("https://www.savewithcindy.shop/")).toBeNull();
  });
});
