import { describe, expect, it } from "vitest";
import { buildMaps, lookupKeyword, normalizeBrand } from "./normalize";
import type { OutreachRecord } from "./types";

function record(over: Partial<OutreachRecord> & { brand: string; keyword: string }): OutreachRecord {
  return {
    brandKey: over.brand.toLowerCase(),
    keywords: [over.keyword],
    lastSentAt: 0,
    ...over,
  };
}

describe("normalizeBrand", () => {
  it("lowercases and trims", () => {
    expect(normalizeBrand("  MARCHWAY  ")).toBe("marchway");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeBrand("K  KAMERIO")).toBe("k kamerio");
  });

  it("strips trademark and registered symbols", () => {
    expect(normalizeBrand("OCOOPA®")).toBe("ocoopa");
    expect(normalizeBrand("Ghostek™")).toBe("ghostek");
  });

  it("folds smart quotes and punctuation to spaces", () => {
    expect(normalizeBrand("Liz’s Picks!")).toBe("liz s picks");
    expect(normalizeBrand("Happy-Soles")).toBe("happy soles");
  });

  it("returns empty string for punctuation-only input", () => {
    expect(normalizeBrand("™®")).toBe("");
  });
});

describe("buildMaps + lookupKeyword", () => {
  it("resolves an exact normalized match", () => {
    const map = buildMaps([record({ brand: "MARCHWAY", keyword: "phone case" })]);
    expect(lookupKeyword(map, "MARCHWAY")?.keyword).toBe("phone case");
  });

  it("resolves through the space-insensitive fallback", () => {
    const map = buildMaps([record({ brand: "KKAMERIO", keyword: "hand warmer" })]);
    expect(lookupKeyword(map, "K KAMERIO")?.keyword).toBe("hand warmer");
  });

  it("matches despite a trademark symbol on the page", () => {
    const map = buildMaps([record({ brand: "OCOOPA", keyword: "hand warmer" })]);
    expect(lookupKeyword(map, "OCOOPA®")?.keyword).toBe("hand warmer");
  });

  it("returns null for a brand that was never messaged", () => {
    const map = buildMaps([record({ brand: "MARCHWAY", keyword: "phone case" })]);
    expect(lookupKeyword(map, "Some Other Brand")).toBeNull();
  });

  it("collapses multiple sends to the latest keyword", () => {
    const map = buildMaps([
      record({ brand: "Ghostek", keyword: "old case", lastSentAt: 100, keywords: ["old case"] }),
      record({ brand: "Ghostek", keyword: "new case", lastSentAt: 200, keywords: ["new case"] }),
    ]);
    expect(lookupKeyword(map, "Ghostek")?.keyword).toBe("new case");
  });

  it("skips records without a keyword", () => {
    const map = buildMaps([record({ brand: "Empty", keyword: "" })]);
    expect(lookupKeyword(map, "Empty")).toBeNull();
  });
});
