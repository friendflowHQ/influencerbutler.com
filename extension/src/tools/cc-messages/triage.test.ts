import { describe, expect, it } from "vitest";
import {
  countMatches,
  isTriageFilter,
  isUnreadDotColor,
  matchesFilter,
  type RowFacts,
} from "./triage";

describe("isUnreadDotColor", () => {
  it("accepts the red unread dot", () => {
    expect(isUnreadDotColor("rgb(204, 0, 0)")).toBe(true);
    expect(isUnreadDotColor("rgba(214, 0, 0, 1)")).toBe(true);
  });

  it("rejects other colors and transparent fills", () => {
    expect(isUnreadDotColor("rgb(249, 115, 22)")).toBe(false);
    expect(isUnreadDotColor("rgba(0, 0, 0, 0)")).toBe(false);
    expect(isUnreadDotColor("rgba(204, 0, 0, 0)")).toBe(false);
    expect(isUnreadDotColor("red")).toBe(false);
  });
});

const base: RowFacts = { unread: false, live: false, pitched: false, ratePct: null };

describe("matchesFilter", () => {
  it("keeps everything for all", () => {
    expect(matchesFilter("all", base)).toBe(true);
  });

  it("filters on each flag", () => {
    expect(matchesFilter("unread", { ...base, unread: true })).toBe(true);
    expect(matchesFilter("unread", base)).toBe(false);
    expect(matchesFilter("live", { ...base, live: true })).toBe(true);
    expect(matchesFilter("pitched", { ...base, pitched: true })).toBe(true);
    expect(matchesFilter("pitched", base)).toBe(false);
  });

  it("treats 10% as high and an unknown rate as not high", () => {
    expect(matchesFilter("highrate", { ...base, ratePct: 10 })).toBe(true);
    expect(matchesFilter("highrate", { ...base, ratePct: 9.9 })).toBe(false);
    expect(matchesFilter("highrate", base)).toBe(false);
  });
});

describe("countMatches / isTriageFilter", () => {
  it("counts matching rows", () => {
    const rows = [{ ...base, unread: true }, base, { ...base, unread: true }];
    expect(countMatches("unread", rows)).toBe(2);
    expect(countMatches("all", rows)).toBe(3);
  });

  it("validates stored values", () => {
    expect(isTriageFilter("unread")).toBe(true);
    expect(isTriageFilter("bogus")).toBe(false);
    expect(isTriageFilter(undefined)).toBe(false);
  });
});
