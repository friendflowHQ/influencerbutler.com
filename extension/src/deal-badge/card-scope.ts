import { matchAmazonProductUrl, siteLinkMatcher } from "../tools/deal-harvester/extract";

// Finding the "card" a deal link belongs to, on a site we did not build.
//
// Deal aggregators all render a grid of product cards, but no two agree on the
// markup, so a selector for one of them ages badly and covers only that site.
// The shape they DO share: a card is the biggest box that still owns exactly
// one product link. Climb out of the link and the count stays 1 all the way up
// the card, then jumps the moment you step into the grid. So the card is the
// outermost ancestor whose product-link count is still 1, and the walk needs no
// site-specific knowledge at all.

export const CARD_MAX_DEPTH = 10;
// Below this a "card" is really an inline wrapper (a bare <p>, a zero-height
// span), which would put the chip on top of the text rather than on the card.
export const CARD_MIN_WIDTH = 80;
export const CARD_MIN_HEIGHT = 60;

export type Box = { width: number; height: number };
export type AnchorHit = { anchor: HTMLAnchorElement; asin: string; marketplace: string };

export function isPlausibleCardBox(box: Box): boolean {
  return box.width >= CARD_MIN_WIDTH && box.height >= CARD_MIN_HEIGHT;
}

// Pure: given the product-link counts of an anchor's ancestors, innermost
// first, the index of the outermost one that still owns exactly one link. The
// first count above 1 is the grid, so everything from there up is too big to be
// a card. Returns -1 when even the immediate parent holds more than one link
// (a list of bare links with no card structure at all).
export function pickOutermostSingleOwner(counts: number[]): number {
  let pick = -1;
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] !== 1) break;
    pick = i;
  }
  return pick;
}

// Every Amazon product link currently in the page, in document order. Called on
// each sweep, so it stays cheap: one querySelectorAll plus a regex per href.
export function allProductAnchors(): AnchorHit[] {
  const out: AnchorHit[] = [];
  // Some aggregators never link to the retailer directly: every card goes
  // through their own click-tracked redirect, which still names the product.
  // Those sites register a matcher for their own host.
  const siteMatch = siteLinkMatcher(location.href);
  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const match = matchAmazonProductUrl(anchor.href) ?? siteMatch?.(anchor.href) ?? null;
    if (!match) continue;
    out.push({ anchor, asin: match.asin, marketplace: match.marketplace });
  }
  return out;
}

// One upward walk per anchor, tallying into a shared map. That is O(anchors x
// depth) with zero subtree scans: on a page of ~300 cards the naive version (a
// querySelectorAll per candidate ancestor) would be thousands of full subtree
// scans per sweep, which is the difference between invisible and janky.
export function countProductLinksByAncestor(anchors: HTMLAnchorElement[]): Map<Element, number> {
  const counts = new Map<Element, number>();
  for (const anchor of anchors) {
    let node: HTMLElement | null = anchor.parentElement;
    for (let depth = 0; depth < CARD_MAX_DEPTH && node && node !== document.body; depth += 1) {
      counts.set(node, (counts.get(node) ?? 0) + 1);
      node = node.parentElement;
    }
  }
  return counts;
}

// The element to hang the chip on: the outermost single-owner ancestor that is
// also big enough to read as a card, stepping back inward while it is not.
// Falls back to the anchor itself so a chip always mounts somewhere.
export function resolveCardHost(
  anchor: HTMLAnchorElement,
  counts: Map<Element, number>,
): HTMLElement {
  const chain: HTMLElement[] = [];
  let node: HTMLElement | null = anchor.parentElement;
  for (let depth = 0; depth < CARD_MAX_DEPTH && node && node !== document.body; depth += 1) {
    chain.push(node);
    node = node.parentElement;
  }
  const owned = chain.map((element) => counts.get(element) ?? 0);
  for (let i = pickOutermostSingleOwner(owned); i >= 0; i -= 1) {
    const candidate = chain[i];
    if (candidate && isPlausibleCardBox(candidate.getBoundingClientRect())) return candidate;
  }
  return anchor;
}
