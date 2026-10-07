import { describe, expect, it } from "vitest";
import { detectPageType, detectRetailerForUrl } from "./page-type";

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

  it("treats the mobile-web /gp/aw/d/ product URL as a product page", () => {
    expect(detectPageType("https://www.amazon.com/gp/aw/d/B01JGG5CH4")).toBe("product");
    expect(detectPageType("https://www.amazon.co.uk/gp/aw/d/B01JGG5CH4/?ref_=x")).toBe("product");
  });

  it("still detects the other page families", () => {
    expect(detectPageType("https://www.amazon.com/dp/B01JGG5CH4")).toBe("product");
    expect(detectPageType("https://www.amazon.com/s?k=nail+lamp")).toBe("search");
    expect(detectPageType("https://www.amazon.com/gp/bestsellers/beauty")).toBe("discovery");
    expect(detectPageType("not a url")).toBe("other");
  });

  it("routes the Creator Connections grid vs a single-campaign detail page", () => {
    expect(
      detectPageType("https://affiliate-program.amazon.com/p/connect/requests?type=spcc"),
    ).toBe("campaign-grid");
    // Singular /request (not /requests) with an adId is the detail page; the more
    // specific test must win over the grid catch-all.
    expect(
      detectPageType(
        "https://affiliate-program.amazon.com/p/connect/request?creatorId=amzn1.creator.X&adId=amzn1.campaign.Y&type=spcc",
      ),
    ).toBe("campaign-detail");
  });
});

describe("detectPageType (Walmart)", () => {
  it("routes Walmart product pages to product", () => {
    expect(detectPageType("https://www.walmart.com/ip/Great-Value-Milk/10450114")).toBe("product");
    expect(detectPageType("https://www.walmart.com/ip/10450114")).toBe("product");
    expect(detectPageType("https://www.walmart.com/ip/Some-Long-Slug/987654321?athbdg=x")).toBe(
      "product",
    );
  });

  it("routes Walmart search, browse, and seller/brand pages", () => {
    expect(detectPageType("https://www.walmart.com/search?q=nail+lamp")).toBe("search");
    expect(detectPageType("https://www.walmart.com/browse/home/4044")).toBe("discovery");
    expect(detectPageType("https://www.walmart.com/cp/beauty/1085666")).toBe("discovery");
    expect(detectPageType("https://www.walmart.com/seller/101234")).toBe("brand-store");
    expect(detectPageType("https://www.walmart.com/brand/acme")).toBe("brand-store");
    expect(detectPageType("https://www.walmart.com/orders")).toBe("order-history");
  });

  it("does not misread a bare Walmart search path or unknown page", () => {
    expect(detectPageType("https://www.walmart.com/search")).toBe("other");
    expect(detectPageType("https://www.walmart.com/account")).toBe("other");
  });
});

describe("detectRetailerForUrl", () => {
  it("classifies Amazon, Walmart, and unrelated hosts", () => {
    expect(detectRetailerForUrl("https://www.amazon.com/dp/B01JGG5CH4")).toBe("amazon");
    expect(detectRetailerForUrl("https://affiliate-program.amazon.com/p/connect/requests")).toBe(
      "amazon",
    );
    expect(detectRetailerForUrl("https://www.amazon.co.uk/dp/B01JGG5CH4")).toBe("amazon");
    expect(detectRetailerForUrl("https://www.walmart.com/ip/10450114")).toBe("walmart");
    expect(detectRetailerForUrl("https://www.target.com/p/x/-/A-79344798")).toBe("target");
    expect(detectRetailerForUrl("https://example.com/x")).toBeNull();
    expect(detectRetailerForUrl("not a url")).toBeNull();
  });
});

describe("detectPageType (Target)", () => {
  it("recognizes a product page with or without a slug", () => {
    expect(detectPageType("https://www.target.com/p/cheerios-cereal/-/A-79344798")).toBe("product");
    expect(detectPageType("https://www.target.com/p/-/A-79344798")).toBe("product");
    expect(detectPageType("https://www.target.com/p/some-slug/-/A-79344798?preselect=1")).toBe(
      "product",
    );
  });

  it("treats every other Target page as other", () => {
    expect(detectPageType("https://www.target.com/")).toBe("other");
    expect(detectPageType("https://www.target.com/s?searchTerm=cereal")).toBe("other");
    expect(detectPageType("https://www.target.com/c/cereal/-/N-5xt1d")).toBe("other");
    expect(detectPageType("https://www.target.com/p/some-slug/-/A-12")).toBe("other");
  });
});

describe("Creator Hub routing", () => {
  it("routes the bare /creatorhub landing (the Manage videos list) to creator-manage", () => {
    expect(detectPageType("https://www.amazon.com/creatorhub")).toBe("creator-manage");
    expect(detectPageType("https://www.amazon.com/creatorhub/")).toBe("creator-manage");
    expect(detectPageType("https://www.amazon.com/creatorhub/manage")).toBe("creator-manage");
  });

  it("still routes the Edit Video page to creator-upload", () => {
    expect(detectPageType("https://www.amazon.com/creatorhub/video/amzn1.vse.video.abc")).toBe(
      "creator-upload",
    );
  });
});
