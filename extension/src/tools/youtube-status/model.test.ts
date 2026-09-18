import { describe, expect, it } from "vitest";
import type { YouTubeStatusRecord } from "../../shared/messages";
import type { YouTubeStatusLookup } from "./status";
import { amazonShowingState, youtubeChipState } from "./model";

const rec = (over: Partial<YouTubeStatusRecord>): YouTubeStatusRecord => ({
  contentId: "abc123def456aaaa",
  onYouTube: true,
  status: "uploaded",
  youtubeUrl: "https://youtu.be/x",
  youtubeVideoId: "x",
  uploadedAt: "2026-09-14T00:00:00Z",
  ...over,
});

const lookup = (paired: boolean, records: YouTubeStatusRecord[]): YouTubeStatusLookup => ({
  paired,
  byId: new Map(records.map((r) => [r.contentId.toLowerCase(), r])),
});

describe("youtubeChipState", () => {
  it("is 'on' for a paired, uploaded video (and returns its record)", () => {
    const out = youtubeChipState("ABC123DEF456AAAA", lookup(true, [rec({})]));
    expect(out.state).toBe("on");
    expect(out.record?.youtubeUrl).toBe("https://youtu.be/x");
  });

  it("is 'off' for a paired video with no upload record", () => {
    const out = youtubeChipState("ffff9999eeee8888", lookup(true, [rec({})]));
    expect(out.state).toBe("off");
    expect(out.record).toBeNull();
  });

  it("is 'off' but carries the record when the only record failed", () => {
    const failed = rec({ contentId: "cccc3333dddd4444", onYouTube: false, status: "failed", youtubeUrl: null });
    const out = youtubeChipState("cccc3333dddd4444", lookup(true, [failed]));
    expect(out.state).toBe("off");
    expect(out.record?.status).toBe("failed");
  });

  it("is 'unknown' whenever the app is not paired, even with a record present", () => {
    const out = youtubeChipState("abc123def456aaaa", lookup(false, [rec({})]));
    expect(out.state).toBe("unknown");
    expect(out.record).toBeNull();
  });

  it("is 'unknown' for an empty contentId", () => {
    expect(youtubeChipState("", lookup(true, [rec({})])).state).toBe("unknown");
  });
});

describe("amazonShowingState", () => {
  it("is 'not-showing' when the quality banner is present", () => {
    expect(amazonShowingState({ published: true, notShowing: true })).toBe("not-showing");
  });
  it("is 'showing' for a published video with no banner", () => {
    expect(amazonShowingState({ published: true, notShowing: false })).toBe("showing");
  });
  it("is 'unknown' for a draft / unread signal", () => {
    expect(amazonShowingState({})).toBe("unknown");
    expect(amazonShowingState({ published: false })).toBe("unknown");
  });
});
