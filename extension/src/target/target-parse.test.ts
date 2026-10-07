import { describe, expect, it } from "vitest";
import {
  cleanBarcode,
  decodeEntities,
  extractTcin,
  parsePdpResponse,
  parseSearchResponse,
} from "./redsky";
import { mergeTargetProducts, parseJsonLdProduct, readApiKeyFromText } from "./product-signals";

// Fixtures follow the long-standing public shape of pdp_client_v1 / plp_search_v2.
// They are NOT captured from a live page (Target's bot wall blocked the automated
// browser on 2026-10-07), so they pin the parser's behavior, not Target's payload.

const pdp = {
  data: {
    product: {
      tcin: "79344798",
      item: {
        product_description: { title: "Cheerios Heart Healthy &amp; Whole Grain Cereal - 18oz" },
        primary_brand: { name: "General Mills" },
        primary_barcode: "016000275683",
        enrichment: { images: { primary_image_url: "https://target.scene7.com/is/image/Target/GUEST_1" } },
      },
      price: { current_retail: 5.99 },
      ratings_and_reviews: { statistics: { rating: { average: 4.8, count: 1234 } } },
    },
  },
};

describe("extractTcin", () => {
  it("reads the tcin from a product url", () => {
    expect(extractTcin("https://www.target.com/p/cheerios/-/A-79344798")).toBe("79344798");
    expect(extractTcin("https://www.target.com/p/-/A-79344798?preselect=1#x")).toBe("79344798");
    expect(extractTcin("https://www.target.com/s?searchTerm=x")).toBeNull();
  });
});

describe("cleanBarcode / decodeEntities", () => {
  it("keeps real barcodes and drops junk", () => {
    expect(cleanBarcode("016000275683")).toBe("016000275683");
    expect(cleanBarcode("12")).toBeNull();
    expect(cleanBarcode(undefined)).toBeNull();
  });
  it("decodes the entities Target puts in titles", () => {
    expect(decodeEntities("Tom &amp; Jerry &#34;Mix&#34;")).toBe('Tom & Jerry "Mix"');
  });
});

describe("parsePdpResponse", () => {
  it("maps the product record", () => {
    const p = parsePdpResponse(pdp);
    expect(p).toMatchObject({
      tcin: "79344798",
      title: "Cheerios Heart Healthy & Whole Grain Cereal - 18oz",
      brand: "General Mills",
      upc: "016000275683",
      priceCents: 599,
      averageRating: 4.8,
      numReviews: 1234,
    });
  });
  it("returns null when the product is missing or the shape moved", () => {
    expect(parsePdpResponse({ data: {} })).toBeNull();
    expect(parsePdpResponse(null)).toBeNull();
    expect(parsePdpResponse("nope")).toBeNull();
  });
  it("degrades to nulls instead of throwing when fields move", () => {
    const p = parsePdpResponse({ data: { product: { tcin: "1234567" } } });
    expect(p?.upc).toBeNull();
    expect(p?.priceCents).toBeNull();
  });
});

describe("parseSearchResponse", () => {
  it("keeps products that carry a tcin", () => {
    const out = parseSearchResponse({
      data: {
        search: {
          products: [
            { tcin: "111111111", item: { product_description: { title: "A" } }, price: { current_retail: 1 } },
            { item: { product_description: { title: "no tcin" } } },
          ],
        },
      },
    });
    expect(out.map((p) => p.tcin)).toEqual(["111111111"]);
  });
  it("is empty for an unexpected body", () => {
    expect(parseSearchResponse({})).toEqual([]);
  });
});

describe("parseJsonLdProduct", () => {
  const ld = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList" },
      {
        "@type": "Product",
        name: "Nail Lamp",
        sku: "87654321",
        gtin13: "0016000275683",
        brand: { "@type": "Brand", name: "Acme" },
        offers: { "@type": "Offer", price: "12.99", availability: "https://schema.org/InStock" },
        aggregateRating: { ratingValue: "4.5", reviewCount: "90" },
      },
    ],
  });

  it("finds the Product inside a @graph", () => {
    const p = parseJsonLdProduct(["not json", ld]);
    expect(p).toMatchObject({
      tcin: "87654321",
      title: "Nail Lamp",
      brand: "Acme",
      priceCents: 1299,
      inStock: true,
      averageRating: 4.5,
      numReviews: 90,
    });
    expect(p?.upc).toBe("0016000275683");
  });
  it("marks an out-of-stock offer", () => {
    const out = JSON.stringify({ "@type": "Product", name: "X", offers: { price: 1, availability: "OutOfStock" } });
    expect(parseJsonLdProduct([out])?.inStock).toBe(false);
  });
  it("is null with no Product node", () => {
    expect(parseJsonLdProduct([JSON.stringify({ "@type": "WebSite" })])).toBeNull();
  });
});

describe("mergeTargetProducts / readApiKeyFromText", () => {
  it("prefers the first non-null value per field", () => {
    const a = parseJsonLdProduct([JSON.stringify({ "@type": "Product", name: "From LD", offers: { price: 2 } })]);
    const b = parsePdpResponse(pdp);
    const m = mergeTargetProducts(a, b);
    expect(m?.title).toBe("From LD");
    expect(m?.upc).toBe("016000275683");
    expect(mergeTargetProducts(null, null)).toBeNull();
  });
  it("reads the public web key out of inline config text", () => {
    expect(
      readApiKeyFromText('{"defaultServicesApiKey":"9f36aeafbe60771e321a7cc95a78140772ab3e96"}'),
    ).toBe("9f36aeafbe60771e321a7cc95a78140772ab3e96");
    expect(readApiKeyFromText("nothing here")).toBeNull();
  });
});
