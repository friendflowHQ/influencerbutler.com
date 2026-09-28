import type { CardPlacement } from "../../amazon/my-video-card";
import type {
  CarouselBreakdown,
  CarouselSource,
  CarouselVideo,
} from "../../amazon/video-carousel";
import { normalizeOwnId, type OwnVideoIndex } from "./own-videos";

// Decide which videos on this listing are the creator's own, and which carousel
// each one is in. Pure: no DOM, no storage, no chrome API, so the rules below
// are unit-testable and the honesty guarantees are enforced in one place.
//
// The two claims are separate and have different evidence bars:
//
//   PRESENCE ("your video is on this listing") can come from a content-id match
//   against the creator's own remembered ids, or from their storefront handle
//   appearing on a rendered card.
//
//   PLACEMENT ("it is in the upper carousel") can ONLY come from the rendered
//   card, or from a carousel row whose side was read from a real marker. A row
//   from the state-script `videos` list carries sideFrom "assumed": its side was
//   inferred from the content-id namespace (every influencer video is called
//   "lower"), which is fine for a tally and wrong for one specific video. Those
//   rows produce a presence line with no carousel named.
//
// When nothing matches we return "silent" rather than a negative: we cannot know
// that a creator has no video here (they may never have opened Creator Hub, the
// rail may not have hydrated), so we never say so.

export type SideEvidence = "card" | "marker" | "assumed" | "none";
export type IdEvidence = "handle-card" | "content-id";

export type MyVideoMatch = {
  // The carousel row this matched, when one did. Null for a card-only match on
  // a rail whose payload we never parsed.
  video: CarouselVideo | null;
  contentId: string | null;
  title: string | null;
  // Only ever stated to the user when sideEvidence is "card" or "marker".
  carousel: CarouselSource;
  position: number | null;
  railSize: number | null;
  // The badge mount point, when the card pass found the rendered card.
  card: HTMLElement | null;
  sideEvidence: SideEvidence;
  idEvidence: IdEvidence;
};

export type MyVideoVerdict = { kind: "silent" } | { kind: "present"; matches: MyVideoMatch[] };

const SILENT: MyVideoVerdict = { kind: "silent" };

// Whether a match's carousel may be shown to the user.
export function sideIsStateable(match: MyVideoMatch): boolean {
  return (
    (match.sideEvidence === "card" || match.sideEvidence === "marker") &&
    match.carousel !== "unknown"
  );
}

export function resolveMyVideos(
  videos: CarouselVideo[],
  own: OwnVideoIndex | null,
  cardPlacements: CardPlacement[],
  sides: CarouselBreakdown,
): MyVideoVerdict {
  if (!own || !own.usable) return SILENT;

  const rows = Array.isArray(videos) ? videos : [];
  const byId = new Map<string, CarouselVideo>();
  for (const video of rows) {
    for (const id of videoIds(video)) {
      if (!byId.has(id)) byId.set(id, video);
    }
  }

  const matches: MyVideoMatch[] = [];
  const claimed = new Set<string>();

  // 1. Rendered cards carrying the creator's own storefront handle. By
  // construction these are theirs, and the card's position in the page gives
  // the only placement we are willing to state.
  for (const placement of cardPlacements ?? []) {
    const id = normalizeOwnId(placement.contentId);
    const video = id ? byId.get(id) ?? null : null;
    if (id) claimed.add(id);
    matches.push({
      video,
      contentId: id,
      title: video?.title ?? (id ? own.byContentId.get(id)?.title ?? null : null),
      carousel: placement.carousel,
      position: placement.position,
      railSize: placement.railSize,
      card: placement.el,
      sideEvidence: placement.carousel === "unknown" ? "none" : "card",
      idEvidence: "handle-card",
    });
  }

  // 2. Carousel rows whose content id is one of the creator's own. Presence is
  // certain; the side is only carried over when the row read it from a marker.
  for (const video of rows) {
    for (const id of videoIds(video)) {
      if (claimed.has(id) || !own.byContentId.has(id)) continue;
      claimed.add(id);
      const fromMarker = video.sideFrom === "marker" && video.carousel !== "unknown";
      matches.push({
        video,
        contentId: id,
        title: video.title ?? own.byContentId.get(id)?.title ?? null,
        carousel: fromMarker ? video.carousel : "unknown",
        position: fromMarker ? video.position : null,
        railSize: fromMarker ? railSizeFor(video.carousel, sides) : null,
        card: null,
        sideEvidence: fromMarker ? "marker" : "assumed",
        idEvidence: "content-id",
      });
      break; // one match per row, whichever of its ids hit first
    }
  }

  if (matches.length === 0) return SILENT;
  // Upper first: it is the placement that earns, so it leads the readout.
  matches.sort((a, b) => sideRank(a.carousel) - sideRank(b.carousel));
  return { kind: "present", matches };
}

// Does a match refer to this carousel row? Used by the panel to mark the row in
// the influencer list without re-running the resolver.
export function matchesVideo(match: MyVideoMatch, video: CarouselVideo): boolean {
  if (match.video === video) return true;
  if (!match.contentId) return false;
  return videoIds(video).includes(match.contentId);
}

// Every id spelling a carousel row can be joined on: its Amazon content id, and
// the video-detail id in its URL.
function videoIds(video: CarouselVideo): string[] {
  const ids = [normalizeOwnId(video?.contentId), normalizeOwnId(video?.url)];
  return [...new Set(ids.filter((id): id is string => !!id))];
}

function railSizeFor(carousel: CarouselSource, sides: CarouselBreakdown): number | null {
  if (carousel === "upper") return sides?.upper?.total ?? null;
  if (carousel === "lower") return sides?.lower?.total ?? null;
  return null;
}

function sideRank(carousel: CarouselSource): number {
  if (carousel === "upper") return 0;
  if (carousel === "lower") return 1;
  return 2;
}
