import { closest } from "./selectors";
import type { CarouselSource } from "./video-carousel";

// Find the creator's OWN video cards in the rendered /dp/ carousels by their
// storefront link, and report which rail each one sits in.
//
// This is the ONLY trustworthy source of an "upper carousel" verdict we have.
// The state-script `videos` list (the only extraction path that carries content
// ids) derives a video's side from its id namespace, so every influencer video
// it produces is labelled "lower" by assumption: see the comment on
// `sideFrom` in video-carousel.ts. Matching a content id therefore proves the
// video is on the listing, never where. Reading the rendered card does both,
// because the card is physically inside one rail or the other.
//
// Verified live on amazon.com 2026-09-23 against the 2026 "vse hero" layout:
// the lower rail classified correctly, and the creator's avatar link and name
// link collapsed to one card. Two things that live pass taught this file:
//
//  - Amazon puts its own `/shop/info` disclosure link ("Earns commissions") in
//    the same profile row as the creator, and another one in the image block.
//    It is not a creator link and must be excluded everywhere, or the climb
//    below stops immediately and the "which rail" answer is read off an <a>.
//  - That layout mounts ONE creator at a time (the playing video) with the rest
//    of the rail still skeleton placeholders, so position and rail size are
//    frequently unavailable. That is reported as null and the UI states the rail
//    without a rank, which is the honest answer rather than "#1 of 1".
//
// The upper (image-block) case is the part still awaiting live confirmation, on
// a listing where a creator video sits next to the gallery. Every unrecognized
// shape degrades to "unknown", which the UI renders as "we could not read which
// carousel", never as a guess.

export type CardPlacement = {
  // The card container. Also the mount point for the "Yours" badge, so the
  // badge can only ever land on a card carrying the creator's own handle.
  el: HTMLElement;
  carousel: CarouselSource;
  // 1-based rank among sibling cards in the same rail; null when the card's
  // siblings could not be identified.
  position: number | null;
  railSize: number | null;
  // The card's own `/vdp/<id>`, when it exposes one. Used to join the card to
  // the carousel row for a title, never to establish identity (the handle
  // already did that).
  contentId: string | null;
};

// The brand hero / image gallery region. Amazon has shipped several of these
// over the years, so match generously: a false "upper" is impossible here
// because the lower-rail check runs first and wins.
const UPPER_CONTAINERS = [
  "#imageBlock",
  "#imageBlock_feature_div",
  "#imageBlockContainer",
  "#main-image-container",
  "#altImages",
  "#heroQuickViewContainer",
  "[cel_widget_id*='imageBlock']",
].join(", ");

const VDP_RE = /\/vdp\/([A-Za-z0-9]{6,})/;
// A card's siblings in a rail: Amazon's carousel items, plus the hashed
// CSS-module wrappers the 2026 vse layout uses.
const CARD_SIBLING_SELECTOR = "li.a-carousel-card, [class*='vseProfileContent'], [class*='vseHeroThumbnail']";
// Amazon's own "Earns commissions" disclosure points at /shop/info. It is not a
// creator, and counting it as one breaks the card climb.
const NOT_A_CREATOR = new Set(["info"]);
// A card container has to be at least this big in both directions to be the
// video card rather than the profile strip inside it. Same threshold and reason
// as cardFor() in tools/video-likes/overlay.ts.
const CARD_MIN_PX = 140;

export function readOwnCardPlacements(doc: Document, handle: string): CardPlacement[] {
  const wanted = String(handle ?? "").trim().toLowerCase();
  if (!wanted) return [];

  const out: CardPlacement[] = [];
  const seen = new Set<HTMLElement>();

  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href*="/shop/"]'))) {
    if (!linkPointsAt(a.getAttribute("href"), wanted)) continue;
    const card = cardContainer(a);
    if (!card || seen.has(card)) continue;
    seen.add(card);

    const carousel = railOf(card);
    const { position, railSize } = rankInRail(card);
    out.push({
      el: card,
      carousel,
      position,
      railSize,
      contentId: contentIdIn(card),
    });
  }
  return out;
}

// The creator handle a /shop/ link points at, or null when it is not a creator
// link at all. Case-insensitive, query and fragment stripped, so "/shop/lizdean"
// never matches "/shop/lizdeanstyle".
function handleOf(href: string | null): string | null {
  const seg = String(href ?? "").match(/\/shop\/([^/?#]+)/)?.[1];
  if (!seg) return null;
  const handle = decodeURIComponent(seg).trim().toLowerCase();
  return handle && !NOT_A_CREATOR.has(handle) ? handle : null;
}

function linkPointsAt(href: string | null, wanted: string): boolean {
  return handleOf(href) === wanted;
}

// Climb from the creator link to the card that owns it, and stop before the
// climb can widen to cover a second creator, so a badge can never land on
// somebody else's video.
//
// Two stop conditions, because neither alone is enough. Size alone would walk
// past a small card into the rail; the "more than one creator" test alone walks
// all the way to the widget when only one creator is mounted. So: bail as soon
// as an ancestor holds a second creator, and otherwise take the first ancestor
// big enough to be a card. Live-checked: from the avatar link this lands on the
// 628x416 player wrapper, not the 370x72 profile strip inside it.
function cardContainer(seed: HTMLElement): HTMLElement {
  let fallback: HTMLElement = seed;
  let node: HTMLElement | null = seed.parentElement;
  for (let i = 0; i < 8 && node; i += 1) {
    if (distinctCreators(node) > 1) break;
    if (node.offsetWidth >= CARD_MIN_PX && node.offsetHeight >= CARD_MIN_PX) return node;
    fallback = node;
    node = node.parentElement;
  }
  return fallback;
}

function distinctCreators(scope: HTMLElement): number {
  const handles = new Set<string>();
  for (const a of Array.from(scope.querySelectorAll<HTMLAnchorElement>('a[href*="/shop/"]'))) {
    const handle = handleOf(a.getAttribute("href"));
    if (handle) handles.add(handle);
  }
  return handles.size;
}

// Which rail the card sits in. The lower rail (the "Videos for this product"
// widget) is checked first and wins, because its widget can itself live inside
// a broadly-matched image-block ancestor on some layouts.
function railOf(card: HTMLElement): CarouselSource {
  // closest() walks the registry's fallback list and honors remote selector
  // overrides, so a layout change can be patched without a release.
  if (closest(card, "videoWidget")) return "lower";
  return card.closest(UPPER_CONTAINERS) ? "upper" : "unknown";
}

// The card's 1-based rank among its siblings in the same rail, and how many
// cards that rail is showing. Both null when the card is not one of a set of
// recognizable siblings (a hero player mounted on its own, say), in which case
// the UI states the rail without a position rather than inventing "#1 of 1".
function rankInRail(card: HTMLElement): { position: number | null; railSize: number | null } {
  const item = card.closest<HTMLElement>(CARD_SIBLING_SELECTOR) ?? card;
  const parent = item.parentElement;
  if (!parent) return { position: null, railSize: null };
  const siblings = Array.from(parent.children).filter(
    (c) => (c as HTMLElement).matches?.(CARD_SIBLING_SELECTOR) && isLoadedCard(c as HTMLElement),
  );
  const idx = siblings.indexOf(item);
  if (idx < 0 || siblings.length < 2) return { position: null, railSize: null };
  return { position: idx + 1, railSize: siblings.length };
}

// Amazon renders the un-hydrated rest of a rail as skeleton placeholders. They
// are the same shape as a card and would inflate the "of N", so a sibling only
// counts once it carries a real creator or video link.
function isLoadedCard(el: HTMLElement): boolean {
  if (el.querySelector('a[href*="/vdp/"]')) return true;
  return distinctCreators(el) > 0;
}

function contentIdIn(card: HTMLElement): string | null {
  for (const a of Array.from(card.querySelectorAll<HTMLAnchorElement>('a[href*="/vdp/"]'))) {
    const id = (a.getAttribute("href") ?? "").match(VDP_RE)?.[1];
    if (id) return id.toLowerCase();
  }
  const self = (card.getAttribute("href") ?? "").match(VDP_RE)?.[1];
  return self ? self.toLowerCase() : null;
}
