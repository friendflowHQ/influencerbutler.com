import { describe, expect, it } from "vitest";
import { computeLandscape } from "./video-landscape";
import type { CarouselVideo } from "./video-carousel";

// Minimal video factory: only the fields a test cares about, the rest defaulted.
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

describe("computeLandscape: single-snapshot aggregates", () => {
  const videos: CarouselVideo[] = [
    video({ creatorName: "Ava", creatorType: "influencer", carousel: "lower" }),
    video({ creatorName: "ava", creatorType: "influencer", carousel: "lower" }), // same creator, different casing
    video({ creatorName: "Ben", creatorType: "influencer", carousel: "upper" }),
    video({ creatorName: "BrandCo", creatorType: "brand", carousel: "upper" }),
    video({ creatorName: null, creatorType: "customer", carousel: "lower" }), // unidentified
  ];

  it("counts known vs currently placed", () => {
    const l = computeLandscape(videos, 8);
    expect(l.known).toBe(8); // Amazon header total wins
    expect(l.currentlyPlaced).toBe(5);
  });

  it("falls back to snapshot size when no header total", () => {
    expect(computeLandscape(videos, null).known).toBe(5);
  });

  it("computes creator supply and unique creators", () => {
    const l = computeLandscape(videos, null);
    // Ava (x2 folded), Ben, BrandCo = 3 named creators.
    expect(l.uniqueCreators).toBe(3);
    expect(l.supply).toEqual({ creator: 3, brand: 1, customer: 1 });
    expect(l.contentMix).toEqual({ influencer: 3, brand: 1, customer: 1, unknown: 0 });
  });

  it("identifies repeat creators", () => {
    const l = computeLandscape(videos, null);
    expect(l.effective.identified).toBe(3);
    expect(l.effective.repeat).toBe(1); // only Ava has >1 video
  });

  it("ranks concentration by video count with relative bars", () => {
    const l = computeLandscape(videos, null);
    expect(l.concentration[0]).toMatchObject({ name: "Ava", count: 2, share: 1 });
    expect(l.concentration[1]!.share).toBeCloseTo(0.5); // Ben: 1 of top's 2
    // top-5 share over all 5 videos = (2+1+1+1... capped at 5 creators) / 5.
    expect(l.top5Share).toBeCloseTo(4 / 5);
  });

  it("ranks top videos by carousel-side proxy then payload order", () => {
    const l = computeLandscape(videos, null);
    // Upper-carousel videos come first (Ben, BrandCo), in payload order.
    expect(l.topByStrength[0]!.creatorName).toBe("Ben");
    expect(l.topByStrength[1]!.creatorName).toBe("BrandCo");
  });
});

describe("computeLandscape: graceful degradation (no dates, no durations)", () => {
  const videos: CarouselVideo[] = [
    video({ creatorName: "Ava" }),
    video({ creatorName: "Ben" }),
  ];

  it("omits every date-based section and never fabricates a zero", () => {
    const l = computeLandscape(videos, null);
    expect(l.hasDates).toBe(false);
    expect(l.newIn30).toBeUndefined();
    expect(l.pulse).toBeUndefined();
    expect(l.earliest).toBeUndefined();
    expect(l.datedCount).toBeUndefined();
  });

  it("omits the length section when no durations are present", () => {
    const l = computeLandscape(videos, null);
    expect(l.hasDurations).toBe(false);
    expect(l.medianSec).toBeUndefined();
    expect(l.bandSec).toBeUndefined();
  });

  it("never reports a media-type donut (field not parsed today)", () => {
    expect(computeLandscape(videos, null).hasMediaType).toBe(false);
  });

  it("produces finite numbers on an empty snapshot", () => {
    const l = computeLandscape([], null);
    expect(l.known).toBe(0);
    expect(l.currentlyPlaced).toBe(0);
    expect(l.uniqueCreators).toBe(0);
    expect(l.top5Share).toBe(0);
    expect(Number.isNaN(l.top5Share)).toBe(false);
    expect(l.concentration).toEqual([]);
  });
});

describe("computeLandscape: date-gated sections when publishedAt is present", () => {
  // Fixed clock so month bucketing is deterministic: 2026-08-18 UTC.
  const now = Date.UTC(2026, 7, 18);
  const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString();

  it("computes new-in-30, earliest, and a 12-month pulse", () => {
    // Note: JS month arg is 0-based, so iso(2026, 7, ...) is August 2026 (= now).
    const videos: CarouselVideo[] = [
      video({ creatorName: "A", publishedAt: iso(2026, 7, 10) }), // this month (August), within 30d
      video({ creatorName: "B", publishedAt: iso(2026, 6, 1) }), // last month (July)
      video({ creatorName: "C", publishedAt: iso(2025, 5, 1) }), // June 2025, > 12 months ago (out of window)
      video({ creatorName: "D" }), // undated
    ];
    const l = computeLandscape(videos, null, { now });
    expect(l.hasDates).toBe(true);
    expect(l.datedCount).toBe(3);
    expect(l.newIn30).toBe(1);
    // earliest is the min over ALL dated videos, regardless of the pulse window.
    expect(l.earliest).toBe(iso(2025, 5, 1));
    expect(l.pulse).toHaveLength(12);
    // Current month (August) is the last bucket.
    expect(l.pulse?.[11]).toBe(1);
    // Last month (July) is the second-to-last bucket.
    expect(l.pulse?.[10]).toBe(1);
    // The June 2025 video is older than the 12-bucket window, so it is excluded.
    expect(l.pulse?.reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe("computeLandscape: duration-gated section", () => {
  it("computes median and a p25-p75 band only above the min sample", () => {
    const videos: CarouselVideo[] = [30, 45, 60, 90, 120].map((durationSec) =>
      video({ creatorName: `c${durationSec}`, durationSec }),
    );
    const l = computeLandscape(videos, null);
    expect(l.hasDurations).toBe(true);
    expect(l.durationCount).toBe(5);
    expect(l.medianSec).toBe(60);
    expect(l.bandSec).toBeDefined();
  });

  it("hides the length stat entirely on a tiny (biased) sample", () => {
    // Durations are exposed for only a subset of videos, so fewer than 4 is not
    // a trustworthy sample: the section is omitted rather than showing a
    // misleading brand-only median.
    const videos: CarouselVideo[] = [30, 60].map((durationSec) =>
      video({ creatorName: `c${durationSec}`, durationSec }),
    );
    const l = computeLandscape(videos, null);
    expect(l.hasDurations).toBe(false);
    expect(l.medianSec).toBeUndefined();
    expect(l.bandSec).toBeUndefined();
  });
});

describe("computeLandscape: DOM-scanned carousel durations", () => {
  it("uses the DOM badge sample and outweighs a sparse brand-only durationSec set", () => {
    // The reported bug: Amazon ships durationSeconds only for the short brand
    // hero videos (28, 30), so on their own they are hidden (< 4). The hydrated
    // carousel DOM supplies the real creator-rail runtimes, giving a truthful,
    // longer median.
    const videos: CarouselVideo[] = [
      video({ creatorName: "BrandCo", creatorType: "brand", carousel: "upper", durationSec: 28 }),
      video({ creatorName: "BrandCo", creatorType: "brand", carousel: "upper", durationSec: 30 }),
      ...Array.from({ length: 8 }, (_, i) =>
        video({ creatorName: `creator${i}`, carousel: "lower" }),
      ),
    ];
    const domDurations = [60, 70, 80, 90, 100, 110, 120, 130];
    const l = computeLandscape(videos, 10, { domDurations });
    expect(l.hasDurations).toBe(true);
    // 2 upper durationSec + 8 DOM badges, no double count of the rail.
    expect(l.durationCount).toBe(10);
    expect(l.medianSec).toBe(80); // not the ~30 the brand-only sample would give
  });

  it("ignores lower-rail durationSec when DOM badges are present (no double count)", () => {
    const videos: CarouselVideo[] = [
      video({ creatorName: "BrandCo", creatorType: "brand", carousel: "upper", durationSec: 30 }),
      // Bogus lower durationSec that must be ignored in favor of the DOM badges.
      ...Array.from({ length: 3 }, (_, i) =>
        video({ creatorName: `creator${i}`, carousel: "lower", durationSec: 999 }),
      ),
    ];
    const l = computeLandscape(videos, 4, { domDurations: [60, 60, 60] });
    expect(l.hasDurations).toBe(true);
    expect(l.durationCount).toBe(4); // upper 30 + three DOM 60s, 999s excluded
    expect(l.medianSec).toBe(60);
  });

  it("hides the stat when the duration sample does not cover enough of the carousel", () => {
    // Reproduces the original failure: 5 real durations against a 24-video
    // carousel is unrepresentative, so the section is omitted rather than shown.
    const videos: CarouselVideo[] = Array.from({ length: 24 }, (_, i) =>
      video({ creatorName: `creator${i}`, carousel: "lower", durationSec: i < 5 ? 30 : null }),
    );
    const l = computeLandscape(videos, 24);
    expect(l.hasDurations).toBe(false);
    expect(l.medianSec).toBeUndefined();
  });
});
