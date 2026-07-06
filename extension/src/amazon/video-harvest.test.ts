import { afterEach, describe, expect, it, vi } from "vitest";
import { harvestVideos } from "./video-harvest";
import type { CarouselResult } from "./video-carousel";

type SeedVideo = { type: string; title: string; name: string };

function payload(videos: SeedVideo[], nextToken?: string): string {
  const obj: Record<string, unknown> = {
    videos: videos.map((v) => ({ creatorType: v.type, title: v.title, publicName: v.name })),
  };
  if (nextToken) obj.nextPageToken = nextToken;
  return JSON.stringify(obj);
}

// Returns each body in turn; once exhausted responds with a non-ok status so the
// pager treats the endpoint as finished.
function fetchReturning(bodies: (string | null)[]): ReturnType<typeof vi.fn> {
  let i = 0;
  return vi.fn(async () => {
    const body = bodies[i++];
    if (body == null) return { ok: false, text: async () => "" } as Response;
    return { ok: true, text: async () => body } as Response;
  });
}

const emptySeed: CarouselResult = {
  counts: { total: 0, influencer: 0, brand: 0, customer: 0, unknown: 0 },
  videos: [],
  strategy: "none",
};

const noop = () => undefined;
const liveSignal = () => new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

describe("harvestVideos", () => {
  it("pages via nextPageToken, dedupes across pages, and tags the lower carousel", async () => {
    const page1 = payload(
      [
        { type: "Influencer", title: "Honest review", name: "Cats ACE" },
        { type: "Influencer", title: "Couch rescue", name: "Cassie Luna" },
      ],
      "T2",
    );
    const page2 = payload(
      [
        { type: "Vendor", title: "Official demo", name: "BISSELL" },
        { type: "Customer", title: "My thoughts", name: "A. Shopper" },
      ],
      "T3",
    );
    // Page 3 re-serves a page-1 video and offers no next token: nothing new plus
    // no token means the pager stops here.
    const page3 = payload([{ type: "Influencer", title: "Honest review", name: "Cats ACE" }]);
    vi.stubGlobal("fetch", fetchReturning([page1, page2, page3]));

    const result = await harvestVideos(
      ["https://www.amazon.com/vse/related-videos?asin=X&pageToken=T1"],
      emptySeed,
      null,
      noop,
      liveSignal(),
    );

    expect(result.counts).toEqual({ total: 4, influencer: 2, brand: 1, customer: 1, unknown: 0 });
    expect(result.videos).toHaveLength(4);
    expect(result.pages).toBe(3);
    expect(result.lower.total).toBe(4);
    expect(result.upper.total).toBe(0);
    expect(result.capped).toBe(false);
  });

  it("stops once it has classified the header total", async () => {
    const page1 = payload(
      [
        { type: "Influencer", title: "A", name: "One" },
        { type: "Influencer", title: "B", name: "Two" },
      ],
      "T2",
    );
    const fetchMock = fetchReturning([page1, payload([{ type: "Influencer", title: "C", name: "Three" }])]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await harvestVideos(
      ["https://www.amazon.com/vse/related-videos?asin=X"],
      emptySeed,
      2,
      noop,
      liveSignal(),
    );

    expect(result.videos).toHaveLength(2);
    expect(result.pages).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tags the image-block endpoint as the upper carousel", async () => {
    const body = payload([{ type: "Vendor", title: "Brand hero", name: "ACME" }]);
    vi.stubGlobal("fetch", fetchReturning([body, body]));

    const result = await harvestVideos(
      ["https://www.amazon.com/detailpage-imageblock-player?asin=X"],
      emptySeed,
      null,
      noop,
      liveSignal(),
    );

    expect(result.upper.total).toBe(1);
    expect(result.upper.brand).toBe(1);
    expect(result.lower.total).toBe(0);
    // Second fetch re-served the same video, so it never advanced past page 1.
    expect(result.singlePayload).toBe(true);
  });

  it("does not double-count videos already in the seed", async () => {
    const seed: CarouselResult = {
      counts: { total: 1, influencer: 1, brand: 0, customer: 0, unknown: 0 },
      videos: [
        {
          title: "Honest review",
          creatorName: "Cats ACE",
          creatorType: "influencer",
          url: null,
          carousel: "lower",
        },
      ],
      strategy: "json",
    };
    vi.stubGlobal(
      "fetch",
      fetchReturning([payload([{ type: "Influencer", title: "Honest review", name: "Cats ACE" }])]),
    );

    const result = await harvestVideos(
      ["https://www.amazon.com/vse/related-videos?asin=X"],
      seed,
      null,
      noop,
      liveSignal(),
    );

    expect(result.videos).toHaveLength(1);
  });
});
