import type { CarouselVideo } from "./video-carousel";

// Turns a single-page-load snapshot of a product's videos into the aggregate
// "video landscape" a creator uses to size up the competition: how many
// creators own the carousel, how concentrated it is, the content mix, and the
// strongest placements. Everything here is derivable from ONE snapshot.
//
// The hard rule: never fabricate a metric. Anything that needs a publish date
// (publishing cadence, "new in 30 days") or a duration (typical length) is
// computed only when those fields are actually present on the videos, and the
// caller is told via the hasDates / hasDurations flags so the UI can omit the
// section rather than show an empty chart or a fake zero. Metrics that are
// inherently longitudinal (presence over days, rotation) are NOT computed here
// at all: they belong to the pooled backend passport (Phase 2).

export type LandscapeCreator = {
  // Display name (original casing of the first video we saw for this creator).
  name: string;
  count: number;
  // Bar width relative to the top creator, in [0, 1], for the concentration bars.
  share: number;
};

export type VideoLandscape = {
  // Amazon's own #videoCount when known, else the snapshot size.
  known: number;
  // Videos actually present in this snapshot (every one is currently placed).
  currentlyPlaced: number;

  // Distinct named creators.
  uniqueCreators: number;
  // Video counts by creator class, framed as supply.
  supply: { brand: number; customer: number; creator: number };

  // identified = creators we could name; repeat = creators with >1 video here.
  effective: { identified: number; repeat: number };

  // Creators ranked by video count (capped), plus the top-5 concentration share.
  concentration: LandscapeCreator[];
  top5Share: number;

  // The real creator-class mix (not a fabricated video/livestream/post donut).
  contentMix: { influencer: number; brand: number; customer: number; unknown: number };

  // Top videos ranked by a single-snapshot proxy (carousel side, then Amazon's
  // own payload order). Labelled a proxy in the UI: true carousel strength is
  // longitudinal and lives in the Phase 2 passport.
  topByStrength: CarouselVideo[];

  // Date-gated (present only when hasDates).
  hasDates: boolean;
  datedCount?: number;
  newIn30?: number;
  // 12 monthly buckets, oldest-first, ending on the current month.
  pulse?: number[];
  earliest?: string;

  // Duration-gated (present only when hasDurations).
  hasDurations: boolean;
  durationCount?: number;
  medianSec?: number;
  bandSec?: [number, number];

  // True media-type donut is only possible if the payload exposes a media type.
  // Not parsed today, so always false until that field is verified and added.
  hasMediaType: boolean;
};

const CONCENTRATION_CAP = 25;
const MONTHS = 12;
const DAY_MS = 86_400_000;
// Durations are exposed for only a subset of videos (verified live: often just
// the brand hero videos), so a tiny sample is biased. Hide the whole length
// stat until enough real durations exist rather than show a misleading median.
const MIN_DURATIONS = 4;

export function computeLandscape(
  videos: CarouselVideo[],
  headerTotal: number | null,
  opts: { now?: number } = {},
): VideoLandscape {
  const now = opts.now ?? Date.now();
  const n = videos.length;

  const contentMix = { influencer: 0, brand: 0, customer: 0, unknown: 0 };
  // Preserve first-seen display name per normalized key.
  const displayName = new Map<string, string>();
  const creatorCounts = new Map<string, number>();

  for (const v of videos) {
    contentMix[v.creatorType] += 1;
    const raw = (v.creatorName ?? "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!displayName.has(key)) displayName.set(key, raw);
    creatorCounts.set(key, (creatorCounts.get(key) ?? 0) + 1);
  }

  const uniqueCreators = creatorCounts.size;
  const repeat = [...creatorCounts.values()].filter((c) => c > 1).length;

  const rankedAll = [...creatorCounts.entries()]
    .map(([key, count]) => ({ name: displayName.get(key) ?? key, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const top = rankedAll[0]?.count ?? 0;
  const concentration: LandscapeCreator[] = rankedAll
    .slice(0, CONCENTRATION_CAP)
    .map((c) => ({ name: c.name, count: c.count, share: top > 0 ? c.count / top : 0 }));
  const top5Count = rankedAll.slice(0, 5).reduce((sum, c) => sum + c.count, 0);
  const top5Share = n > 0 ? top5Count / n : 0;

  const topByStrength = rankByStrength(videos);

  const landscape: VideoLandscape = {
    known: headerTotal ?? n,
    currentlyPlaced: n,
    uniqueCreators,
    supply: { brand: contentMix.brand, customer: contentMix.customer, creator: contentMix.influencer },
    effective: { identified: uniqueCreators, repeat },
    concentration,
    top5Share,
    contentMix,
    topByStrength,
    hasDates: false,
    hasDurations: false,
    hasMediaType: false,
  };

  applyDates(landscape, videos, now);
  applyDurations(landscape, videos);

  return landscape;
}

// Single-snapshot proxy for "carousel strength": upper (brand hero / image
// block) outranks lower (related rail), and within a side we trust Amazon's own
// payload order (earlier = stronger). Never presented as the longitudinal
// metric; the UI labels it a proxy.
function rankByStrength(videos: CarouselVideo[]): CarouselVideo[] {
  const sideWeight = (v: CarouselVideo): number =>
    v.carousel === "upper" ? 2 : v.carousel === "lower" ? 1 : 0;
  return videos
    .map((v, index) => ({ v, index }))
    .sort((a, b) => sideWeight(b.v) - sideWeight(a.v) || a.index - b.index)
    .slice(0, 8)
    .map((x) => x.v);
}

function applyDates(landscape: VideoLandscape, videos: CarouselVideo[], now: number): void {
  const dated: number[] = [];
  for (const v of videos) {
    const ts = v.publishedAt ? Date.parse(v.publishedAt) : NaN;
    if (Number.isFinite(ts)) dated.push(ts);
  }
  if (dated.length === 0) return;

  landscape.hasDates = true;
  landscape.datedCount = dated.length;
  landscape.newIn30 = dated.filter((ts) => now - ts <= 30 * DAY_MS).length;
  landscape.earliest = new Date(Math.min(...dated)).toISOString();

  // 12 monthly buckets ending on the current month, oldest-first.
  const pulse = new Array<number>(MONTHS).fill(0);
  const end = new Date(now);
  const endYear = end.getUTCFullYear();
  const endMonth = end.getUTCMonth();
  for (const ts of dated) {
    const d = new Date(ts);
    const monthsAgo = (endYear - d.getUTCFullYear()) * 12 + (endMonth - d.getUTCMonth());
    if (monthsAgo >= 0 && monthsAgo < MONTHS) {
      const idx = MONTHS - 1 - monthsAgo;
      pulse[idx] = (pulse[idx] ?? 0) + 1;
    }
  }
  landscape.pulse = pulse;
}

function applyDurations(landscape: VideoLandscape, videos: CarouselVideo[]): void {
  const durs: number[] = [];
  for (const v of videos) {
    const d = v.durationSec;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) durs.push(d);
  }
  if (durs.length < MIN_DURATIONS) return;

  durs.sort((a, b) => a - b);
  landscape.hasDurations = true;
  landscape.durationCount = durs.length;
  landscape.medianSec = percentile(durs, 0.5);
  landscape.bandSec = [percentile(durs, 0.25), percentile(durs, 0.75)];
}

// Nearest-rank percentile on an already-sorted ascending array.
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(p * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? 0;
}
