import { describe, expect, it } from "vitest";
import { parseAudioSuppressed } from "./model";

describe("parseAudioSuppressed", () => {
  it("flags the badge when 'Audio suppressed' is present", () => {
    expect(parseAudioSuppressed("One Week Later - Ice In The Cooler Published Audio suppressed")).toBe(
      true,
    );
  });

  it("is case-insensitive", () => {
    expect(parseAudioSuppressed("AUDIO SUPPRESSED")).toBe(true);
    expect(parseAudioSuppressed("aUdIo SuPpReSsEd")).toBe(true);
  });

  it("is false when the badge is absent", () => {
    expect(parseAudioSuppressed("Smooth Soft Shave Published Views 45 Likes 1")).toBe(false);
  });

  it("is false for an empty/undefined input", () => {
    expect(parseAudioSuppressed("")).toBe(false);
    expect(parseAudioSuppressed(undefined as unknown as string)).toBe(false);
  });

  it("tolerates extra/irregular whitespace around the phrase", () => {
    expect(parseAudioSuppressed("Title   Published\n\n  Audio    suppressed  ")).toBe(true);
  });

  it("matches only the audio-suppressed phrase, independent of other row badges", () => {
    // A realistic /manage-content row: title, status, the audio-suppressed
    // notification, and an unrelated "Improve reach" badge in the same row.
    const row =
      "One Week Later - Ice In The Cooler Published Audio suppressed Improve reach Views 120 Likes 4";
    expect(parseAudioSuppressed(row)).toBe(true);
  });

  it("is false for a row carrying only the unrelated 'Improve reach' badge", () => {
    const row = "One Week Later - Ice In The Cooler Published Improve reach";
    expect(parseAudioSuppressed(row)).toBe(false);
  });
});
