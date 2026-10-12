import { describe, expect, it } from "vitest";
import { formatAgo, formatWhen, numericDate } from "./when";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12, 18, 0, 0);
const words = { today: "Today", yesterday: "Yesterday", daysAgo: (n: number) => `${n} days ago` };

describe("formatWhen", () => {
  it("prints relative words for the last week, like Amazon's rows", () => {
    expect(formatWhen(NOW - 60_000, NOW, "en-US", words)).toBe("Today");
    expect(formatWhen(NOW - DAY, NOW, "en-US", words)).toBe("Yesterday");
    expect(formatWhen(NOW - 3 * DAY, NOW, "en-US", words)).toBe("3 days ago");
    expect(formatWhen(NOW - 6 * DAY, NOW, "en-US", words)).toBe("6 days ago");
  });

  it("switches to a numeric date after a week", () => {
    expect(formatWhen(NOW - 7 * DAY, NOW, "en-US", words)).toBe(numericDate(NOW - 7 * DAY, "en-US"));
    expect(formatWhen(NOW - 7 * DAY, NOW, "en-US", words)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("is empty for an unknown time", () => {
    expect(formatWhen(0, NOW, "en-US", words)).toBe("");
    expect(formatWhen(Number.NaN, NOW, "en-US", words)).toBe("");
  });
});

describe("formatAgo", () => {
  const ago = { justNow: "just now", minAgo: (n: number) => `${n} min ago`, hoursAgo: (n: number) => `${n} h ago` };

  it("steps from minutes to hours to a date", () => {
    expect(formatAgo(NOW - 20_000, NOW, ago, "en-US")).toBe("just now");
    expect(formatAgo(NOW - 2 * 60_000, NOW, ago, "en-US")).toBe("2 min ago");
    expect(formatAgo(NOW - 3 * 3_600_000, NOW, ago, "en-US")).toBe("3 h ago");
    expect(formatAgo(NOW - 2 * DAY, NOW, ago, "en-US")).toBe(numericDate(NOW - 2 * DAY, "en-US"));
    expect(formatAgo(0, NOW, ago, "en-US")).toBe("");
  });
});
