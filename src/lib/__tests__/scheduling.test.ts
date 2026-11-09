import { describe, it, expect } from "vitest";
import {
  activeRuleForDate,
  decoyRangesForDay,
  computeDaySlots,
  recurringBlockBusyRanges,
  type AvailabilityRule,
  type RecurringBlock,
} from "../scheduling";

const RULES: AvailabilityRule[] = [
  // Eastern through 2026-08-16, then Denver. Mon-Fri 10:00-17:00.
  ...[1, 2, 3, 4, 5].map((wd) => ({ weekday: wd, start_min: 600, end_min: 1020, timezone: "America/New_York", effective_from: null, effective_to: "2026-08-16" })),
  ...[1, 2, 3, 4, 5].map((wd) => ({ weekday: wd, start_min: 600, end_min: 1020, timezone: "America/Denver", effective_from: "2026-08-16", effective_to: null })),
];

describe("activeRuleForDate: Eastern -> Mountain phase switch", () => {
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

  it("every weekday has a demo slot (reserved setup-length window), all 90-minute blocks (75 + 15 break)", () => {
    for (const d of week) {
      const slots = computeDaySlots({ ...base, dateISO: d, callType: "demo", nowMs: past });
      expect(slots.length).toBeGreaterThan(0);
      for (const s of slots) {
        expect(s.endMs - s.startMs).toBe(90 * 60_000);
        expect(s.userEndMs - s.startMs).toBe(75 * 60_000);
      }
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

describe("wrap-by-2pm window (Denver 10:00-14:00)", () => {
  // Mirrors the seeded Denver rule after the school-pickup change: end_min 840.
  const rules: AvailabilityRule[] = [1, 2, 3, 4, 5].map((wd) => ({ weekday: wd, start_min: 600, end_min: 840, timezone: "America/Denver", effective_from: "2026-08-16", effective_to: null }));
  const base = { rules, busy: [], leadHours: 0, decoyOpts: { minPerDay: 2, maxPerDay: 4 } };
  const past = Date.parse("2026-08-01T00:00:00Z");
  const day = "2026-08-24"; // a Monday, Denver phase

  it("no support call ends after 2:00pm Mountain (block incl. buffer)", () => {
    const twoPmUtc = Date.parse(`${day}T20:00:00Z`); // 14:00 MDT
    const slots = computeDaySlots({ ...base, dateISO: day, callType: "support", nowMs: past });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.endMs <= twoPmUtc)).toBe(true);
    // The old 2:00pm start (block ending 3:00pm) is gone.
    const twoPmStartUtc = Date.parse(`${day}T20:00:00Z`);
    expect(slots.every((s) => s.startMs < twoPmStartUtc)).toBe(true);
  });

  it("still offers a setup call that ends by 2:00pm", () => {
    const twoPmUtc = Date.parse(`${day}T20:00:00Z`);
    const slots = computeDaySlots({ ...base, dateISO: day, callType: "demo", nowMs: past });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.endMs <= twoPmUtc)).toBe(true);
  });
});

describe("recurringBlockBusyRanges", () => {
  const block: RecurringBlock = { weekday: 1, start_min: 660, end_min: 720, timezone: "America/Denver" }; // Mon 11:00-12:00
  const from = Date.parse("2026-08-24T00:00:00Z"); // Mon
  const to = Date.parse("2026-09-07T00:00:00Z");    // +2 weeks

  it("materializes one range per matching weekday in the window", () => {
    const ranges = recurringBlockBusyRanges([block], from, to);
    // Mondays in range: Aug 24, Aug 31, Sep 7 boundary... expect at least 2.
    expect(ranges.length).toBeGreaterThanOrEqual(2);
    // 11:00 MDT == 17:00 UTC.
    expect(ranges.some((r) => r.startMs === Date.parse("2026-08-24T17:00:00Z") && r.endMs === Date.parse("2026-08-24T18:00:00Z"))).toBe(true);
  });

  it("hides overlapping support slots when merged into busy", () => {
    const rules: AvailabilityRule[] = [{ weekday: 1, start_min: 600, end_min: 840, timezone: "America/Denver", effective_from: "2026-08-16", effective_to: null }];
    const busy = recurringBlockBusyRanges([block], from, to);
    const slots = computeDaySlots({ rules, busy, leadHours: 0, decoyOpts: { minPerDay: 0, maxPerDay: 0 }, dateISO: "2026-08-24", callType: "support", nowMs: Date.parse("2026-08-01T00:00:00Z") });
    // No slot may overlap 11:00-12:00 Mountain.
    const bStart = Date.parse("2026-08-24T17:00:00Z");
    const bEnd = Date.parse("2026-08-24T18:00:00Z");
    expect(slots.every((s) => s.startMs >= bEnd || s.endMs <= bStart)).toBe(true);
  });

  it("returns nothing when the weekday never falls in the window", () => {
    const sat: RecurringBlock = { ...block, weekday: 6 };
    const narrow = recurringBlockBusyRanges([sat], Date.parse("2026-08-24T00:00:00Z"), Date.parse("2026-08-25T00:00:00Z"));
    expect(narrow).toEqual([]);
  });
});

describe("fixed_slots (hand-picked times per weekday)", () => {
  const monday: AvailabilityRule = {
    weekday: 1, start_min: 630, end_min: 900, timezone: "America/Denver", effective_from: "2026-08-16", effective_to: null,
    fixed_slots: [{ start_min: 630 }, { start_min: 720 }, { start_min: 840, types: ["support"] }],
  };
  const friday: AvailabilityRule = {
    weekday: 5, start_min: 630, end_min: 780, timezone: "America/Denver", effective_from: "2026-08-16", effective_to: null,
    fixed_slots: [{ start_min: 630 }, { start_min: 720, types: ["support"] }],
  };
  const base = { rules: [monday, friday], busy: [], leadHours: 0, decoyOpts: { minPerDay: 2, maxPerDay: 4 } };
  const past = Date.parse("2026-11-01T00:00:00Z");
  const localTimes = (slots: { startMs: number }[]) =>
    slots.map((s) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit" }).format(new Date(s.startMs)));

  it("Monday offers 10:30 and 12:00 for setup calls, plus 2:00 for priority only", () => {
    expect(localTimes(computeDaySlots({ ...base, dateISO: "2026-11-16", callType: "demo", nowMs: past }))).toEqual(["10:30 AM", "12:00 PM"]);
    expect(localTimes(computeDaySlots({ ...base, dateISO: "2026-11-16", callType: "support", nowMs: past }))).toEqual(["10:30 AM", "12:00 PM", "2:00 PM"]);
  });

  it("Friday: 10:30 for either call, 12:00 Priority only, every call done by 12:45 (1:00 pickup)", () => {
    const demo = computeDaySlots({ ...base, dateISO: "2026-11-13", callType: "demo", nowMs: past });
    const support = computeDaySlots({ ...base, dateISO: "2026-11-13", callType: "support", nowMs: past });
    expect(localTimes(demo)).toEqual(["10:30 AM"]);
    expect(localTimes(support)).toEqual(["10:30 AM", "12:00 PM"]);
    const pickup = Date.parse("2026-11-13T19:45:00Z"); // 12:45 MST
    expect([...demo, ...support].every((s) => s.userEndMs <= pickup)).toBe(true);
  });

  it("a Setup call leaves a 15-minute break before the next call", () => {
    // Monday 10:30 Setup ends 11:45; the 12:00 slot stays open, nothing earlier would.
    const tenThirty = Date.parse("2026-11-16T17:30:00Z");
    const [first] = computeDaySlots({ ...base, dateISO: "2026-11-16", callType: "demo", nowMs: past });
    expect(first.startMs).toBe(tenThirty);
    expect(first.endMs - first.userEndMs).toBe(15 * 60_000);
    const after = computeDaySlots({ ...base, busy: [{ startMs: first.startMs, endMs: first.endMs }], dateISO: "2026-11-16", callType: "support", nowMs: past });
    expect(localTimes(after)).toEqual(["12:00 PM", "2:00 PM"]);
  });

  it("places no decoys on fixed-slot days", () => {
    expect(decoyRangesForDay("2026-11-16", monday, { minPerDay: 2, maxPerDay: 4 })).toEqual([]);
  });

  it("drops a fixed time that is already booked", () => {
    const tenThirty = Date.parse("2026-11-13T17:30:00Z");
    const slots = computeDaySlots({ ...base, busy: [{ startMs: tenThirty, endMs: tenThirty + 90 * 60_000 }], dateISO: "2026-11-13", callType: "support", nowMs: past });
    expect(localTimes(slots)).toEqual(["12:00 PM"]);
  });
});
