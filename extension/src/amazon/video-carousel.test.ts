import { describe, expect, it } from "vitest";
import {
  carouselSourceFor,
  classifiedCount,
  classifyCreatorType,
  classifyVideoAci,
  extractFromText,
} from "./video-carousel";

describe("classifyVideoAci", () => {
  it("classifies seller/brand content ids", () => {
    expect(classifyVideoAci("amzn1.ive.seller.video.06916f1ebbbd4c518f2f9339c4758c32")).toBe("brand");
  });

  it("classifies vse creator ids as influencer", () => {
    expect(classifyVideoAci("amzn1.vse.video.0f9cd810cfea4600ad66d9e94687cc46")).toBe("influencer");
    expect(classifyVideoAci("amzn1.ive.influencer.video.abc")).toBe("influencer");
  });

  it("classifies customer review ids", () => {
    expect(classifyVideoAci("amzn1.customer.video.abc")).toBe("customer");
    expect(classifyVideoAci("amzn1.customer.review.abc")).toBe("customer");
  });

  it("reports unrecognized namespaces as unknown instead of guessing", () => {
    expect(classifyVideoAci("amzn1.ive.somethingnew.video.x")).toBe("unknown");
    expect(classifyVideoAci("")).toBe("unknown");
  });
});

describe("classifyCreatorType", () => {
  it("classifies influencers", () => {
    expect(classifyCreatorType("INFLUENCER")).toBe("influencer");
    expect(classifyCreatorType("influencer")).toBe("influencer");
  });

  it("classifies brand-side uploads", () => {
    expect(classifyCreatorType("VENDOR")).toBe("brand");
    expect(classifyCreatorType("SELLER")).toBe("brand");
    expect(classifyCreatorType("Brand")).toBe("brand");
    expect(classifyCreatorType("amazon")).toBe("brand");
  });

  it("classifies customer review videos", () => {
    expect(classifyCreatorType("CUSTOMER")).toBe("customer");
    expect(classifyCreatorType("shopper")).toBe("customer");
  });

  it("reports unrecognized values as unknown instead of guessing", () => {
    expect(classifyCreatorType("SOMETHING_NEW")).toBe("unknown");
    expect(classifyCreatorType("")).toBe("unknown");
  });
});

describe("extractFromText", () => {
  const payload = JSON.stringify({
    videos: [
      { title: "Honest review", publicName: "Cats ACE", creatorType: "Influencer" },
      { title: "Couch rescue", publicName: "Cassie Luna", creatorType: "Influencer" },
      { title: "Official demo", publicName: "BISSELL", creatorType: "Vendor" },
      { title: "My thoughts", publicName: "A. Shopper", creatorType: "Customer" },
    ],
  });

  it("classifies a widget network payload by creatorType", () => {
    const result = extractFromText(payload);
    expect(result).not.toBeNull();
    expect(result?.counts).toEqual({ total: 4, influencer: 2, brand: 1, customer: 1, unknown: 0 });
    expect(result?.strategy).toBe("json");
    expect(result?.videos.map((v) => v.creatorName)).toContain("Cats ACE");
    expect(classifiedCount(result)).toBe(4);
  });

  it("returns null for payloads without creatorType markers", () => {
    expect(extractFromText('{"unrelated":"data"}')).toBeNull();
    expect(extractFromText("")).toBeNull();
  });

  it("tags every video with the carousel source it was given", () => {
    const result = extractFromText(payload, "lower");
    expect(result?.videos.every((v) => v.carousel === "lower")).toBe(true);
  });

  it("attaches a video url only when one aligns to each video", () => {
    const withUrls = JSON.stringify({
      videos: [
        { creatorType: "Influencer", title: "A", videoUrl: "https://www.amazon.com/vdp/1" },
        { creatorType: "Vendor", title: "B", videoUrl: "https://www.amazon.com/vdp/2" },
      ],
    });
    const result = extractFromText(withUrls);
    expect(result?.videos.map((v) => v.url)).toEqual([
      "https://www.amazon.com/vdp/1",
      "https://www.amazon.com/vdp/2",
    ]);
  });
});

describe("carouselSourceFor", () => {
  it("maps image-block sources to the upper carousel", () => {
    expect(carouselSourceFor("detailpage-imageblock-player-x")).toBe("upper");
    expect(carouselSourceFor("https://www.amazon.com/imageblock?asin=X")).toBe("upper");
  });

  it("maps related-videos sources to the lower carousel", () => {
    expect(carouselSourceFor("vse-related-videos")).toBe("lower");
    expect(carouselSourceFor("https://www.amazon.com/vse/related-videos")).toBe("lower");
    expect(carouselSourceFor("vftphero-related-products-request-ps")).toBe("lower");
  });

  it("returns unknown rather than guessing a side", () => {
    expect(carouselSourceFor("something-else")).toBe("unknown");
    expect(carouselSourceFor("")).toBe("unknown");
  });
});
