import { describe, expect, it } from "vitest";
import { channelAllowed, normalizeCreatorMode } from "./creator-mode";

describe("normalizeCreatorMode", () => {
  it("accepts the three valid modes", () => {
    expect(normalizeCreatorMode("onsite")).toBe("onsite");
    expect(normalizeCreatorMode("offsite")).toBe("offsite");
    expect(normalizeCreatorMode("both")).toBe("both");
  });

  it("is case/whitespace tolerant", () => {
    expect(normalizeCreatorMode(" ONSITE ")).toBe("onsite");
    expect(normalizeCreatorMode("Offsite")).toBe("offsite");
  });

  it("defaults unknown / empty / nullish to both", () => {
    expect(normalizeCreatorMode("")).toBe("both");
    expect(normalizeCreatorMode(undefined)).toBe("both");
    expect(normalizeCreatorMode(null)).toBe("both");
    expect(normalizeCreatorMode("neither")).toBe("both");
  });
});

describe("channelAllowed", () => {
  it("both mode allows every channel", () => {
    expect(channelAllowed("both", "onsite")).toBe(true);
    expect(channelAllowed("both", "offsite")).toBe(true);
    expect(channelAllowed("both", "both")).toBe(true);
  });

  it("a both-channel (neutral) feature shows under any mode", () => {
    expect(channelAllowed("onsite", "both")).toBe(true);
    expect(channelAllowed("offsite", "both")).toBe(true);
  });

  it("onsite mode hides offsite features and vice versa", () => {
    expect(channelAllowed("onsite", "onsite")).toBe(true);
    expect(channelAllowed("onsite", "offsite")).toBe(false);
    expect(channelAllowed("offsite", "offsite")).toBe(true);
    expect(channelAllowed("offsite", "onsite")).toBe(false);
  });
});
