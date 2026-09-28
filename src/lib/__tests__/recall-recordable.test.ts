/**
 * Summary: Unit tests for recordable-meeting-link detection.
 * Dependencies: vitest, ../recall. Pure helpers, no network.
 */
import { describe, it, expect } from "vitest";
import { isRecordableMeetingUrl, shouldScheduleRecordingBot } from "../recall";

describe("isRecordableMeetingUrl", () => {
  it("accepts real Google Meet room links", () => {
    expect(isRecordableMeetingUrl("https://meet.google.com/tdw-qaup-dmf")).toBe(true);
    expect(isRecordableMeetingUrl("http://meet.google.com/abc-defg-hij?authuser=0")).toBe(true);
    expect(isRecordableMeetingUrl("meet.google.com/kwk-eqdp-zeq")).toBe(true);
  });
  it("rejects non-Meet or empty links", () => {
    expect(isRecordableMeetingUrl(null)).toBe(false);
    expect(isRecordableMeetingUrl("")).toBe(false);
    expect(isRecordableMeetingUrl("https://zoom.us/j/123")).toBe(false);
    expect(isRecordableMeetingUrl("https://meet.google.com/")).toBe(false); // domain only, no room code
    expect(isRecordableMeetingUrl("https://teams.microsoft.com/l/meetup")).toBe(false);
  });
});

describe("shouldScheduleRecordingBot", () => {
  it("records an auto-created google_meet room", () => {
    expect(shouldScheduleRecordingBot("google_meet", "https://meet.google.com/tdw-qaup-dmf")).toBe(true);
  });
  it("records a hand-pasted manual meet.google.com link (the fix)", () => {
    expect(shouldScheduleRecordingBot("manual", "https://meet.google.com/tdw-qaup-dmf")).toBe(true);
  });
  it("skips when there is no join link", () => {
    expect(shouldScheduleRecordingBot("manual", null)).toBe(false);
    expect(shouldScheduleRecordingBot(null, "")).toBe(false);
  });
  it("skips a manual non-Meet link", () => {
    expect(shouldScheduleRecordingBot("manual", "https://zoom.us/j/999")).toBe(false);
  });
});
