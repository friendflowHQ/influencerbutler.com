import { describe, expect, it } from "vitest";
import { matchParentAsin, parseBestsellerRank } from "./product-signals";

describe("matchParentAsin", () => {
  it("pulls the parent ASIN out of twister JSON", () => {
    expect(matchParentAsin('{"foo":1,"parentAsin":"B0DZ6SLJQ3","bar":2}')).toBe("B0DZ6SLJQ3");
    expect(matchParentAsin('"parentAsin" : "B0F8187BMN"')).toBe("B0F8187BMN");
  });

  it("returns null when absent or malformed", () => {
    expect(matchParentAsin("no marker here")).toBeNull();
    expect(matchParentAsin('"parentAsin":"tooShort"')).toBeNull();
  });
});

describe("parseBestsellerRank", () => {
  it("keeps the narrowest (smallest) rank and drops the See-Top-100 parenthetical", () => {
    const text =
      "Best Sellers Rank: #1,234 in Beauty & Personal Care (See Top 100 in Beauty) #2 in Wrinkle & Anti-Aging Devices";
    expect(parseBestsellerRank(text)).toEqual({ rank: 2, category: "Wrinkle & Anti-Aging Devices" });
  });

  it("handles a single-category rank", () => {
    expect(parseBestsellerRank("#16 in Electronics & Gadgets")).toEqual({
      rank: 16,
      category: "Electronics & Gadgets",
    });
  });

  it("stops the last category before Amazon's trailing Customer Reviews text", () => {
    // Real detail-bullets text (Wavytalk B0DZ6SLJQ3), verified live.
    const text =
      "Best Sellers Rank: #7,351 in Beauty & Personal Care (See Top 100 in Beauty & Personal Care) #5 in Wrinkle & Anti-Aging Devices Customer Reviews: 4.4 out of 5 stars var foo";
    expect(parseBestsellerRank(text)).toEqual({
      rank: 5,
      category: "Wrinkle & Anti-Aging Devices",
    });
  });

  it("returns null when there is no rank", () => {
    expect(parseBestsellerRank("Ships from Amazon")).toBeNull();
  });
});
