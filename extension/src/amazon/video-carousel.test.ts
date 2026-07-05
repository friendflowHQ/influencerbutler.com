import { describe, expect, it } from "vitest";
import { classifiedCount, classifyCreatorType, extractFromText } from "./video-carousel";

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
});
