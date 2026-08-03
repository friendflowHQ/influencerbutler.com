/**
 * Summary: Unit tests for the daily-digest timezone helpers - the trickiest
 * pure logic (local wall-clock resolution and DST-safe wall->UTC conversion).
 * Dependencies: vitest, ../daily-digest.
 */

import { describe, it, expect } from "vitest";
import { localParts, zonedTimeToUtc, sampleDigestData } from "../daily-digest";

const MT = "America/Denver";

describe("localParts", () => {
  it("reads Mountain wall-clock during MDT (summer, UTC-6)", () => {
    // 2026-08-03 13:00 UTC is 07:00 in Denver (MDT).
    const p = localParts(new Date("2026-08-03T13:00:00Z"), MT);
    expect(p).toEqual({ year: 2026, month: 8, day: 3, hour: 7 });
  });

  it("reads Mountain wall-clock during MST (winter, UTC-7)", () => {
    // 2026-01-15 13:00 UTC is 06:00 in Denver (MST).
    const p = localParts(new Date("2026-01-15T13:00:00Z"), MT);
    expect(p).toEqual({ year: 2026, month: 1, day: 15, hour: 6 });
  });

  it("rolls the local day back when UTC has already ticked over", () => {
    // 01:00 UTC on the 4th is 19:00 (7pm) on the 3rd in Denver (MDT, UTC-6).
    const p = localParts(new Date("2026-08-04T01:00:00Z"), MT);
    expect(p).toEqual({ year: 2026, month: 8, day: 3, hour: 19 });
  });
});

describe("zonedTimeToUtc", () => {
  it("maps local midnight to the right UTC instant in summer (MDT)", () => {
    // Denver midnight Aug 3 (MDT, UTC-6) is 06:00 UTC.
    expect(zonedTimeToUtc(2026, 8, 3, 0, MT).toISOString()).toBe("2026-08-03T06:00:00.000Z");
  });

  it("maps local midnight to the right UTC instant in winter (MST)", () => {
    // Denver midnight Jan 15 (MST, UTC-7) is 07:00 UTC.
    expect(zonedTimeToUtc(2026, 1, 15, 0, MT).toISOString()).toBe("2026-01-15T07:00:00.000Z");
  });

  it("round-trips: a wall time converted to UTC reads back as the same wall time", () => {
    const utc = zonedTimeToUtc(2026, 8, 3, 0, MT);
    const back = localParts(utc, MT);
    expect(back).toEqual({ year: 2026, month: 8, day: 3, hour: 0 });
  });
});

describe("sampleDigestData", () => {
  it("produces a well-formed object for the design preview", () => {
    const d = sampleDigestData("morning");
    expect(d.variant).toBe("morning");
    expect(d.trends.trialClicks.values).toHaveLength(d.trends.trialClicks.labels.length);
    expect(d.locations.length).toBeGreaterThan(0);
  });
});
