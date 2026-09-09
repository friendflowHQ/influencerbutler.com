import { describe, it, expect } from "vitest";
import {
  buildScenePrompt,
  formatEventDate,
  formatEventTime,
  titleFontSize,
} from "../event-image-text";

describe("buildScenePrompt", () => {
  it("themes the scene on the title and asks for no text", () => {
    const p = buildScenePrompt("Prime Day Big Deals Day Strategy Call");
    expect(p).toContain("Prime Day Big Deals Day Strategy Call");
    // The house STYLE_SUFFIX forbids text, so the prompt itself must not ask
    // for any words to be drawn.
    expect(p.toLowerCase()).not.toContain("text");
  });

  it("falls back to a generic theme for an empty title", () => {
    expect(buildScenePrompt("")).toContain("creator workshop");
  });
});

describe("formatEventDate / formatEventTime", () => {
  // 2026-09-24 17:00-18:00 UTC == 11:00 AM to 12:00 PM MDT in Denver.
  const start = "2026-09-24T17:00:00.000Z";
  const end = "2026-09-24T18:00:00.000Z";

  it("formats the date in the event timezone", () => {
    expect(formatEventDate(start, "America/Denver")).toBe("Thursday, September 24");
  });

  it("formats a time range with the zone abbreviation", () => {
    expect(formatEventTime(start, end, "America/Denver")).toBe("11:00 AM to 12:00 PM MDT");
  });

  it("returns empty strings for an unparseable start", () => {
    expect(formatEventDate("not-a-date", "America/Denver")).toBe("");
    expect(formatEventTime("not-a-date", end, "America/Denver")).toBe("");
  });
});

describe("titleFontSize", () => {
  it("shrinks as the title grows", () => {
    const short = titleFontSize("Short title");
    const long = titleFontSize("A".repeat(120));
    expect(short).toBeGreaterThan(long);
  });
});
