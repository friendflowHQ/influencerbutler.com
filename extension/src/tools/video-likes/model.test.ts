import { describe, expect, it } from "vitest";
import { formatLikeCount, parseLikeCount } from "./model";

// The overlay injection (overlay.ts) needs a browser document, and this repo
// runs vitest in the node environment with no jsdom, so per the existing
// convention the injection is covered by the live smoke test and the tests here
// exercise the pure parse/format logic that carries the real behavior.

describe("parseLikeCount", () => {
  it("parses a plain or comma-grouped integer", () => {
    expect(parseLikeCount("9")).toBe(9);
    expect(parseLikeCount("201")).toBe(201);
    expect(parseLikeCount(" 1,234 ")).toBe(1234);
  });

  it("expands Amazon's k/m abbreviations", () => {
    expect(parseLikeCount("1.2K")).toBe(1200);
    expect(parseLikeCount("12k")).toBe(12000);
    expect(parseLikeCount("3M")).toBe(3_000_000);
  });

  it("returns null for empty / non-numeric text", () => {
    expect(parseLikeCount("")).toBeNull();
    expect(parseLikeCount("Helpful?")).toBeNull();
    expect(parseLikeCount(null)).toBeNull();
    expect(parseLikeCount(undefined)).toBeNull();
  });
});

describe("formatLikeCount", () => {
  it("shows exact counts under 1000", () => {
    expect(formatLikeCount(0)).toBe("0");
    expect(formatLikeCount(9)).toBe("9");
    expect(formatLikeCount(201)).toBe("201");
    expect(formatLikeCount(999)).toBe("999");
  });

  it("abbreviates thousands, one decimal below 10k", () => {
    expect(formatLikeCount(1000)).toBe("1k");
    expect(formatLikeCount(1200)).toBe("1.2k");
    expect(formatLikeCount(9900)).toBe("9.9k");
    expect(formatLikeCount(12000)).toBe("12k");
    expect(formatLikeCount(12750)).toBe("12k");
  });

  it("floors fractional inputs and rejects negatives / NaN", () => {
    expect(formatLikeCount(4.9)).toBe("4");
    expect(formatLikeCount(-3)).toBe("");
    expect(formatLikeCount(Number.NaN)).toBe("");
  });

  it("round-trips a parsed abbreviated count back to a clean label", () => {
    const parsed = parseLikeCount("1.2K");
    expect(parsed).not.toBeNull();
    expect(formatLikeCount(parsed as number)).toBe("1.2k");
  });
});
