import { describe, expect, it } from "vitest";
import { isRealTrialConversion, TRIAL_END_SKEW_MS } from "@/lib/trial-conversion";

const NOW = Date.parse("2026-11-07T15:34:00Z");

describe("isRealTrialConversion", () => {
  it("ignores non-active statuses", () => {
    expect(isRealTrialConversion("on_trial", null, NOW)).toBe(false);
    expect(isRealTrialConversion("cancelled", "2026-11-01T00:00:00Z", NOW)).toBe(false);
  });

  it("rejects 'active' while the trial is still running (the jetvelez case)", () => {
    expect(isRealTrialConversion("active", "2026-11-21T15:32:47Z", NOW)).toBe(false);
  });

  it("accepts 'active' once the trial has ended", () => {
    expect(isRealTrialConversion("active", "2026-11-07T15:00:00Z", NOW)).toBe(true);
  });

  it("tolerates LS converting slightly before trial_ends_at", () => {
    const soon = new Date(NOW + TRIAL_END_SKEW_MS - 1000).toISOString();
    expect(isRealTrialConversion("active", soon, NOW)).toBe(true);
  });

  it("treats a subscription with no trial as converted when active", () => {
    expect(isRealTrialConversion("active", null, NOW)).toBe(true);
    expect(isRealTrialConversion("active", "not-a-date", NOW)).toBe(true);
  });
});
