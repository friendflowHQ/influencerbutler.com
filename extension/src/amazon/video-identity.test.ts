import { describe, expect, it } from "vitest";
import { deriveCreatorId, deriveVideoId } from "./video-identity";
import type { CarouselVideo } from "./video-carousel";

function video(v: Partial<CarouselVideo>): CarouselVideo {
  return {
    title: null,
    creatorName: null,
    creatorType: "influencer",
    url: null,
    carousel: "lower",
    contentId: null,
    position: null,
    ...v,
  };
}

describe("deriveVideoId", () => {
  it("prefers the aciContentId, lowercased", () => {
    expect(deriveVideoId(video({ contentId: "amzn1.VSE.video.ABC123" }))).toBe(
      "amzn1.vse.video.abc123",
    );
  });

  it("falls back to a vdp id parsed from the url", () => {
    expect(
      deriveVideoId(video({ url: "https://www.amazon.com/vdp/0f9cd810cfea4600" })),
    ).toBe("vdp:0f9cd810cfea4600");
  });

  it("falls back to a self-labeled hash of name and title", () => {
    const id = deriveVideoId(video({ creatorName: "Ava", title: "Great review" }));
    expect(id).toMatch(/^t:[0-9a-f]+$/);
    // Deterministic: same inputs, same id.
    expect(deriveVideoId(video({ creatorName: "ava", title: "great review" }))).toBe(id);
  });

  it("returns null when there is nothing to identify by", () => {
    expect(deriveVideoId(video({}))).toBeNull();
  });
});

describe("deriveCreatorId", () => {
  it("derives a stable n: id from the creator name", () => {
    const id = deriveCreatorId(video({ creatorName: "Ava" }));
    expect(id).toMatch(/^n:[0-9a-f]+$/);
    expect(deriveCreatorId(video({ creatorName: "AVA" }))).toBe(id);
  });

  it("returns null for an unnamed creator", () => {
    expect(deriveCreatorId(video({}))).toBeNull();
  });
});
