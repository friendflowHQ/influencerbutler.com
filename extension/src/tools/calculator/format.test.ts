import { describe, expect, it } from "vitest";
import { formatCompactMoney } from "./model";

describe("formatCompactMoney", () => {
  it("shows whole dollars under 1000 with no compaction", () => {
    expect(formatCompactMoney(98_000)).toBe("$980");
    expect(formatCompactMoney(50)).toBe("$1");
  });

  it("compacts thousands to K, one decimal below 10K", () => {
    expect(formatCompactMoney(1_400_00)).toBe("$1.4K");
    expect(formatCompactMoney(26_166_00)).toBe("$26K");
  });

  it("compacts millions to M", () => {
    expect(formatCompactMoney(1_400_000_00)).toBe("$1.4M");
    expect(formatCompactMoney(12_000_000_00)).toBe("$12M");
  });

  it("uses the currency symbol", () => {
    expect(formatCompactMoney(26_166_00, "EUR")).toBe("€26K");
    expect(formatCompactMoney(26_166_00, "GBP")).toBe("£26K");
  });

  it("returns n/a for non-finite input", () => {
    expect(formatCompactMoney(Number.NaN)).toBe("n/a");
  });
});
