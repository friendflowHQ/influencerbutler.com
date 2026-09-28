import { query, queryAll } from "./selectors";
import { parsePriceText } from "./search-results";
import { marketplaceFromUrl } from "./product-signals";

// Reads the product tiles off a brand's storefront page (/stores/<Brand>/
// page/<id>). The store is a React app with hashed CSS-module class names, so
// everything keys off data-testid (see the store* ids in selectors.ts). Each
// tile keeps the fields the store overlay needs to score it plus the element
// itself so the overlay can inject a badge and outline the best candidates.

export type StoreTile = {
  asin: string;
  title: string | null;
  priceCents: number | null;
  currency: string;
  imageUrl: string | null;
  href: string | null;
  el: HTMLElement;
};

const DP_ASIN_RE = /\/dp\/([A-Z0-9]{10})(?=[/?]|$)/;

// Pure (exported for tests): the ASIN in a /dp/ href, or null.
export function asinFromDpHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const match = href.match(DP_ASIN_RE);
  return match && match[1] ? match[1].toUpperCase() : null;
}

export function parseStoreTiles(root: ParentNode, url: string): StoreTile[] {
  const marketplace = marketplaceFromUrl(url);
  const tiles: StoreTile[] = [];
  const seen = new Set<string>();
  for (const el of queryAll<HTMLElement>(root, "storeGridTile")) {
    // Editorial and media tiles have no product link; the product tiles carry
    // one or more anchors (overlay + quick look) that all target the same /dp/.
    const asin = firstAsin(el);
    if (!asin || seen.has(asin)) continue;
    seen.add(asin);
    tiles.push({
      asin,
      title: cleanText(query(el, "storeTileTitle")?.textContent) ?? null,
      ...extractPrice(el),
      imageUrl: query<HTMLImageElement>(el, "storeTileImage")?.getAttribute("src") ?? null,
      href: `https://www.${marketplace}/dp/${asin}`,
      el,
    });
  }
  return tiles;
}

function firstAsin(el: HTMLElement): string | null {
  for (const a of queryAll<HTMLAnchorElement>(el, "storeTileLink")) {
    const asin = asinFromDpHref(a.getAttribute("href"));
    if (asin) return asin;
  }
  return null;
}

function extractPrice(el: HTMLElement): { priceCents: number | null; currency: string } {
  // The tile has no verified price testid; the info block (title, rating,
  // price) is the smallest scope that carries it when the store shows prices.
  const scope = query(el, "storeTileInfo") ?? el;
  return parsePriceText(cleanText(scope.textContent) ?? "");
}

function cleanText(text: string | null | undefined): string | undefined {
  const cleaned = text?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : undefined;
}
