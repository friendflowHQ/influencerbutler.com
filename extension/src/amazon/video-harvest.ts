import {
  carouselSourceFor,
  extractFromText,
  type CarouselResult,
  type CarouselSource,
  type CarouselVideo,
} from "./video-carousel";
import type { VideoCounts } from "../transport/types";
import {
  VIDEO_HARVEST_DELAY_MAX_MS,
  VIDEO_HARVEST_DELAY_MIN_MS,
  VIDEO_HARVEST_PAGE_CAP,
  VIDEO_HARVEST_VIDEO_CAP,
} from "../shared/constants";

// Deep Scan: harvest every video Amazon will serve for a product, not just the
// handful the widget renders on screen. It replays the video widget's OWN ajax
// endpoint (captured live by the page hook, src/content/page-hook.ts) and pages
// through it, classifying each video as influencer / brand / customer and
// tagging its carousel (upper = brand hero in the image block, lower = the
// related-videos rail). Sequential, jittered, and abortable so the traffic
// reads like a person browsing, exactly like the storefront and order scans.
//
// Pagination shape is Amazon-specific and pinned during live verification. Two
// forms are handled: a next-page token echoed in the response, and an
// offset/page query param. When neither advances (or the endpoint returns the
// whole set in one payload), the "stop when no new videos" guard ends the loop
// safely, so a wrong param guess degrades to a single fetch rather than looping.

export type HarvestProgress = { videos: number; pages: number };

export type VideoHarvestResult = {
  // Combined classified breakdown across every carousel.
  counts: VideoCounts;
  // Split for the competitor-style upper/lower display.
  upper: VideoCounts;
  lower: VideoCounts;
  videos: CarouselVideo[];
  // The image-block #videoCount, Amazon's own "total videos" figure.
  headerTotal: number | null;
  pages: number;
  // A cap tripped (page or video), so this is a floor, not the whole set.
  capped: boolean;
  // We never got past the first response for any endpoint: Deep Scan re-read
  // what was already there rather than crawling more. Surfaced honestly.
  singlePayload: boolean;
};

// Base only matters when a captured URL is relative; the real host comes from
// the captured absolute URL. Avoids depending on `location` (so this is unit
// testable) while staying correct for amazon.* marketplaces.
const URL_BASE = "https://www.amazon.com";

const TOKEN_PARAMS = ["pageToken", "nextPageToken", "paginationToken", "token"];
const OFFSET_PARAMS = ["offset", "startIndex", "start", "skip"];
const PAGE_PARAMS = ["page", "pageNumber", "pageNum"];

const NEXT_TOKEN_RE =
  /"(?:nextPageToken|nextToken|paginationToken)"\s*:\s*"((?:[^"\\]|\\.){1,400}?)"/;

export async function harvestVideos(
  endpoints: string[],
  seed: CarouselResult,
  headerTotal: number | null,
  onProgress: (progress: HarvestProgress) => void,
  signal: AbortSignal,
): Promise<VideoHarvestResult> {
  const videos: CarouselVideo[] = [];
  const seen = new Set<string>();

  const addVideos = (incoming: CarouselVideo[]): number => {
    let added = 0;
    for (const v of incoming) {
      const key = videoKey(v);
      if (seen.has(key)) continue;
      seen.add(key);
      videos.push(v);
      added += 1;
    }
    return added;
  };

  // Start from whatever the passive pass already classified, then extend it.
  addVideos(seed.videos);

  let pages = 0;
  let capped = false;
  let singlePayload = true;

  outer: for (const endpoint of [...new Set(endpoints)].filter(Boolean)) {
    const source = carouselSourceFor(endpoint);
    let token: string | null = null;
    let pageIndex = 0;

    for (;;) {
      if (signal.aborted) break outer;
      if (pages >= VIDEO_HARVEST_PAGE_CAP || videos.length >= VIDEO_HARVEST_VIDEO_CAP) {
        capped = true;
        break outer;
      }
      // Amazon says there are `headerTotal` videos; once we have that many
      // classified there is nothing left to fetch.
      if (headerTotal !== null && videos.length >= headerTotal) break outer;

      const url = pageUrl(endpoint, pageIndex, videos.length, token);
      const text = await fetchText(url, signal);
      pages += 1;
      if (!text) break; // this endpoint is dead; move on to the next one

      const parsed = extractFromText(text, source);
      const added = parsed ? addVideos(parsed.videos) : 0;
      onProgress({ videos: videos.length, pages });

      const nextToken = readNextToken(text);
      if (pageIndex > 0 && added > 0) singlePayload = false;

      // Stop when the page brought nothing new and offers no next token: this
      // is both the single-payload case and the natural end of pagination.
      if (added === 0 && !nextToken) break;
      // A repeated token means the server is not actually advancing; bail out
      // rather than loop forever.
      if (nextToken && nextToken === token) break;

      token = nextToken;
      pageIndex += 1;
      await pace(signal);
    }
  }

  return {
    counts: countBySource(videos, null),
    upper: countBySource(videos, "upper"),
    lower: countBySource(videos, "lower"),
    videos,
    headerTotal,
    pages,
    capped,
    singlePayload,
  };
}

// A video's identity for dedupe across pages and against the seed. Same video
// re-served on the next page (or already captured passively) collapses to one.
function videoKey(v: CarouselVideo): string {
  return [
    v.carousel,
    v.creatorType,
    (v.title ?? "").toLowerCase().trim(),
    (v.creatorName ?? "").toLowerCase().trim(),
    v.url ?? "",
  ].join("|");
}

// Build the URL for a given page. The first request is always the exact URL the
// widget used; later pages set a token or advance an offset/page param.
function pageUrl(base: string, pageIndex: number, offset: number, token: string | null): string {
  if (pageIndex === 0 && !token) return base;
  let u: URL;
  try {
    u = new URL(base, URL_BASE);
  } catch {
    return base;
  }
  if (token) {
    const existing = TOKEN_PARAMS.find((p) => u.searchParams.has(p));
    u.searchParams.set(existing ?? "pageToken", token);
    return u.toString();
  }
  const offsetParam = OFFSET_PARAMS.find((p) => u.searchParams.has(p));
  if (offsetParam) {
    u.searchParams.set(offsetParam, String(offset));
    return u.toString();
  }
  const pageParam = PAGE_PARAMS.find((p) => u.searchParams.has(p));
  if (pageParam) {
    u.searchParams.set(pageParam, String(pageIndex + 1));
    return u.toString();
  }
  // No recognizable pagination param: best-effort offset. If Amazon ignores it,
  // the response repeats and the "no new videos" guard stops us after one page.
  u.searchParams.set("offset", String(offset));
  return u.toString();
}

function readNextToken(text: string): string | null {
  const match = text.match(NEXT_TOKEN_RE);
  return match && match[1] ? match[1] : null;
}

// source === null totals every carousel; otherwise only that carousel.
function countBySource(videos: CarouselVideo[], source: CarouselSource | null): VideoCounts {
  const counts: VideoCounts = { total: 0, influencer: 0, brand: 0, customer: 0, unknown: 0 };
  for (const v of videos) {
    if (source !== null && v.carousel !== source) continue;
    counts[v.creatorType] += 1;
    counts.total += 1;
  }
  return counts;
}

async function fetchText(url: string, signal: AbortSignal): Promise<string | null> {
  signal.throwIfAborted();
  try {
    const res = await fetch(url, {
      credentials: "include",
      headers: { accept: "text/html,application/json,*/*", "x-requested-with": "XMLHttpRequest" },
      signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function pace(signal: AbortSignal): Promise<void> {
  const ms =
    VIDEO_HARVEST_DELAY_MIN_MS +
    Math.random() * (VIDEO_HARVEST_DELAY_MAX_MS - VIDEO_HARVEST_DELAY_MIN_MS);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
