import { query, queryAll } from "./selectors";
import { marketplaceFromUrl } from "./product-signals";

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
  el: HTMLElement;
};

const PRICE_RE = /([$€£])\s*([\d,]+)(?:\.(\d{2}))?/;
const BOUGHT_RE = /([\d,.]+)\s*([Kk])?\+?\s*bought in past month/;

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
      boughtPastMonth: extractBought(el),
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

function extractBought(el: HTMLElement): number | null {
  return parseBoughtText(el.textContent ?? "");
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

export function parseBoughtText(text: string): number | null {
  const match = text.match(BOUGHT_RE);
  if (!match || !match[1]) return null;
  const base = parseFloat(match[1].replace(/,/g, ""));
  if (Number.isNaN(base)) return null;
  return Math.round(match[2] ? base * 1000 : base);
}

function cleanText(text: string | null | undefined): string | undefined {
  const cleaned = text?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : undefined;
}
