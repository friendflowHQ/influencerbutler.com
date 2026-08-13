/**
 * Summary: Unit tests for the monthly affiliate swipe-kit's pure logic - the
 * deterministic monthly butler rotation and the email builder's content. No DB
 * or Resend involved (the broadcast runner is exercised in prod behind its
 * app_config guard).
 * Dependencies: vitest, ../affiliate-swipe-kit.
 */

import { describe, it, expect } from "vitest";
import {
  currentPeriod,
  pickButlersForPeriod,
  buildSwipeKitEmail,
} from "../affiliate-swipe-kit";

describe("currentPeriod", () => {
  it("formats YYYY-MM in UTC", () => {
    expect(currentPeriod(new Date("2026-08-13T12:00:00Z"))).toBe("2026-08");
    expect(currentPeriod(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });
});

describe("pickButlersForPeriod", () => {
  it("returns the requested count of distinct butlers", () => {
    const picked = pickButlersForPeriod("2026-08", 3);
    expect(picked).toHaveLength(3);
    const slugs = new Set(picked.map((b) => b.slug));
    expect(slugs.size).toBe(3);
  });

  it("is deterministic for the same period", () => {
    const a = pickButlersForPeriod("2026-08", 3).map((b) => b.slug);
    const b = pickButlersForPeriod("2026-08", 3).map((b) => b.slug);
    expect(a).toEqual(b);
  });

  it("rotates to a different set the next month", () => {
    const aug = pickButlersForPeriod("2026-08", 3).map((b) => b.slug);
    const sep = pickButlersForPeriod("2026-09", 3).map((b) => b.slug);
    expect(aug).not.toEqual(sep);
  });
});

describe("buildSwipeKitEmail", () => {
  const period = "2026-08";
  const butlers = pickButlersForPeriod(period, 3);

  it("includes the branded share link when a code is present", () => {
    const { text } = buildSwipeKitEmail({ name: "Sam Jones", brandedCode: "SAM", period, butlers });
    expect(text).toContain("/?code=SAM");
    expect(text).toContain("Hi Sam,");
  });

  it("falls back to the dashboard link when there is no code", () => {
    const { subject, text } = buildSwipeKitEmail({ name: null, brandedCode: null, period, butlers });
    expect(text).toContain("/dashboard/affiliates");
    expect(text).toContain("Hi there,");
    expect(subject).toContain("August 2026");
  });

  it("carries real post captions and names the featured butlers", () => {
    const { subject, text } = buildSwipeKitEmail({ name: "Sam", brandedCode: "SAM", period, butlers });
    for (const b of butlers) {
      expect(text).toContain(b.name);
      expect(subject).toContain(b.name);
    }
    expect(text).toContain("Caption:");
  });

  it("contains no em dashes (repo rule)", () => {
    const { subject, text } = buildSwipeKitEmail({ name: "Sam", brandedCode: "SAM", period, butlers });
    expect(text).not.toContain("—");
    expect(subject).not.toContain("—");
  });
});
