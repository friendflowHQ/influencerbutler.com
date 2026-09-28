import { describe, expect, it } from "vitest";
import { parseBoughtCount, parseBoughtFromBody } from "./bought-badge";

// parseBoughtCount is used on the dedicated social-proofing container's text,
// where the badge is essentially the only content. It reads the count from the
// locale-neutral "N+" / "NK+" shape first, then a localized phrase.
describe("parseBoughtCount (dedicated container)", () => {
  it("reads a plain count", () => {
    expect(parseBoughtCount("500+ bought in past month")).toBe(500);
  });

  it("expands the K multiplier", () => {
    expect(parseBoughtCount("2K+ bought in past month")).toBe(2000);
    expect(parseBoughtCount("1.5K+ bought in past month")).toBe(1500);
  });

  it("treats separators without a multiplier as thousands groups", () => {
    expect(parseBoughtCount("1,000+ bought in past month")).toBe(1000);
    expect(parseBoughtCount("1.000+ im letzten Monat gekauft")).toBe(1000);
  });

  it("floors rather than rounds", () => {
    // 9.9999K = 9999.9 -> 9999 (round would wrongly give 10000).
    expect(parseBoughtCount("9.9999K+ bought in past month")).toBe(9999);
  });

  it("caps at 1,000,000", () => {
    expect(parseBoughtCount("2M+ bought in past month")).toBe(1_000_000);
    expect(parseBoughtCount("5M+ bought in past month")).toBe(1_000_000);
  });

  it("reads the locale-neutral N+ shape regardless of surrounding words", () => {
    // The "+" carries the count, so these parse without a verified phrase.
    expect(parseBoughtCount("500+ Mal im letzten Monat gekauft")).toBe(500); // de
    expect(parseBoughtCount("300+ achetés au cours du mois dernier")).toBe(300); // fr
    expect(parseBoughtCount("1K+ comprados en el último mes")).toBe(1000); // es
  });

  it("reads the Japanese counter + 以上 shape", () => {
    expect(parseBoughtCount("500点以上")).toBe(500);
    expect(parseBoughtCount("1万点以上")).toBe(10_000);
  });

  it("returns null when no badge is present", () => {
    expect(parseBoughtCount("Best seller")).toBeNull();
    expect(parseBoughtCount("")).toBeNull();
  });
});

// parseBoughtFromBody is the fallback for a full page body or a search tile: a
// known phrase is REQUIRED so an unrelated page number is never taken for the
// badge.
describe("parseBoughtFromBody (whole-body / tile fallback)", () => {
  it("requires a phrase, not a bare number", () => {
    expect(parseBoughtFromBody("500+ bought in past month", "amazon.com")).toBe(500);
    // A bare "N+" with no phrase must not match in a body scan.
    expect(parseBoughtFromBody("Save $5+ today. 500+ ratings.", "amazon.com")).toBeNull();
  });

  it("ignores unrelated numbers around the phrase", () => {
    const tile = "$19.99 4.5 out of 5 stars (1,234) 500+ bought in past month Add to cart";
    expect(parseBoughtFromBody(tile, "amazon.com")).toBe(500);
  });

  it("uses the host's localized phrase list, with English as a fallback", () => {
    // Host unknown -> tries every known phrase.
    expect(parseBoughtFromBody("... 300+ bought in past month ...", null)).toBe(300);
    // Amazon sometimes serves English UI on a non-.com host; the EN fallback
    // in the host list still reads it.
    expect(parseBoughtFromBody("2K+ bought in past month", "amazon.de")).toBe(2000);
  });

  it("does not mistake the '1' in '1 month' phrasing for the count (JP)", () => {
    // The Japanese matcher is anchored on the counter+以上, so the leading "1"
    // in 1か月 ("1 month") cannot be grabbed.
    expect(parseBoughtFromBody("過去1か月で500点以上購入されました", "amazon.co.jp")).toBe(500);
  });

  it("returns null (never a wrong number) when an unverified phrasing does not match", () => {
    // 個購入 is not the counter+以上 shape we match, so this is null, not "1".
    expect(parseBoughtFromBody("過去1か月で500個購入されました", "amazon.co.jp")).toBeNull();
    expect(parseBoughtFromBody("No purchase badge here", "amazon.fr")).toBeNull();
  });
});
