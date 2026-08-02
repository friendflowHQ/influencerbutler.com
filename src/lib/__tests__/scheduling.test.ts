import { describe, it, expect } from "vitest";
import {
  activeRuleForDate,
  decoyRangesForDay,
  computeDaySlots,
  type AvailabilityRule,
} from "../scheduling";

const RULES: AvailabilityRule[] = [
  // Eastern through 2026-08-16, then Denver. Mon-Fri 10:00-17:00.
  ...[1, 2, 3, 4, 5].map((wd) => ({ weekday: wd, start_min: 600, end_min: 1020, timezone: "America/New_York", effective_from: null, effective_to: "2026-08-16" })),
  ...[1, 2, 3, 4, 5].map((wd) => ({ weekday: wd, start_min: 600, end_min: 1020, timezone: "America/Denver", effective_from: "2026-08-16", effective_to: null })),
];

describe("activeRuleForDate — Eastern -> Mountain phase switch", () => {
  it("uses Eastern before 2026-08-16", () => {
    const r = activeRuleForDate(RULES, "2026-08-10"); // a Monday
    expect(r?.timezone).toBe("America/New_York");
  });
  it("uses Denver on/after 2026-08-16", () => {
    const r = activeRuleForDate(RULES, "2026-08-17"); // a Monday
    expect(r?.timezone).toBe("America/Denver");
  });
  it("returns null on a weekend", () => {
    expect(activeRuleForDate(RULES, "2026-08-15")).toBeNull(); // Saturday
  });
});

describe("decoyRangesForDay", () => {
  const rule = RULES[0];
  const opts = { minPerDay: 2, maxPerDay: 4 };
  it("always includes the fixed 15:00-17:00 block", () => {
    const ranges = decoyRangesForDay("2026-08-10", rule, opts);
    expect(ranges.some((r) => r.startMin === 900 && r.endMin === 1020)).toBe(true);
  });
  it("is deterministic across calls (stable decoys)", () => {
    const a = decoyRangesForDay("2026-08-10", rule, opts);
    const b = decoyRangesForDay("2026-08-10", rule, opts);
    expect(a).toEqual(b);
  });
  it("differs day to day", () => {
    const a = JSON.stringify(decoyRangesForDay("2026-08-10", rule, opts));
    const b = JSON.stringify(decoyRangesForDay("2026-08-11", rule, opts));
    expect(a).not.toBe(b);
  });
});

describe("computeDaySlots", () => {
  const base = { rules: RULES, busy: [], leadHours: 0, decoyOpts: { minPerDay: 2, maxPerDay: 4 } };
  const week = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"]; // Mon-Fri
  const past = Date.parse("2026-08-01T00:00:00Z");

  it("every weekday has support slots, all 60-minute blocks", () => {
    for (const d of week) {
      const slots = computeDaySlots({ ...base, dateISO: d, callType: "support", nowMs: past });
      expect(slots.length).toBeGreaterThan(0);
      for (const s of slots) expect(s.endMs - s.startMs).toBe(60 * 60_000);
    }
  });

  it("every weekday has a demo slot (reserved 2h window), all 120-minute blocks", () => {
    for (const d of week) {
      const slots = computeDaySlots({ ...base, dateISO: d, callType: "demo", nowMs: past });
      expect(slots.length).toBeGreaterThan(0);
      for (const s of slots) expect(s.endMs - s.startMs).toBe(120 * 60_000);
    }
  });

  it("no support slot overlaps the fixed 15:00 local decoy", () => {
    for (const d of week) {
      const slots = computeDaySlots({ ...base, dateISO: d, callType: "support", nowMs: past });
      const decoyStartUtc = Date.parse(`${d}T19:00:00Z`); // 15:00 EDT
      expect(slots.every((s) => s.endMs <= decoyStartUtc)).toBe(true);
    }
  });

  it("respects lead time (nothing within leadHours of now)", () => {
    const now = Date.parse("2026-08-10T14:00:00Z"); // 10:00 EDT that day
    const slots = computeDaySlots({ ...base, leadHours: 12, dateISO: "2026-08-10", callType: "support", nowMs: now });
    expect(slots.every((s) => s.startMs >= now + 12 * 3600_000)).toBe(true);
  });
});
