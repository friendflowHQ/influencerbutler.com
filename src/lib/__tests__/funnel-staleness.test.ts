import { describe, expect, it } from "vitest";
import {
  ageDays,
  lastTouched,
  latestStamp,
  mergeStepTimestamps,
  staleness,
  stalenessLabel,
} from "@/lib/funnel-staleness";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("staleness", () => {
  it("buckets at 30 / 31 / 60 / 61 days", () => {
    expect(staleness(daysAgo(0), NOW)).toBe("fresh");
    expect(staleness(daysAgo(30), NOW)).toBe("fresh");
    expect(staleness(daysAgo(31), NOW)).toBe("amber");
    expect(staleness(daysAgo(60), NOW)).toBe("amber");
    expect(staleness(daysAgo(61), NOW)).toBe("red");
  });

  it("treats a missing or junk date as red", () => {
    expect(staleness(null, NOW)).toBe("red");
    expect(staleness("not a date", NOW)).toBe("red");
  });

  it("accepts a YYYY-MM-DD code date and never goes negative", () => {
    expect(ageDays("2026-11-08", NOW)).toBe(0);
    expect(ageDays("2026-12-01", NOW)).toBe(0);
    expect(staleness("2026-09-01", NOW)).toBe("red");
  });

  it("labels never rely on color alone", () => {
    expect(stalenessLabel(daysAgo(3), NOW)).toBe("Fresh");
    expect(stalenessLabel(daysAgo(34), NOW)).toBe("Aging (34 days)");
    expect(stalenessLabel(daysAgo(72), NOW)).toBe("Stale (72 days, review)");
    expect(stalenessLabel(null, NOW)).toBe("Never reviewed");
    for (const s of [stalenessLabel(daysAgo(34), NOW), stalenessLabel(daysAgo(72), NOW)]) {
      expect(s).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
    }
  });
});

describe("lastTouched", () => {
  it("is the max of updated, reviewed and code date", () => {
    expect(
      lastTouched({ updatedAt: daysAgo(40), updatedBy: "a@x.com", reviewedAt: daysAgo(5), reviewedBy: "b@x.com", codeDate: "2026-10-01" }),
    ).toEqual({ at: daysAgo(5), by: "b@x.com" });
    expect(lastTouched({ updatedAt: daysAgo(90), updatedBy: "a@x.com", codeDate: "2026-11-08" })).toEqual({
      at: "2026-11-08",
      by: "code default",
    });
    expect(lastTouched({})).toEqual({ at: null, by: null });
  });

  it("latestStamp ignores unusable stamps", () => {
    expect(latestStamp(null, { at: "junk", by: "x" }, { at: daysAgo(1), by: null })).toEqual({ at: daysAgo(1), by: null });
  });
});

describe("mergeStepTimestamps", () => {
  const now = "2026-11-08T12:00:00.000Z";
  const old = [
    { day_offset: 0, subject: "A", body: "a", updated_at: "2026-10-01T00:00:00Z", updated_by: "old@x.com" },
    { day_offset: 2, subject: "B", body: "b", updated_at: "2026-10-02T00:00:00Z", updated_by: "old@x.com" },
  ];

  it("keeps stamps on unchanged steps", () => {
    const r = mergeStepTimestamps(old, [
      { day_offset: 0, subject: "A", body: "a" },
      { day_offset: 2, subject: "B", body: "b" },
    ], now, "me@x.com");
    expect(r.contentChanged).toBe(false);
    expect(r.steps.map((s) => s.updated_at)).toEqual(["2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z"]);
    expect(r.steps[0].updated_by).toBe("old@x.com");
  });

  it("stamps edited, inserted and removed steps", () => {
    const edited = mergeStepTimestamps(old, [
      { day_offset: 0, subject: "A", body: "a" },
      { day_offset: 2, subject: "B2", body: "b" },
    ], now, "me@x.com");
    expect(edited.contentChanged).toBe(true);
    expect(edited.steps[0].updated_at).toBe("2026-10-01T00:00:00Z");
    expect(edited.steps[1]).toMatchObject({ updated_at: now, updated_by: "me@x.com" });

    const inserted = mergeStepTimestamps(old, [...old, { day_offset: 5, subject: "C", body: "c" }], now, "me@x.com");
    expect(inserted.contentChanged).toBe(true);
    expect(inserted.steps[2]).toMatchObject({ updated_at: now });

    const removed = mergeStepTimestamps(old, [old[0]], now, "me@x.com");
    expect(removed.contentChanged).toBe(true);
    expect(removed.steps).toHaveLength(1);
  });

  it("stamps now when the old step had no updated_at (pre-migration)", () => {
    const r = mergeStepTimestamps([{ day_offset: 0, subject: "A", body: "a" }], [{ day_offset: 0, subject: "A", body: "a" }], now, "me@x.com");
    expect(r.contentChanged).toBe(false);
    expect(r.steps[0]).toMatchObject({ updated_at: now, updated_by: "me@x.com" });
  });
});
