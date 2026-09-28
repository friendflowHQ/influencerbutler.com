import { describe, expect, it } from "vitest";
import { parseGainPercent, parseRankBadge } from "./discovery-tiles";

describe("parseRankBadge", () => {
  it("reads a plain rank", () => {
    expect(parseRankBadge("#1")).toBe(1);
    expect(parseRankBadge("#42")).toBe(42);
  });

  it("reads thousands separators and stray whitespace", () => {
    expect(parseRankBadge("#1,234")).toBe(1234);
    expect(parseRankBadge("  # 7 ")).toBe(7);
  });

  it("returns null when there is no rank", () => {
    expect(parseRankBadge("Best seller")).toBeNull();
    expect(parseRankBadge("")).toBeNull();
    expect(parseRankBadge(null)).toBeNull();
    expect(parseRankBadge(undefined)).toBeNull();
  });
});

describe("parseGainPercent", () => {
  it("reads a percent gain", () => {
    expect(parseGainPercent("120%")).toBe(120);
    expect(parseGainPercent("1,234%")).toBe(1234);
  });

  it("ignores a leading sign", () => {
    expect(parseGainPercent("+300%")).toBe(300);
  });

  it("returns null when there is no percent", () => {
    expect(parseGainPercent("rising")).toBeNull();
    expect(parseGainPercent("")).toBeNull();
    expect(parseGainPercent(null)).toBeNull();
  });
});
