import { describe, expect, it } from "vitest";
import {
  carouselBreakdown,
  carouselSourceFor,
  classifiedCount,
  classifyCreatorType,
  classifyVideoAci,
  extractFromText,
  mergeCarouselCandidates,
  upperInfluencerSlot,
  type CarouselResult,
  type CarouselSource,
  type CarouselVideo,
  type CreatorClass,
} from "./video-carousel";

describe("classifyVideoAci", () => {
  it("classifies seller/brand content ids", () => {
    expect(classifyVideoAci("amzn1.ive.seller.video.06916f1ebbbd4c518f2f9339c4758c32")).toBe("brand");
  });

  it("classifies vse creator ids as influencer", () => {
    expect(classifyVideoAci("amzn1.vse.video.0f9cd810cfea4600ad66d9e94687cc46")).toBe("influencer");
    expect(classifyVideoAci("amzn1.ive.influencer.video.abc")).toBe("influencer");
  });

  it("classifies customer review ids", () => {
    expect(classifyVideoAci("amzn1.customer.video.abc")).toBe("customer");
    expect(classifyVideoAci("amzn1.customer.review.abc")).toBe("customer");
  });

  it("reports unrecognized namespaces as unknown instead of guessing", () => {
    expect(classifyVideoAci("amzn1.ive.somethingnew.video.x")).toBe("unknown");
    expect(classifyVideoAci("")).toBe("unknown");
  });
});

describe("classifyCreatorType", () => {
  it("classifies influencers", () => {
    expect(classifyCreatorType("INFLUENCER")).toBe("influencer");
    expect(classifyCreatorType("influencer")).toBe("influencer");
  });

  it("classifies brand-side uploads", () => {
    expect(classifyCreatorType("VENDOR")).toBe("brand");
    expect(classifyCreatorType("SELLER")).toBe("brand");
    expect(classifyCreatorType("Brand")).toBe("brand");
    expect(classifyCreatorType("amazon")).toBe("brand");
  });

  it("classifies customer review videos", () => {
    expect(classifyCreatorType("CUSTOMER")).toBe("customer");
    expect(classifyCreatorType("shopper")).toBe("customer");
  });

  it("reports unrecognized values as unknown instead of guessing", () => {
    expect(classifyCreatorType("SOMETHING_NEW")).toBe("unknown");
    expect(classifyCreatorType("")).toBe("unknown");
  });
});

describe("extractFromText", () => {
  const payload = JSON.stringify({
    videos: [
      { title: "Honest review", publicName: "Cats ACE", creatorType: "Influencer" },
      { title: "Couch rescue", publicName: "Cassie Luna", creatorType: "Influencer" },
      { title: "Official demo", publicName: "BISSELL", creatorType: "Vendor" },
      { title: "My thoughts", publicName: "A. Shopper", creatorType: "Customer" },
    ],
  });

  it("classifies a widget network payload by creatorType", () => {
    const result = extractFromText(payload);
    expect(result).not.toBeNull();
    expect(result?.counts).toEqual({ total: 4, influencer: 2, brand: 1, customer: 1, unknown: 0 });
    expect(result?.strategy).toBe("json");
    expect(result?.videos.map((v) => v.creatorName)).toContain("Cats ACE");
    expect(classifiedCount(result)).toBe(4);
  });

  it("returns null for payloads without creatorType markers", () => {
    expect(extractFromText('{"unrelated":"data"}')).toBeNull();
    expect(extractFromText("")).toBeNull();
  });

  it("tags every video with the carousel source it was given", () => {
    const result = extractFromText(payload, "lower");
    expect(result?.videos.every((v) => v.carousel === "lower")).toBe(true);
  });

  it("attaches a video url only when one aligns to each video", () => {
    const withUrls = JSON.stringify({
      videos: [
        { creatorType: "Influencer", title: "A", videoUrl: "https://www.amazon.com/vdp/1" },
        { creatorType: "Vendor", title: "B", videoUrl: "https://www.amazon.com/vdp/2" },
      ],
    });
    const result = extractFromText(withUrls);
    expect(result?.videos.map((v) => v.url)).toEqual([
      "https://www.amazon.com/vdp/1",
      "https://www.amazon.com/vdp/2",
    ]);
  });

  it("captures durationSeconds when one aligns to each video", () => {
    // Verified live 2026-08-18: the widget payload carries durationSeconds.
    const withDurations = JSON.stringify({
      videos: [
        { creatorType: "Influencer", title: "A", durationSeconds: 21 },
        { creatorType: "Vendor", title: "B", durationSeconds: 52 },
      ],
    });
    const result = extractFromText(withDurations);
    expect(result?.videos.map((v) => v.durationSec)).toEqual([21, 52]);
  });

  it("drops durations when they do not align one-per-video", () => {
    // Only one duration for two videos: a positional map would misattach it.
    const misaligned = JSON.stringify({
      videos: [
        { creatorType: "Influencer", title: "A", durationSeconds: 21 },
        { creatorType: "Vendor", title: "B" },
      ],
    });
    const result = extractFromText(misaligned);
    expect(result?.videos.map((v) => v.durationSec)).toEqual([null, null]);
  });
});

// Build a CarouselVideo fixture with only the fields the split logic reads.
function vid(creatorType: CreatorClass, carousel: CarouselSource, creatorName?: string): CarouselVideo {
  return {
    title: null,
    creatorName: creatorName ?? null,
    creatorType,
    url: null,
    carousel,
    contentId: null,
    position: null,
  };
}

function resultOf(videos: CarouselVideo[], strategy: CarouselResult["strategy"] = "json"): CarouselResult {
  const counts = { total: 0, influencer: 0, brand: 0, customer: 0, unknown: 0 };
  for (const v of videos) {
    counts[v.creatorType] += 1;
    counts.total += 1;
  }
  return { counts, videos, strategy };
}

describe("carouselBreakdown", () => {
  it("tallies videos into their carousel side", () => {
    const result = resultOf([
      vid("brand", "upper"),
      vid("influencer", "upper"),
      vid("influencer", "lower"),
      vid("customer", "lower"),
      vid("unknown", "unknown"),
    ]);
    const sides = carouselBreakdown(result);
    expect(sides.upper).toEqual({ total: 2, influencer: 1, brand: 1, customer: 0, unknown: 0 });
    expect(sides.lower).toEqual({ total: 2, influencer: 1, brand: 0, customer: 1, unknown: 0 });
    expect(sides.unknown.total).toBe(1);
  });

  it("returns empty buckets for a null result", () => {
    const sides = carouselBreakdown(null);
    expect(sides.upper.total + sides.lower.total + sides.unknown.total).toBe(0);
  });
});

describe("upperInfluencerSlot", () => {
  it("is on when an influencer video is in the upper carousel", () => {
    expect(upperInfluencerSlot(resultOf([vid("influencer", "upper"), vid("brand", "upper")]))).toBe("on");
  });

  it("is off when the upper carousel has videos but influencers are only in the lower rail", () => {
    expect(
      upperInfluencerSlot(resultOf([vid("brand", "upper"), vid("influencer", "lower")])),
    ).toBe("off");
  });

  it("is unknown when the upper carousel has not been observed", () => {
    expect(upperInfluencerSlot(resultOf([vid("influencer", "lower")]))).toBe("unknown");
    expect(upperInfluencerSlot(resultOf([]))).toBe("unknown");
    expect(upperInfluencerSlot(null)).toBe("unknown");
  });
});

describe("mergeCarouselCandidates", () => {
  it("keeps both carousels when different sources see different rails", () => {
    // videoList strategy: 3 brand videos it filed as upper hero.
    const videoList = resultOf([vid("brand", "upper"), vid("brand", "upper"), vid("brand", "upper")], "videoList");
    // Network payload: the lower rail hydrated with 9 influencers + 1 brand.
    const lowerVideos = [
      ...Array.from({ length: 9 }, (_, i) => vid("influencer", "lower", `Creator ${i}`)),
      vid("brand", "lower", "BrandCo"),
    ];
    const json = resultOf(lowerVideos, "json");

    const merged = mergeCarouselCandidates([json, videoList], 13);
    expect(merged).not.toBeNull();
    const sides = carouselBreakdown(merged);
    expect(sides.upper).toEqual({ total: 3, influencer: 0, brand: 3, customer: 0, unknown: 0 });
    expect(sides.lower.total).toBe(10);
    expect(sides.lower.influencer).toBe(9);
    expect(merged?.counts.total).toBe(13);
    // Aggregate influencer count (what Butler Approved reads) is the sum of sides.
    expect(merged?.counts.influencer).toBe(sides.upper.influencer + sides.lower.influencer);
    // Base strategy label is preserved (json won on classified count).
    expect(merged?.strategy).toBe("json");
  });

  it("falls back to the base candidate when the merge would exceed the header total", () => {
    const videoList = resultOf([vid("brand", "upper"), vid("brand", "lower")], "videoList");
    const json = resultOf([vid("influencer", "lower"), vid("influencer", "lower")], "json");
    // Header says only 2 videos exist, but per-side union would total 3+.
    const merged = mergeCarouselCandidates([json, videoList], 2);
    // Guard trips: returns the plain best candidate unchanged.
    expect(merged).toBe(json);
  });

  it("does not union two candidates that both saw the same side", () => {
    const a = resultOf([vid("influencer", "lower"), vid("influencer", "lower")], "json");
    const b = resultOf(
      [vid("influencer", "lower"), vid("influencer", "lower"), vid("customer", "lower")],
      "json",
    );
    const merged = mergeCarouselCandidates([a, b], null);
    // Only the stronger single lower source is taken, not a + b.
    expect(merged?.counts.total).toBe(3);
    expect(carouselBreakdown(merged).lower.total).toBe(3);
  });

  it("takes side-unknown videos only from the base candidate", () => {
    const base = resultOf([vid("influencer", "lower"), vid("unknown", "unknown")], "json");
    const other = resultOf([vid("brand", "upper"), vid("unknown", "unknown")], "videoList");
    const merged = mergeCarouselCandidates([base, other], null);
    expect(carouselBreakdown(merged).unknown.total).toBe(1);
  });

  it("degenerates to the single candidate when only one is present", () => {
    const only = resultOf([vid("influencer", "lower")], "json");
    expect(mergeCarouselCandidates([only], null)).toBe(only);
    expect(mergeCarouselCandidates([], null)).toBeNull();
  });
});

describe("carouselSourceFor", () => {
  it("maps image-block sources to the upper carousel", () => {
    expect(carouselSourceFor("detailpage-imageblock-player-x")).toBe("upper");
    expect(carouselSourceFor("https://www.amazon.com/imageblock?asin=X")).toBe("upper");
  });

  it("maps related-videos sources to the lower carousel", () => {
    expect(carouselSourceFor("vse-related-videos")).toBe("lower");
    expect(carouselSourceFor("https://www.amazon.com/vse/related-videos")).toBe("lower");
    expect(carouselSourceFor("vftphero-related-products-request-ps")).toBe("lower");
  });

  it("returns unknown rather than guessing a side", () => {
    expect(carouselSourceFor("something-else")).toBe("unknown");
    expect(carouselSourceFor("")).toBe("unknown");
  });
});
