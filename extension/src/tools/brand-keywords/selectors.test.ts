import { describe, expect, it } from "vitest";
import { isTimestampText } from "./selectors";

// The Messages drawer decides which leaf is a row's timestamp with this; a miss
// makes the whole conversation invisible to every Messages tool.
describe("isTimestampText", () => {
  it("accepts the relative and clock forms", () => {
    for (const t of ["1 hour ago", "6 hours ago", "2 days ago", "a minute ago", "Yesterday", "Today", "just now", "12:41 AM", "9:05 pm"]) {
      expect(isTimestampText(t), t).toBe(true);
    }
  });

  it("accepts the absolute dates older conversations show", () => {
    for (const t of ["09/29/2026", "9/2/26", "29/09/2026", "29.09.2026", "2026-09-29", "Sep 29", "Sept 29, 2026", "September 29th", "Monday"]) {
      expect(isTimestampText(t), t).toBe(true);
    }
  });

  it("does not mistake brand names for timestamps", () => {
    for (const t of ["CLOCKY", "Monster", "Sunscreen Co", "Satisfy", "SEDIMENT GONE", "May Day", "1st Phorm", "24/7 Fit", "Godefroy"]) {
      expect(isTimestampText(t), t).toBe(false);
    }
  });
});
