import { query, queryAll } from "./selectors";
import { parsePriceText } from "./search-results";
import { marketplaceFromUrl } from "./product-signals";
import { asinFromDpHref } from "./brand-store";

// Reads the product tiles off an Amazon discovery page: Best Sellers
// (/gp/bestsellers, .../zgbs/...), New Releases (/gp/new-releases), and Movers &
// Shakers (/gp/movers-and-shakers). These share the p13n grid, so one parser
// covers all three. Each tile keeps the fields Trend Radar needs to score and
// rank it, plus two discovery-only signals: the absolute Best Sellers rank
// ("#N") and, on Movers & Shakers, the 24h sales-rank gain percent. The tile
// element is kept so the overlay can badge it and reorder it in place.

export type DiscoveryTile = {
  asin: string;
  title: string | null;
  priceCents: number | null;
  currency: string;
  imageUrl: string | null;
  href: string | null;
  // Absolute Best Sellers rank on this page (1 = top), or null when the tile
  // shows no rank badge (some Movers layouts omit it).
  rank: number | null;
  // 24h sales-rank gain percent on Movers & Shakers (for example 1234 for
  // "1,234%"), or null on Best Sellers / New Releases, which have no gainer.
  gainPct: number | null;
  el: HTMLElement;
};

// Movers & Shakers is a rank list; where a page lists no explicit rank badge,
// DOM order is the rank. So the parser also returns the ordinal, letting the
// overlay fall back to it when `rank` is null.
export function parseDiscoveryTiles(root: ParentNode, url: string): DiscoveryTile[] {
  const marketplace = marketplaceFromUrl(url);
  const tiles: DiscoveryTile[] = [];
  const seen = new Set<string>();
  let ordinal = 0;
  for (const el of queryAll<HTMLElement>(root, "discoveryTile")) {
    const asin = firstAsin(el);
    if (!asin || seen.has(asin)) continue;
    seen.add(asin);
    ordinal += 1;
    const img = query<HTMLImageElement>(el, "discoveryTileImage");
    tiles.push({
      asin,
      title: tileTitle(el, img),
      ...extractPrice(el),
      imageUrl: img?.getAttribute("src") ?? null,
      href: `https://www.${marketplace}/dp/${asin}`,
      rank: parseRankBadge(cleanText(query(el, "discoveryRankBadge")?.textContent)) ?? ordinal,
      gainPct: parseGainPercent(cleanText(query(el, "discoveryGainPct")?.textContent)),
      el,
    });
  }
  return tiles;
}

function firstAsin(el: HTMLElement): string | null {
  for (const a of queryAll<HTMLAnchorElement>(el, "discoveryTileLink")) {
    const asin = asinFromDpHref(a.getAttribute("href"));
    if (asin) return asin;
  }
  return null;
}

function tileTitle(el: HTMLElement, img: HTMLImageElement | null): string | null {
  // The line-clamp element is the on-tile title; the image alt is a reliable
  // fallback because p13n faceouts set it to the full product name.
  const clamp = cleanText(query(el, "discoveryTileTitle")?.textContent);
  if (clamp) return clamp;
  return cleanText(img?.getAttribute("alt")) ?? null;
}

function extractPrice(el: HTMLElement): { priceCents: number | null; currency: string } {
  return parsePriceText(cleanText(query(el, "discoveryTilePrice")?.textContent) ?? "");
}

// Pure parsers (exported for tests).

const RANK_RE = /#?\s*([\d,]+)/;

// "#1" / "#1,234" -> the number; null when there is no leading rank.
export function parseRankBadge(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(RANK_RE);
  if (!match || !match[1]) return null;
  const value = parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const GAIN_RE = /([\d,]+)\s*%/;

// "1,234%" -> 1234; null when there is no percent. Ignores a trailing sign so
// both "+120%" and "120%" read the same.
export function parseGainPercent(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(GAIN_RE);
  if (!match || !match[1]) return null;
  const value = parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function cleanText(text: string | null | undefined): string | undefined {
  const cleaned = text?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : undefined;
}
