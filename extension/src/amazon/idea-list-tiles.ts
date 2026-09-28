import { query, queryAll } from "./selectors";
import { parsePriceText } from "./search-results";
import { asinFromDpHref } from "./brand-store";
import { marketplaceFromUrl } from "./product-signals";

// Reads the product tiles off an Idea List detail page (/shop/<handle>/list/
// <LISTID>). Verified live 2026-08-18 on a public list: the page is served by
// aip-storefront-service and rendered server-side, each product in a
// div.single-list-item whose data-asin holds the amzn1.asin.<ASIN> form, with
// an inner div.single-product-item carrying the bare ASIN. Legacy /ideas/
// URLs 404 now, but the parser accepts any root so a variant layout only
// needs new selectors.

export type IdeaListTile = {
  asin: string;
  title: string | null;
  brand: string | null;
  priceCents: number | null;
  currency: string;
  imageUrl: string | null;
  href: string | null;
  el: HTMLElement;
};

const ASIN_RE = /^[A-Z0-9]{10}$/;

// Pure (exported for tests): the ASIN in a data-asin attribute that is either
// bare ("B01JGG5CH4") or prefixed ("amzn1.asin.B01JGG5CH4"), or null.
export function asinFromIdeaAttr(value: string | null | undefined): string | null {
  if (!value) return null;
  const bare = value.trim().replace(/^amzn1\.asin\./i, "").toUpperCase();
  return ASIN_RE.test(bare) ? bare : null;
}

export function parseIdeaListTiles(root: ParentNode, url: string): IdeaListTile[] {
  const marketplace = marketplaceFromUrl(url);
  const tiles: IdeaListTile[] = [];
  const seen = new Set<string>();
  for (const el of queryAll<HTMLElement>(root, "ideaListTile")) {
    const asin = tileAsin(el);
    if (!asin || seen.has(asin)) continue;
    seen.add(asin);
    const priceScope = query(el, "ideaListTilePrice");
    const price = parsePriceText(cleanText(priceScope?.textContent) ?? "");
    tiles.push({
      asin,
      title: cleanText(query(el, "ideaListTileTitle")?.textContent) ?? null,
      brand: cleanText(query(el, "ideaListTileBrand")?.textContent) ?? null,
      priceCents: price.priceCents,
      currency: price.currency,
      imageUrl: query<HTMLImageElement>(el, "ideaListTileImage")?.getAttribute("src") ?? null,
      href: `https://www.${marketplace}/dp/${asin}`,
      el,
    });
  }
  return tiles;
}

function tileAsin(el: HTMLElement): string | null {
  // The tile's own data-asin (amzn1.asin.<ASIN> form), then any nested
  // data-asin (the inner product div carries the bare form), then the /dp/
  // link as the last resort for layout variants.
  const own = asinFromIdeaAttr(el.getAttribute("data-asin"));
  if (own) return own;
  for (const nested of Array.from(el.querySelectorAll("[data-asin]"))) {
    const asin = asinFromIdeaAttr(nested.getAttribute("data-asin"));
    if (asin) return asin;
  }
  for (const a of queryAll<HTMLAnchorElement>(el, "ideaListTileLink")) {
    const asin = asinFromDpHref(a.getAttribute("href"));
    if (asin) return asin;
  }
  return null;
}

function cleanText(text: string | null | undefined): string | undefined {
  const cleaned = text?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : undefined;
}
