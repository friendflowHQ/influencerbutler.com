import { describe, expect, it } from "vitest";
import { describeFailure, downloadFilenameFor, hostFor } from "./video-bump";

// The tab-driver / job orchestration needs a browser (chrome.tabs,
// chrome.downloads, chrome.alarms) and is validated by live QA, same
// convention as background/campaign-accept.ts; these are the pure pieces.

describe("hostFor", () => {
  it("passes through a real amazon marketplace host", () => {
    expect(hostFor("amazon.co.uk")).toBe("amazon.co.uk");
  });
  it("falls back to amazon.com for null, empty, or a non-amazon value", () => {
    expect(hostFor(null)).toBe("amazon.com");
    expect(hostFor(undefined)).toBe("amazon.com");
    expect(hostFor("")).toBe("amazon.com");
    expect(hostFor("walmart.com")).toBe("amazon.com");
  });
});

describe("downloadFilenameFor", () => {
  it("builds a readable, path-safe filename from the title", () => {
    const name = downloadFilenameFor("abc123", "My Great Review!");
    expect(name).toBe("influencer-butler/video-bump/abc123-My Great Review!.mp4");
  });
  it("strips characters that are illegal in a filename", () => {
    const name = downloadFilenameFor("abc123", 'A "Title": With / Bad \\ Chars?');
    const titlePart = name.slice("influencer-butler/video-bump/abc123-".length, -".mp4".length);
    expect(titlePart).not.toMatch(/["\\/:*?<>|]/);
  });
  it("falls back to a generic name when the title is null or blank", () => {
    expect(downloadFilenameFor("abc123", null)).toBe("influencer-butler/video-bump/abc123-video.mp4");
    expect(downloadFilenameFor("abc123", "   ")).toBe("influencer-butler/video-bump/abc123-video.mp4");
  });
});

describe("describeFailure", () => {
  it("gives a specific line for each known reason", () => {
    expect(describeFailure({ ok: false, kind: "delete", reason: "blocked" })).toMatch(/robot check/i);
    expect(describeFailure({ ok: false, kind: "capture", reason: "no-src" })).toMatch(/player/i);
    expect(describeFailure({ ok: false, kind: "reupload", reason: "cancelled" })).toMatch(/closed/i);
  });
  it("returns an empty string for a successful outcome", () => {
    expect(describeFailure({ ok: true, kind: "delete" })).toBe("");
  });
});
