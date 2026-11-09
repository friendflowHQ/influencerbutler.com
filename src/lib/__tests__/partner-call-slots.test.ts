import { describe, expect, it } from "vitest";
import { PARTNER_PROGRAMS, findProgram, partnerHoldRanges, programSlots } from "@/lib/partner-call-slots";
import { CALL_TYPES } from "@/lib/scheduling";

describe("partner call slots", () => {
  const tanner = findProgram("tanner")!;

  it("has the 5 Tanner Setup-call times in Mountain time", () => {
    const slots = programSlots(tanner);
    expect(slots).toHaveLength(5);
    // Nov 13 10:30 MST = 17:30 UTC; Nov 24 10:00 MST = 17:00 UTC.
    expect(new Date(slots[0].startMs).toISOString()).toBe("2026-11-13T17:30:00.000Z");
    expect(new Date(slots[4].startMs).toISOString()).toBe("2026-11-24T17:00:00.000Z");
    for (const s of slots) {
      expect(s.endMs - s.startMs).toBe(CALL_TYPES.demo.blockMinutes * 60_000);
      expect(s.userEndMs - s.startMs).toBe(CALL_TYPES.demo.userMinutes * 60_000);
    }
  });

  it("holds every slot inside the requested window, and only those", () => {
    const all = programSlots(tanner);
    const holds = partnerHoldRanges(all[0].startMs, all[1].startMs + 1);
    expect(holds).toHaveLength(2);
    expect(partnerHoldRanges(0, 1)).toHaveLength(0);
  });

  it("unknown programs resolve to null and keys are unique", () => {
    expect(findProgram("nope")).toBeNull();
    expect(findProgram(null)).toBeNull();
    expect(new Set(PARTNER_PROGRAMS.map((p) => p.key)).size).toBe(PARTNER_PROGRAMS.length);
  });
});
