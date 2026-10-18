import type { SearchTile } from "../amazon/search-results";
import { TARGET_TCIN_RE } from "../shared/retailer";
import { targetProductUrl } from "./redsky";

// Target's search / category equivalent of walmart/search-results. Returns the
// SAME SearchTile shape so the shared search overlay consumes it unchanged.
//
// Verified live 2026-10-18 on target.com/s?searchTerm=cereal (60 tiles, 30
// rendered at a time) in a real Chrome session. The result grid renders each
// product as a flat sibling card:
//   [data-test="ListingPageProductListing"]   the card AND the reorderable grid cell
//     data-focusid="<tcin>_product_card"      the tcin (no need to parse a url)
//     a[data-test="assets"][aria-label]       the title (+ a trailing " Sponsored")
//     [data-test="text-quill"]                the first one starting with "$" is the
//                                             price block: "$5.29", "$4.99 - $24.99",
//                                             or "$3.29 was $3.49"
//     [data-test="rating-stars"][aria-label]  "Average customer rating is 4.8 out of
//                                             5 stars with 7680 reviews."
// Category landing pages (/c/...) and the home page use carousels
// ([data-test="item-card-<tcin>"]) instead; those have no listing cards, so the
// parser returns nothing there and the overlay stays unmounted. Only search and
// leaf category listing pages render the grid above.

const CARD_SEL = '[data-test="ListingPageProductListing"]';
const FOCUS_RE = /^(\d{7,10})_product_card$/;
const PRICE_RE = /\$\s?([\d,]+(?:\.\d{2})?)/;
const WAS_RE = /(?<![a-z])(?:was|reg\.?)\s*\$\s?([\d,]+(?:\.\d{2})?)/i;
const RATING_RE = /([\d.]+)\s*out of\s*5/i;
const RATING_COUNT_RE = /with\s+([\d,]+)\s+(?:rating|review)/i;

// Pure parsers (exported for tests).

// The first dollar amount in the text, as cents. A price range ("$19.99 - $29.99")
// reads as its low end.
export function parseTargetPriceCents(text: string): number | null {
  const m = text.match(PRICE_RE);
  if (!m || !m[1]) return null;
  const value = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

// The prior ("was" / "reg.") price out of a price block such as "$3.29 was $3.49"
// (Target glues the pieces, so the spaces may be missing).
export function parseTargetWasPriceCents(text: string): number | null {
  const m = text.match(WAS_RE);
  if (!m || !m[1]) return null;
  return parseTargetPriceCents(`$${m[1]}`);
}

export function parseTargetRating(text: string): number | null {
  const m = text.match(RATING_RE);
  if (!m || !m[1]) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) && v >= 0 && v <= 5 ? v : null;
}

export function parseTargetReviewCount(text: string): number | null {
  const m = text.match(RATING_COUNT_RE) ?? text.match(/\(([\d,]+)\)/);
  if (!m || !m[1]) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

// The tcin out of a card's data-focusid ("81875472_product_card").
export function tcinFromFocusId(focusId: string): string | null {
  const tcin = focusId.match(FOCUS_RE)?.[1];
  return tcin && TARGET_TCIN_RE.test(tcin) ? tcin : null;
}

// The tcin out of a product link (/p/<slug>/-/A-<tcin>).
export function tcinFromHref(href: string): string | null {
  const tcin = href.match(/\/-\/A-(\d{7,10})(?:[/?#]|$)/)?.[1];
  return tcin && TARGET_TCIN_RE.test(tcin) ? tcin : null;
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

// The price block: the first text-quill whose text begins with a dollar amount.
function priceBlock(card: HTMLElement): HTMLElement | null {
  for (const q of Array.from(card.querySelectorAll<HTMLElement>('[data-test="text-quill"]'))) {
    if (/^\s*\$/.test(q.textContent ?? "")) return q;
  }
  return null;
}

// "New lower price" is Target's markdown pill; "Clearance" / "Sale" are matched
// only as a short element's whole text so a product title is never mistaken.
function extractDealBadge(card: HTMLElement): "clearance" | "reduced" | null {
  if (/\bnew lower price\b/i.test(card.textContent ?? "")) return "reduced";
  for (const n of Array.from(card.querySelectorAll<HTMLElement>("span,div,p"))) {
    const txt = (n.textContent ?? "").trim();
    if (txt.length > 16) continue;
    if (/^clearance$/i.test(txt)) return "clearance";
    if (/^sale$/i.test(txt)) return "reduced";
  }
  return null;
}

// Read the rendered Target product cards.
export function parseSearchTiles(root: ParentNode): SearchTile[] {
  const tiles: SearchTile[] = [];
  const seen = new Set<string>();
  for (const card of Array.from(root.querySelectorAll<HTMLElement>(CARD_SEL))) {
    const tcin = tcinFromFocusId(card.getAttribute("data-focusid") ?? "");
    if (!tcin || seen.has(tcin)) continue;
    // A card with no price block is still hydrating or out of stock; skip it
    // rather than score an empty tile.
    const block = priceBlock(card);
    if (!block) continue;
    seen.add(tcin);
    const blockText = textOf(block);
    const ratingEl = card.querySelector<HTMLElement>('[data-test="rating-stars"]');
    const ratingText = ratingEl?.getAttribute("aria-label") ?? textOf(ratingEl);
    const priceCents = parseTargetPriceCents(blockText);
    const wasCents = parseTargetWasPriceCents(blockText);
    const assetLabel = card.querySelector('a[data-test="assets"]')?.getAttribute("aria-label") ?? "";
    tiles.push({
      asin: tcin,
      title: assetLabel.replace(/\s+Sponsored$/, "").trim() || null,
      priceCents,
      currency: "USD",
      imageUrl: card.querySelector<HTMLImageElement>("img")?.getAttribute("src") ?? null,
      href: targetProductUrl(tcin),
      sponsored: /\bsponsored\b/i.test(card.textContent ?? ""),
      boughtPastMonth: null,
      rating: parseTargetRating(ratingText),
      reviewCount: parseTargetReviewCount(ratingText),
      hasCoupon: false,
      wasPriceCents: wasCents != null && priceCents != null && wasCents > priceCents ? wasCents : null,
      dealBadge: extractDealBadge(card),
      // The card is itself a direct child of the results grid, so the shared
      // overlay can sort and hide it in place.
      el: card,
    });
  }
  return tiles;
}
