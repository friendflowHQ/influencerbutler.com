import { describe, expect, it } from "vitest";
import { containsWord, rateForCategory, type StoredRateCard } from "./cache";

describe("containsWord", () => {
  it("matches whole words and simple plurals only", () => {
    expect(containsWord("home & kitchen", "kitchen")).toBe(true);
    expect(containsWord("office chairs", "chair")).toBe(true);
    expect(containsWord("chair", "hair")).toBe(false);
    expect(containsWord("carpet", "pet")).toBe(false);
  });
});

describe("rateForCategory", () => {
  const card = {
    defaultRatePct: 1,
    rows: [
      { tokens: ["hair", "beauty"], ratePct: 4, label: "Beauty" },
      { tokens: ["pet"], ratePct: 4, label: "Pets" },
    ],
  } as unknown as StoredRateCard;

  it("does not let a substring pick the wrong category", () => {
    expect(rateForCategory(card, "Chair")?.isDefault).toBe(true);
    expect(rateForCategory(card, "Carpet")?.isDefault).toBe(true);
  });

  it("still matches a real category", () => {
    expect(rateForCategory(card, "Pet Supplies")?.label).toBe("Pets");
    expect(rateForCategory(card, "Beauty")?.ratePct).toBe(4);
  });
});
