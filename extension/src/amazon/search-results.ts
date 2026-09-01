import { query, queryAll, queryMatchingText } from "./selectors";
import { marketplaceFromUrl } from "./product-signals";
import { parseBoughtFromBody } from "./bought-badge";

// Reads the product tiles off an Amazon search-results page (/s?k=...). Each
// tile keeps the fields the search overlay needs to score and sort: identity,
// price, image, whether it is a sponsored placement, and the "bought in past
// month" social proof when Amazon shows it on the card. The tile element is
// kept so the overlay can inject a badge and reorder it in place.

export type SearchTile = {
  asin: string;
  title: string | null;
  priceCents: number | null;
  currency: string;
  imageUrl: string | null;
  href: string | null;
  sponsored: boolean;
  boughtPastMonth: number | null;
  rating: number | null;
  reviewCount: number | null;
  hasCoupon: boolean;
  // The prior ("was") price, when the tile shows a strikethrough reference
  // price, so a deal signal can compute how deep the discount is. Optional so
  // retailers that do not surface it (Amazon tiles today) simply omit it.
  wasPriceCents?: number | null;
  // A reduced-price badge on the tile ("rollback" / "clearance" / "reduced"),
  // when present. Walmart's native deal markers; absent on Amazon tiles.
  dealBadge?: "rollback" | "clearance" | "reduced" | null;
  el: HTMLElement;
};

const PRICE_RE = /([$€£])\s*([\d,]+)(?:\.(\d{2}))?/;
// "4.3 out of 5 stars" (en), "4,3 de 5 estrellas" (es), "4,3 sur 5 etoiles"
// (fr), "4,3 von 5 Sternen" (de). A bare leading "4.3" is accepted as a last
// resort because the icon alt text always leads with the value.
const RATING_RE = /([\d]+[.,]\d)\s*(?:out of|de|sur|von)\s*5/;
const RATING_BARE_RE = /^([\d]+[.,]\d)\b/;
// "(4.9K)", "(123)", "1,234", "4,9 k" - the count sits alone in its span.
const REVIEW_COUNT_RE = /^\(?\s*([\d][\d,.\s]*)\s*([Kk])?\s*\)?$/;

export function parseSearchTiles(root: ParentNode, url: string): SearchTile[] {
  const marketplace = marketplaceFromUrl(url);
  const tiles: SearchTile[] = [];
  const seen = new Set<string>();
  for (const el of queryAll<HTMLElement>(root, "searchResultTile")) {
    const asin = (el.getAttribute("data-asin") ?? "").trim().toUpperCase();
    // Amazon pads the grid with empty data-asin decoys and repeats an ASIN
    // across an ad and its organic row; keep the first real one only.
    if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) continue;
    seen.add(asin);
    tiles.push({
      asin,
      title: cleanText(query(el, "searchTileTitle")?.textContent) ?? null,
      ...extractPrice(el),
      imageUrl: query<HTMLImageElement>(el, "searchTileImage")?.getAttribute("src") ?? null,
      href: hrefFor(el, asin, marketplace),
      sponsored: query(el, "searchTileSponsored") !== null,
      boughtPastMonth: extractBought(el, marketplace),
      rating: extractRating(el),
      reviewCount: extractReviewCount(el),
      hasCoupon: query(el, "searchTileCoupon") !== null,
      el,
    });
  }
  return tiles;
}

function hrefFor(el: HTMLElement, asin: string, marketplace: string): string {
  const raw = query<HTMLAnchorElement>(el, "searchTileLink")?.getAttribute("href");
  if (raw) {
    try {
      return new URL(raw, `https://www.${marketplace}`).toString();
    } catch {
      // fall through to a constructed link
    }
  }
  return `https://www.${marketplace}/dp/${asin}`;
}

function extractPrice(el: HTMLElement): { priceCents: number | null; currency: string } {
  return parsePriceText(cleanText(query(el, "searchTilePrice")?.textContent) ?? "");
}

function extractBought(el: HTMLElement, marketplace: string): number | null {
  return parseBoughtFromBody(el.textContent ?? "", marketplace);
}

function extractRating(el: HTMLElement): number | null {
  // The star icon's alt class also decorates other icons on the tile, so keep
  // scanning matches until one parses as a rating instead of trusting the
  // first hit.
  const text = queryMatchingText(el, "searchTileRating", (t) => parseRatingText(t) !== null);
  return text ? parseRatingText(text) : null;
}

function extractReviewCount(el: HTMLElement): number | null {
  const text = queryMatchingText(
    el,
    "searchTileReviewCount",
    (t) => parseReviewCountText(t) !== null,
  );
  return text ? parseReviewCountText(text) : null;
}

// Pure parsers (exported for tests): the DOM readers above delegate to these so
// the price/social-proof logic can be checked without a document.
export function parsePriceText(text: string): { priceCents: number | null; currency: string } {
  const match = text.match(PRICE_RE);
  if (!match || !match[2]) return { priceCents: null, currency: "USD" };
  const whole = parseInt(match[2].replace(/,/g, ""), 10);
  const cents = match[3] ? parseInt(match[3], 10) : 0;
  const currency = match[1] === "€" ? "EUR" : match[1] === "£" ? "GBP" : "USD";
  return { priceCents: whole * 100 + cents, currency };
}

// Kept for callers/tests: reads the "bought in past month" count from a blob of
// tile text via the shared marketplace-aware parser (host unknown -> tries every
// known phrase). See bought-badge.ts for the normalization.
export function parseBoughtText(text: string): number | null {
  return parseBoughtFromBody(text, null);
}

// "4.3 out of 5 stars" / "4,3 de 5 estrellas" / "4,3 sur 5 etoiles" -> 4.3.
// Rejects values outside the 0-5 star range so a stray number never passes as
// a rating.
export function parseRatingText(text: string): number | null {
  const cleaned = text.trim();
  const match = cleaned.match(RATING_RE) ?? cleaned.match(RATING_BARE_RE);
  if (!match || !match[1]) return null;
  const value = parseFloat(match[1].replace(",", "."));
  if (Number.isNaN(value) || value < 0 || value > 5) return null;
  return value;
}

// "(4.9K)" -> 4900, "(123)" -> 123, "1,234" -> 1234, "4,9 k" -> 4900. With a
// K suffix the separator is a decimal point; without one it is a thousands
// separator, so digits are kept as-is.
export function parseReviewCountText(text: string): number | null {
  const match = text.trim().match(REVIEW_COUNT_RE);
  if (!match || !match[1]) return null;
  const raw = match[1].trim();
  if (match[2]) {
    const base = parseFloat(raw.replace(/\s/g, "").replace(",", "."));
    if (Number.isNaN(base)) return null;
    return Math.round(base * 1000);
  }
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  return parseInt(digits, 10);
}

function cleanText(text: string | null | undefined): string | undefined {
  const cleaned = text?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : undefined;
}
