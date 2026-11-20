import { describe, expect, it } from "vitest";
import { ageMs, formatAge, isStale } from "./format-age";

const NOW = Date.parse("2026-11-20T12:00:00Z");

describe("format-age", () => {
  it("returns null for missing or bad dates", () => {
    expect(formatAge(null, NOW, "en")).toBeNull();
    expect(formatAge("", NOW, "en")).toBeNull();
    expect(formatAge("not a date", NOW, "en")).toBeNull();
    expect(ageMs(undefined, NOW)).toBeNull();
  });

  it("formats minutes, hours and days", () => {
    expect(formatAge("2026-11-20T11:30:00Z", NOW, "en")).toMatch(/30/);
    expect(formatAge("2026-11-20T10:00:00Z", NOW, "en")).toMatch(/2/);
    expect(formatAge("2026-11-17T12:00:00Z", NOW, "en")).toMatch(/3/);
  });

  it("treats a future timestamp as just now", () => {
    expect(ageMs("2026-11-21T12:00:00Z", NOW)).toBe(0);
    expect(formatAge("2026-11-21T12:00:00Z", NOW, "en")).toMatch(/now/i);
  });

  it("falls back to English for a bad locale", () => {
    expect(formatAge("2026-11-20T10:00:00Z", NOW, "not_a_locale!!")).toMatch(/2/);
  });

  it("marks data older than 7 days as stale", () => {
    expect(isStale("2026-11-12T12:00:00Z", NOW)).toBe(true);
    expect(isStale("2026-11-14T12:00:00Z", NOW)).toBe(false);
    expect(isStale(null, NOW)).toBe(false);
  });
});
