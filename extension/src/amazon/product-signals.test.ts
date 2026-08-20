import { describe, expect, it } from "vitest";
import { matchParentAsin, parseBestsellerRank, parseVariationAsins } from "./product-signals";

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

describe("parseVariationAsins", () => {
  it("collects every child ASIN keyed in the twister display data", () => {
    const text =
      'var x = {"dimensionValuesDisplayData":{"B0ABCDEFG1":["Red","S"],"B0ABCDEFG2":["Blue","M"],"B0ABCDEFG3":["Green","L"]},"parentAsin":"B0PARENT001"};';
    expect(parseVariationAsins(text).sort()).toEqual(["B0ABCDEFG1", "B0ABCDEFG2", "B0ABCDEFG3"]);
  });

  it("returns empty when there is no twister block", () => {
    expect(parseVariationAsins('{"parentAsin":"B0DZ6SLJQ3"}')).toEqual([]);
    expect(parseVariationAsins("nothing here")).toEqual([]);
  });

  it("does not pick up ASIN-like values that are not keys", () => {
    // Only the object keys (child ASINs) should be collected, not array values.
    const text = '{"dimensionValuesDisplayData":{"B0KEYAAAA1":["ABCDEFGHIJ"]}}';
    expect(parseVariationAsins(text)).toEqual(["B0KEYAAAA1"]);
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
