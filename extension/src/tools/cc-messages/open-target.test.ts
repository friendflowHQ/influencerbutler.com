import { describe, expect, it } from "vitest";
import { CC_ENTRY_URL, brandMatches, buildOpenHash, buildOpenUrl, campaignDetailUrl, parseOpenHash } from "./open-target";

describe("open hash", () => {
  it("round-trips a brand, including spaces and symbols", () => {
    for (const brand of ["Litter-Robot", "Michael Todd Beauty", "Ben & Jerry's", "Café Ñandú"]) {
      expect(parseOpenHash(buildOpenHash(brand))).toBe(brand);
    }
  });

  it("builds the entry URL on the campaigns list", () => {
    expect(buildOpenUrl("Hair Max")).toBe(`${CC_ENTRY_URL}#ib-open-thread=Hair%20Max`);
  });

  it("finds the key among other hash parts", () => {
    expect(parseOpenHash("#foo=1&ib-open-thread=Piufike&bar=2")).toBe("Piufike");
    expect(parseOpenHash("ib-open-thread=Piufike")).toBe("Piufike");
  });

  it("returns null when absent, empty or malformed", () => {
    expect(parseOpenHash("")).toBeNull();
    expect(parseOpenHash("#other=1")).toBeNull();
    expect(parseOpenHash("#ib-open-thread=")).toBeNull();
    expect(parseOpenHash("#ib-open-thread=%E0%A4%A")).toBeNull();
    expect(parseOpenHash("#xib-open-thread=Nope")).toBeNull();
  });

  it("caps an absurd brand length", () => {
    expect(parseOpenHash(buildOpenHash("x".repeat(500)))).toHaveLength(200);
  });
});

describe("brandMatches", () => {
  it("matches across case, punctuation and spacing", () => {
    expect(brandMatches("Litter-Robot", "litter robot")).toBe(true);
    expect(brandMatches("K KAMERIO", "KKAMERIO")).toBe(true);
    expect(brandMatches("Ghostek™", "Ghostek")).toBe(true);
  });

  it("rejects different brands and empties", () => {
    expect(brandMatches("Alpha", "Alphabet")).toBe(false);
    expect(brandMatches("", "Alpha")).toBe(false);
    expect(brandMatches("!!!", "???")).toBe(false);
  });
});

describe("campaignDetailUrl", () => {
  it("opens the campaign page and carries the brand for the Message button", () => {
    expect(campaignDetailUrl("https://affiliate-program.amazon.com", "c 1", "Alpha Co")).toBe(
      "https://affiliate-program.amazon.com/p/connect/request?campaignId=c%201#ib-open-thread=Alpha%20Co",
    );
  });
});
