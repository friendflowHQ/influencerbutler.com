import { describe, expect, it } from "vitest";
import { containsWord, rateForCategory, snsBountyForCategory, type StoredRateCard } from "./cache";

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

describe("snsBountyForCategory", () => {
  const card = {
    rows: [],
    defaultRatePct: null,
    snsBounty: [
      { tokens: ["beauty & grooming", "beauty & personal care"], amountCents: 25 },
      { tokens: ["grocery", "grocery & gourmet food"], amountCents: 30 },
    ],
  } as unknown as StoredRateCard;

  it("matches on a department-name breadcrumb", () => {
    expect(snsBountyForCategory(card, "Beauty & Personal Care")?.amountCents).toBe(25);
  });

  // Confirmed live 2026-10-17 (desktop app): a real product's own leaf
  // category can read "Hair Shampoo", with no trace of "Beauty" at all. A
  // full breadcrumb path lets an earlier segment still find it.
  it("matches a narrow leaf category via an earlier breadcrumb segment", () => {
    const match = snsBountyForCategory(card, "Beauty & Personal Care/Hair Care/Hair Shampoo");
    expect(match?.amountCents).toBe(25);
  });

  it("does not match an unrelated category", () => {
    expect(snsBountyForCategory(card, "Electronics/Computers")).toBeNull();
  });

  it("does not let Luxury Stores Beauty match the Beauty group", () => {
    expect(snsBountyForCategory(card, "Luxury Stores Beauty")).toBeNull();
  });

  it("returns null with no category or no snsBounty data", () => {
    expect(snsBountyForCategory(card, null)).toBeNull();
    expect(snsBountyForCategory(card, "")).toBeNull();
    expect(snsBountyForCategory({ rows: [], defaultRatePct: null } as unknown as StoredRateCard, "Beauty & Personal Care")).toBeNull();
  });
});
