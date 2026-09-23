import { describe, expect, it } from "vitest";
import { resolveMyVideos, matchesVideo, sideIsStateable } from "./resolve";
import type { OwnVideoIndex, OwnVideoRecord } from "./own-videos";
import type { CardPlacement } from "../../amazon/my-video-card";
import type { CarouselBreakdown, CarouselSource, CarouselVideo } from "../../amazon/video-carousel";

// Pure resolver tests. No DOM and no jsdom (vitest runs in the node
// environment here, see amazon/creator-campaigns.test.ts), so carousel rows are
// hand-built literals and the card pass is represented by CardPlacement objects
// with a stand-in element. The DOM seam itself (readOwnCardPlacements) is
// covered by the live smoke test, not from here.

const MINE = "0f9cd8101111111111111111111111aa";
const THEIRS = "bbbbbbbb2222222222222222222222bb";

function video(over: Partial<CarouselVideo> = {}): CarouselVideo {
  return {
    title: "A video",
    creatorName: "Someone",
    creatorType: "influencer",
    url: null,
    carousel: "lower",
    contentId: null,
    position: null,
    ...over,
  };
}

function index(ids: string[], handle: string | null = "lizdean"): OwnVideoIndex {
  const byContentId = new Map<string, OwnVideoRecord>();
  for (const id of ids) {
    byContentId.set(id, {
      contentId: id,
      title: "Mine",
      asins: [],
      marketplace: null,
      source: "creator-manage",
      seenAt: Date.now(),
    });
  }
  return { byContentId, handle, usable: byContentId.size > 0 || !!handle };
}

function placement(over: Partial<CardPlacement> = {}): CardPlacement {
  return {
    el: {} as HTMLElement,
    carousel: "upper",
    position: 2,
    railSize: 6,
    contentId: null,
    ...over,
  };
}

function sides(upper = 0, lower = 0): CarouselBreakdown {
  const counts = (total: number) => ({
    total,
    influencer: total,
    brand: 0,
    customer: 0,
    unknown: 0,
  });
  return { upper: counts(upper), lower: counts(lower), unknown: counts(0) };
}

describe("resolveMyVideos", () => {
  it("states the side when the row read it from a real marker", () => {
    const row = video({
      contentId: `amzn1.vse.video.${MINE}`,
      carousel: "upper",
      sideFrom: "marker",
      position: 1,
    });
    const out = resolveMyVideos([row], index([MINE]), [], sides(3, 4));
    expect(out.kind).toBe("present");
    if (out.kind !== "present") return;
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0]!.sideEvidence).toBe("marker");
    expect(out.matches[0]!.carousel).toBe("upper");
    expect(out.matches[0]!.railSize).toBe(3);
    expect(sideIsStateable(out.matches[0]!)).toBe(true);
  });

  // The regression test for the whole design: extractFromVideoList labels every
  // influencer video "lower" from its content-id namespace, so a content-id
  // match must never be allowed to state a carousel.
  it("withholds the side when the row only assumed it", () => {
    const row = video({
      contentId: `amzn1.vse.video.${MINE}`,
      carousel: "lower",
      sideFrom: "assumed",
      position: 4,
    });
    const out = resolveMyVideos([row], index([MINE]), [], sides(1, 9));
    expect(out.kind).toBe("present");
    if (out.kind !== "present") return;
    const match = out.matches[0]!;
    expect(match.sideEvidence).toBe("assumed");
    expect(match.carousel).toBe("unknown");
    expect(match.position).toBeNull();
    expect(match.railSize).toBeNull();
    expect(sideIsStateable(match)).toBe(false);
  });

  it("treats a row with no sideFrom as assumed", () => {
    const row = video({ contentId: `amzn1.vse.video.${MINE}`, carousel: "lower" });
    const out = resolveMyVideos([row], index([MINE]), [], sides(0, 2));
    if (out.kind !== "present") throw new Error("expected a match");
    expect(out.matches[0]!.sideEvidence).toBe("assumed");
  });

  it("joins ids across every spelling they arrive in", () => {
    const viaPrefix = video({ contentId: `amzn1.vse.video.${MINE.toUpperCase()}` });
    const viaUrl = video({ url: `https://www.amazon.com/vdp/${MINE}` });
    for (const row of [viaPrefix, viaUrl]) {
      const out = resolveMyVideos([row], index([MINE]), [], sides());
      expect(out.kind).toBe("present");
    }
  });

  it("prefers the card placement over an assumed side, and carries its rank", () => {
    const row = video({
      contentId: `amzn1.vse.video.${MINE}`,
      carousel: "lower",
      sideFrom: "assumed",
    });
    const out = resolveMyVideos(
      [row],
      index([MINE]),
      [placement({ contentId: MINE, carousel: "upper", position: 2, railSize: 6 })],
      sides(6, 11),
    );
    if (out.kind !== "present") throw new Error("expected a match");
    expect(out.matches).toHaveLength(1);
    const match = out.matches[0]!;
    expect(match.idEvidence).toBe("handle-card");
    expect(match.sideEvidence).toBe("card");
    expect(match.carousel).toBe("upper");
    expect(match.position).toBe(2);
    expect(match.railSize).toBe(6);
    expect(match.video).toBe(row);
  });

  it("reports several own videos on one listing, upper first", () => {
    const upper = video({
      contentId: `amzn1.vse.video.${MINE}`,
      carousel: "upper",
      sideFrom: "marker",
    });
    const lowerId = "cccccccc3333333333333333333333cc";
    const lower = video({
      contentId: `amzn1.vse.video.${lowerId}`,
      carousel: "lower",
      sideFrom: "marker",
    });
    const out = resolveMyVideos([lower, upper], index([MINE, lowerId]), [], sides(2, 5));
    if (out.kind !== "present") throw new Error("expected matches");
    expect(out.matches).toHaveLength(2);
    expect(out.matches.map((m) => m.carousel)).toEqual(["upper", "lower"]);
  });

  it("stays silent when nothing matches", () => {
    const row = video({ contentId: `amzn1.vse.video.${THEIRS}`, sideFrom: "marker" });
    expect(resolveMyVideos([row], index([MINE]), [], sides(0, 1)).kind).toBe("silent");
  });

  // An own video that is not on this listing is not a story we can tell: it may
  // simply not have hydrated. Absence must never render as a negative.
  it("stays silent for an own video that is not on this listing", () => {
    expect(resolveMyVideos([], index([MINE]), [], sides()).kind).toBe("silent");
  });

  it("stays silent when there is no evidence source at all", () => {
    const empty: OwnVideoIndex = { byContentId: new Map(), handle: null, usable: false };
    const row = video({ contentId: `amzn1.vse.video.${MINE}`, sideFrom: "marker" });
    expect(resolveMyVideos([row], empty, [], sides(0, 1)).kind).toBe("silent");
    expect(resolveMyVideos([row], null, [], sides(0, 1)).kind).toBe("silent");
  });

  it("matches on the handle card alone when no content id is anywhere", () => {
    const out = resolveMyVideos(
      [],
      index([], "lizdean"),
      [placement({ contentId: null, carousel: "lower", position: 3, railSize: 8 })],
      sides(0, 8),
    );
    if (out.kind !== "present") throw new Error("expected a match");
    expect(out.matches[0]!.idEvidence).toBe("handle-card");
    expect(out.matches[0]!.contentId).toBeNull();
    expect(out.matches[0]!.carousel).toBe("lower");
    expect(sideIsStateable(out.matches[0]!)).toBe(true);
  });

  // A bridge-sourced id is an ordinary index entry: it proves the video is the
  // creator's, and it must not be allowed to state a side on its own.
  it("treats a bridge-sourced id exactly like a locally captured one", () => {
    const bridgeIndex = index([MINE]);
    bridgeIndex.byContentId.get(MINE)!.source = "bridge";
    const row = video({
      contentId: `amzn1.vse.video.${MINE}`,
      carousel: "lower",
      sideFrom: "assumed",
    });
    const out = resolveMyVideos([row], bridgeIndex, [], sides(0, 4));
    if (out.kind !== "present") throw new Error("expected a match");
    expect(out.matches[0]!.idEvidence).toBe("content-id");
    expect(sideIsStateable(out.matches[0]!)).toBe(false);
  });

  it("does not double-report a video seen by both the card and the id", () => {
    const row = video({ contentId: `amzn1.vse.video.${MINE}`, sideFrom: "marker" });
    const out = resolveMyVideos(
      [row],
      index([MINE]),
      [placement({ contentId: MINE.toUpperCase() })],
      sides(4, 4),
    );
    if (out.kind !== "present") throw new Error("expected a match");
    expect(out.matches).toHaveLength(1);
  });

  it("marks an unknown-rail card as unstateable rather than guessing", () => {
    const out = resolveMyVideos(
      [],
      index([], "lizdean"),
      [placement({ carousel: "unknown" as CarouselSource, position: null, railSize: null })],
      sides(),
    );
    if (out.kind !== "present") throw new Error("expected a match");
    expect(out.matches[0]!.sideEvidence).toBe("none");
    expect(sideIsStateable(out.matches[0]!)).toBe(false);
  });
});

describe("matchesVideo", () => {
  it("recognizes the row by identity and by content id", () => {
    const row = video({ contentId: `amzn1.vse.video.${MINE}`, sideFrom: "marker" });
    const other = video({ contentId: `amzn1.vse.video.${THEIRS}`, sideFrom: "marker" });
    const out = resolveMyVideos([row, other], index([MINE]), [], sides(0, 2));
    if (out.kind !== "present") throw new Error("expected a match");
    expect(matchesVideo(out.matches[0]!, row)).toBe(true);
    expect(matchesVideo(out.matches[0]!, other)).toBe(false);
  });
});
