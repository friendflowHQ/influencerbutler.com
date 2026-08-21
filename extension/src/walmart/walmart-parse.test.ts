import { describe, expect, it } from "vitest";
import { extractItemId, parseWalmartProduct } from "./product-signals";
import {
  parseWalmartSearchItems,
  parseWalmartPriceCents,
  parseWalmartReviewCount,
  parseWalmartRating,
} from "./search-results";

// Fixtures mirror the live __NEXT_DATA__ shape verified on walmart.com
// 2026-08-21 (product: initialData.data.product; search:
// initialData.searchResult.itemStacks[].items[] with [data-item-id]==usItemId).

describe("extractItemId", () => {
  it("pulls the trailing numeric id from an /ip/ url", () => {
    expect(extractItemId("https://www.walmart.com/ip/Great-Value-Milk/10450114")).toBe("10450114");
    expect(extractItemId("https://www.walmart.com/ip/10450114")).toBe("10450114");
    expect(extractItemId("https://www.walmart.com/ip/Some-Slug/987654321?athbdg=x")).toBe(
      "987654321",
    );
    expect(extractItemId("https://www.walmart.com/cp/food/976759")).toBeNull();
  });
});

const productFixture = {
  props: {
    pageProps: {
      initialData: {
        data: {
          product: {
            usItemId: "10450114",
            name: "Great Value Whole Vitamin D Milk, Gallon",
            brand: "Great Value",
            availabilityStatus: "IN_STOCK",
            averageRating: 4.6,
            numberOfReviews: 365792,
            sellerName: "Walmart.com",
            priceInfo: { currentPrice: { price: 3.13, currencyUnit: "USD" } },
            category: {
              path: [
                { name: "Food" },
                { name: "Dairy & Eggs" },
                { name: "Whole Milk" },
              ],
            },
            imageInfo: { thumbnailUrl: "https://i5.walmartimages.com/x.jpeg" },
          },
        },
      },
    },
  },
};

describe("parseWalmartProduct", () => {
  it("maps the product blob into a WalmartProduct", () => {
    const p = parseWalmartProduct(productFixture);
    expect(p).not.toBeNull();
    expect(p?.itemId).toBe("10450114");
    expect(p?.title).toBe("Great Value Whole Vitamin D Milk, Gallon");
    expect(p?.brand).toBe("Great Value");
    expect(p?.priceCents).toBe(313);
    expect(p?.currency).toBe("USD");
    expect(p?.inStock).toBe(true);
    expect(p?.category).toBe("Whole Milk");
    expect(p?.averageRating).toBe(4.6);
    expect(p?.numReviews).toBe(365792);
  });

  it("returns null when the product blob is absent", () => {
    expect(parseWalmartProduct({ props: { pageProps: { initialData: {} } } })).toBeNull();
    expect(parseWalmartProduct(null)).toBeNull();
  });
});

const searchFixture = {
  props: {
    pageProps: {
      initialData: {
        searchResult: {
          itemStacks: [
            {
              items: [
                { __typename: "AdPlaceholder" },
                {
                  __typename: "Product",
                  usItemId: "14765066103",
                  name: "HOOICB UV LED Nail Lamp",
                  price: 25.99,
                  averageRating: 4.3,
                  numberOfReviews: 333,
                  isSponsoredFlag: true,
                  imageInfo: { thumbnailUrl: "https://i5.walmartimages.com/a.jpeg" },
                  canonicalUrl: "/ip/HOOICB-UV-LED-Nail-Lamp/14765066103?classType=VARIANT",
                },
                {
                  __typename: "Product",
                  usItemId: "555000111",
                  name: "Organic Item",
                  price: 5.68,
                  averageRating: null,
                  numberOfReviews: 0,
                  imageInfo: { thumbnailUrl: "https://i5.walmartimages.com/b.jpeg" },
                  canonicalUrl: "/ip/Organic/555000111",
                },
              ],
            },
          ],
        },
      },
    },
  },
};

describe("parseWalmartSearchItems", () => {
  it("keeps Product tiles, skips ad placeholders, and maps fields by item id", () => {
    const map = parseWalmartSearchItems(searchFixture);
    expect(map.size).toBe(2);
    const a = map.get("14765066103");
    expect(a?.title).toBe("HOOICB UV LED Nail Lamp");
    expect(a?.priceCents).toBe(2599);
    expect(a?.rating).toBe(4.3);
    expect(a?.reviewCount).toBe(333);
    expect(a?.sponsored).toBe(true);
    expect(a?.href).toBe(
      "https://www.walmart.com/ip/HOOICB-UV-LED-Nail-Lamp/14765066103?classType=VARIANT",
    );
    const b = map.get("555000111");
    expect(b?.sponsored).toBe(false);
    expect(b?.priceCents).toBe(568);
  });

  it("returns an empty map when there are no item stacks", () => {
    expect(parseWalmartSearchItems({ props: { pageProps: { initialData: {} } } }).size).toBe(0);
  });
});

describe("Walmart tile DOM text parsers", () => {
  it("parses the price out of Walmart's product-price text", () => {
    // Verified live: the price hook reads "Now$3999 current price Now $39.99, Was $49.99".
    expect(parseWalmartPriceCents("Now$3999 current price Now $39.99, Was $49.99")).toBe(3999);
    expect(parseWalmartPriceCents("$15.99 current price $15.99")).toBe(1599);
    expect(parseWalmartPriceCents("From $1,299.00")).toBe(129900);
    expect(parseWalmartPriceCents("no price here")).toBeNull();
  });

  it("parses the review count", () => {
    expect(parseWalmartReviewCount("31")).toBe(31);
    expect(parseWalmartReviewCount("1,234")).toBe(1234);
    expect(parseWalmartReviewCount("")).toBeNull();
  });

  it("parses a rating from an aria-label", () => {
    expect(parseWalmartRating("4.5 out of 5 Stars")).toBe(4.5);
    expect(parseWalmartRating("no rating")).toBeNull();
    expect(parseWalmartRating("9 out of 5")).toBeNull();
  });
});
