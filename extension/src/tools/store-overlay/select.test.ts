import { describe, expect, it } from "vitest";
import { pickGreenBox, type GreenBoxInput } from "./select";

function row(overrides: Partial<GreenBoxInput>): GreenBoxInput {
  return {
    asin: "B000000001",
    score: 80,
    band: "hot",
    upperCarousel: true,
    inStock: true,
    ...overrides,
  };
}

describe("pickGreenBox", () => {
  it("boxes every hot product with an upper carousel that is in stock", () => {
    const picked = pickGreenBox([
      row({ asin: "A".padEnd(10, "1") }),
      row({ asin: "B".padEnd(10, "1"), score: 92 }),
    ]);
    expect(picked.size).toBe(2);
  });

  it("excludes warm and cool bands regardless of the other signals", () => {
    expect(pickGreenBox([row({ band: "warm" }), row({ band: "cool" })]).size).toBe(0);
  });

  it("excludes products without an upper carousel, including unknown", () => {
    // false = confirmed no hero slot; null = Tier 1 has not landed yet. Neither
    // may earn the box (the badge shows the score either way).
    expect(pickGreenBox([row({ upperCarousel: false })]).size).toBe(0);
    expect(pickGreenBox([row({ upperCarousel: null })]).size).toBe(0);
  });

  it("excludes out-of-stock but allows unknown stock", () => {
    expect(pickGreenBox([row({ inStock: false })]).size).toBe(0);
    expect(pickGreenBox([row({ inStock: null })]).size).toBe(1);
  });

  it("returns an empty set when nothing qualifies", () => {
    expect(pickGreenBox([]).size).toBe(0);
    expect(pickGreenBox([row({ band: "warm", upperCarousel: false })]).size).toBe(0);
  });
});
