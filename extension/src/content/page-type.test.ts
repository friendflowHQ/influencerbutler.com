import { describe, expect, it } from "vitest";
import { detectPageType } from "./page-type";

describe("detectPageType", () => {
  it("routes an Idea List detail page to idea-list, not storefront", () => {
    expect(detectPageType("https://www.amazon.com/shop/influencer-7d1a8a49/list/ZY4SIJ6VID67")).toBe(
      "idea-list",
    );
    expect(detectPageType("https://www.amazon.com/shop/handle/list/ZY4SIJ6VID67?ref_=x")).toBe(
      "idea-list",
    );
    expect(detectPageType("https://www.amazon.ca/shop/handle/list/ABCDEFGHIJ")).toBe("idea-list");
  });

  it("routes legacy /ideas/ URLs to idea-list", () => {
    expect(
      detectPageType("https://www.amazon.com/ideas/amzn1.account.AEXAMPLE/ZY4SIJ6VID67"),
    ).toBe("idea-list");
  });

  it("keeps the storefront root and its other tabs as storefront", () => {
    expect(detectPageType("https://www.amazon.com/shop/influencer-7d1a8a49")).toBe("storefront");
    expect(detectPageType("https://www.amazon.com/shop/influencer-7d1a8a49?ref_=x")).toBe(
      "storefront",
    );
    expect(detectPageType("https://www.amazon.com/shop/handle/photo/12345")).toBe("storefront");
  });

  it("still detects the other page families", () => {
    expect(detectPageType("https://www.amazon.com/dp/B01JGG5CH4")).toBe("product");
    expect(detectPageType("https://www.amazon.com/s?k=nail+lamp")).toBe("search");
    expect(detectPageType("https://www.amazon.com/gp/bestsellers/beauty")).toBe("discovery");
    expect(detectPageType("not a url")).toBe("other");
  });
});
