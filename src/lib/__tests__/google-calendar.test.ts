import { describe, it, expect } from "vitest";
import { parseFreeBusy } from "../google-calendar";

describe("parseFreeBusy", () => {
  it("flattens busy ranges across calendars into UTC ms", () => {
    const ranges = parseFreeBusy({
      calendars: {
        primary: { busy: [{ start: "2026-08-24T17:00:00Z", end: "2026-08-24T18:00:00Z" }] },
        other: { busy: [{ start: "2026-08-24T20:00:00Z", end: "2026-08-24T20:30:00Z" }] },
      },
    });
    expect(ranges).toEqual([
      { startMs: Date.parse("2026-08-24T17:00:00Z"), endMs: Date.parse("2026-08-24T18:00:00Z") },
      { startMs: Date.parse("2026-08-24T20:00:00Z"), endMs: Date.parse("2026-08-24T20:30:00Z") },
    ]);
  });

  it("drops malformed or zero-length entries", () => {
    const ranges = parseFreeBusy({
      calendars: {
        primary: { busy: [
          { start: "not-a-date", end: "2026-08-24T18:00:00Z" },
          { start: "2026-08-24T18:00:00Z", end: "2026-08-24T18:00:00Z" }, // zero length
          { start: "2026-08-24T19:00:00Z" }, // missing end
        ] },
      },
    });
    expect(ranges).toEqual([]);
  });

  it("returns [] when there are no calendars", () => {
    expect(parseFreeBusy({})).toEqual([]);
  });
});
