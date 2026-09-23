import { describe, expect, it } from "vitest";
import type { YouTubeStatusRecord } from "../../shared/messages";
import type { YouTubeStatusLookup } from "./status";
import { amazonShowingState, parseReachBanner, youtubeChipState } from "./model";

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

describe("parseReachBanner", () => {
  const editBanner =
    "Reach more shoppers with this video This video isn't being shown on product " +
    "detail pages because it doesn't meet our video quality bar. Your video is still " +
    "published and will appear on your Storefront. To improve its reach, follow our " +
    "video best practice guidelines, then delete this video and upload an improved " +
    "version. New uploads are evaluated within 48 hours.";

  it("reads kind and Amazon's reason clause off the item-page banner", () => {
    const out = parseReachBanner(editBanner);
    expect(out.notShowing).toBe(true);
    expect(out.kind).toBe("video");
    expect(out.reason).toBe("it doesn't meet our video quality bar");
  });

  it("flags the list-row 'Improve reach' affordance with no reason clause", () => {
    const out = parseReachBanner("One Week Later - Ice In The Cooler Published Improve reach");
    expect(out.notShowing).toBe(true);
    expect(out.reason).toBeNull();
  });

  it("detects a photo banner", () => {
    const out = parseReachBanner(
      "This photo isn't being shown on product detail pages because it doesn't meet our photo quality bar.",
    );
    expect(out.kind).toBe("photo");
  });

  it("is notShowing:false for ordinary published rows", () => {
    const out = parseReachBanner("Smooth Soft Shave Published Views 45 Likes 1");
    expect(out.notShowing).toBe(false);
    expect(out.reason).toBeNull();
  });
});
