import { describe, expect, it } from "vitest";
import { classifyCreatorType } from "./video-carousel";

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
