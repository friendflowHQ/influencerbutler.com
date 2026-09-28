import { describe, expect, it } from "vitest";
import { buildPassport, countRotations, type DayRow } from "@/lib/video-passport";

// Fixed clock: 2026-08-18 UTC, so day math is deterministic.
const NOW = Date.UTC(2026, 7, 18);
const row = (day: string, over: Partial<DayRow> = {}): DayRow => ({
  observed_day: day,
  asin: "B000000001",
  carousel: "upper",
  position: 2,
  ...over,
});

describe("buildPassport: cold-start honesty", () => {
  it("withholds longitudinal metrics until enough days accrue", () => {
    const p = buildPassport([row("2026-08-18")], "2026-08-18", NOW);
    expect(p.collecting).toBe(true);
    // Rate/rotation are withheld, never fabricated as 0.
    expect(p.presenceRate).toBeNull();
    expect(p.rotationRate).toBeNull();
    expect(p.stability).toBeNull();
    expect(p.activeDayStrength).toBeNull();
    // But the genuinely-known facts are still returned.
    expect(p.activeDays).toBe(1);
    expect(p.productReach).toBe(1);
  });

  it("returns a full 90-day series with no_data for un-observed days", () => {
    const p = buildPassport([row("2026-08-18")], "2026-08-18", NOW);
    expect(p.series).toHaveLength(90);
    const last = p.series[89]!;
    expect(last.day).toBe("2026-08-18");
    expect(last.status).toBe("visible");
    // A day with no observation is "no_data", not a fake "absent".
    expect(p.series[88]!.status).toBe("no_data");
    expect(p.series[88]!.asinCount).toBe(0);
  });
});

describe("buildPassport: metrics once data has accrued", () => {
  // 4 consecutive days, placement changes once (upper -> lower) so there is at
  // least one real transition and cold-start clears.
  const rows: DayRow[] = [
    row("2026-08-15", { carousel: "upper", position: 2 }),
    row("2026-08-16", { carousel: "upper", position: 2 }),
    row("2026-08-17", { carousel: "lower", position: 5 }),
    row("2026-08-18", { carousel: "lower", position: 5 }),
  ];

  it("computes presence, rotation, stability and carousel share", () => {
    const p = buildPassport(rows, "2026-08-15", NOW);
    expect(p.collecting).toBe(false);
    expect(p.daysTracked).toBe(4);
    expect(p.activeDays).toBe(4);
    expect(p.presenceRate).toBeCloseTo(1); // seen all 4 tracked days
    // 3 transitions, 1 bucket change (upper:a -> lower:b).
    expect(p.rotationRate).toBeCloseTo(1 / 3);
    expect(p.stability).toBeCloseTo(2 / 3);
    expect(p.upperShare).toBeCloseTo(0.5);
    expect(p.lowerShare).toBeCloseTo(0.5);
    expect(p.productReach).toBe(1);
  });
});

describe("countRotations", () => {
  it("counts a change only when the coarse placement bucket moves", () => {
    // position 1 -> 3 stays in band a (no churn); 3 -> 5 crosses into band b.
    const rows: DayRow[] = [
      row("2026-08-16", { position: 1 }),
      row("2026-08-17", { position: 3 }),
      row("2026-08-18", { position: 5 }),
    ];
    const { transitions, changes } = countRotations(rows);
    expect(transitions).toBe(2);
    expect(changes).toBe(1);
  });

  it("has no transitions with a single observed day", () => {
    expect(countRotations([row("2026-08-18")])).toEqual({ transitions: 0, changes: 0 });
  });
});
