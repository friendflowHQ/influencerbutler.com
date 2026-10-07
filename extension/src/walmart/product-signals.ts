import type { ProductSignals } from "../amazon/product-signals";
import { readNextData, pathInto, type NextData } from "./next-data";

// Walmart's product-page equivalent of amazon/product-signals. Returns the SAME
// ProductSignals shape (so the neutral overlays consume it unchanged), with the
// Walmart item id carried in `asin`. Amazon-only fields (SiteStripe commission,
// variation twister, BSR) are null/empty; Walmart demand signals (review count,
// rating) are exposed separately via parseWalmartProduct for the market
// contribution and estimate.
//
// Field paths verified live 2026-08-21:
//   props.pageProps.initialData.data.product

export const WALMART_MARKETPLACE = "walmart.com";

// The Walmart item id is the trailing numeric segment of an /ip/ url:
//   /ip/<slug>/<itemId>  or  /ip/<itemId>
const ITEM_ID_RE = /\/ip\/(?:[^/]+\/)?(\d{3,15})(?:[/?#]|$)/;

export function extractItemId(url: string): string | null {
  const m = url.match(ITEM_ID_RE);
  return m?.[1] ?? null;
}

// The richer parse (exported for tests + the market contribution). Reads the
// product object out of already-parsed __NEXT_DATA__.
export type WalmartProduct = {
  itemId: string | null;
  title: string | null;
  brand: string | null;
  priceCents: number | null;
  // Walmart's strikethrough "was" price (priceInfo.wasPrice) when the item is on
  // rollback / reduced price; null for an everyday-price item.
  wasPriceCents: number | null;
  currency: string;
  inStock: boolean;
  category: string | null;
  imageUrl: string | null;
  averageRating: number | null;
  numReviews: number | null;
  sellerName: string | null;
};

function centsOf(price: unknown): number | null {
  return typeof price === "number" && Number.isFinite(price) ? Math.round(price * 100) : null;
}

// Pure parser: a WalmartProduct from a parsed __NEXT_DATA__ object.
export function parseWalmartProduct(nextData: NextData | null): WalmartProduct | null {
  const p = pathInto(nextData, "props.pageProps.initialData.data.product") as
    | Record<string, unknown>
    | undefined;
  if (!p) return null;
  const priceInfo = p.priceInfo as
    | { currentPrice?: { price?: unknown; currencyUnit?: unknown }; wasPrice?: { price?: unknown } }
    | undefined;
  const current = priceInfo?.currentPrice;
  const category = p.category as { path?: Array<{ name?: string }> } | undefined;
  const path = Array.isArray(category?.path) ? category.path : [];
  const image = p.imageInfo as { thumbnailUrl?: string } | undefined;
  return {
    itemId: typeof p.usItemId === "string" ? p.usItemId : p.usItemId != null ? String(p.usItemId) : null,
    title: typeof p.name === "string" ? p.name : null,
    brand: typeof p.brand === "string" ? p.brand : null,
    priceCents: centsOf(current?.price),
    wasPriceCents: centsOf(priceInfo?.wasPrice?.price),
    currency: typeof current?.currencyUnit === "string" ? current.currencyUnit : "USD",
    inStock: p.availabilityStatus === "IN_STOCK",
    category: path.length ? path[path.length - 1]?.name ?? null : null,
    imageUrl: typeof image?.thumbnailUrl === "string" ? image.thumbnailUrl : null,
    averageRating: typeof p.averageRating === "number" ? p.averageRating : null,
    numReviews: typeof p.numberOfReviews === "number" ? p.numberOfReviews : null,
    sellerName: typeof p.sellerName === "string" ? p.sellerName : null,
  };
}

// Adapt a WalmartProduct into the neutral ProductSignals shape.
function toSignals(prod: WalmartProduct | null, url: string): ProductSignals {
  return {
    asin: prod?.itemId ?? extractItemId(url),
    marketplace: WALMART_MARKETPLACE,
    title: prod?.title ?? null,
    priceCents: prod?.priceCents ?? null,
    currency: prod?.currency ?? "USD",
    // The was price only counts when it is really above the current price, so a
    // stale or equal wasPrice never reads as a discount. dealKind stays null:
    // Walmart's badge semantics ride the tile-level dealBadge path, not the
    // Amazon buybox readers.
    listPriceCents:
      prod?.wasPriceCents != null && prod.priceCents != null && prod.wasPriceCents > prod.priceCents
        ? prod.wasPriceCents
        : null,
    dealKind: null,
    inStock: prod?.inStock ?? true,
    boughtPastMonth: null,
    brand: prod?.brand ?? null,
    commissionRatePct: null,
    category: prod?.category ?? null,
    parentAsin: null,
    variationAsins: [],
    bestsellerRank: null,
    // Walmart's __NEXT_DATA__ does not expose a listing date or a buybox offer
    // count in the shape we read, so these Amazon-only signals stay null here.
    listedAt: null,
    sellerCount: null,
    imageUrl: prod?.imageUrl ?? null,
  };
}

// The product in this document's __NEXT_DATA__, only when it is the product the
// URL names. After a client-side navigation (search -> product, product ->
// product) the script tag still holds the FIRST page's blob, so reading it would
// show the previous product's price, title and id.
function productForUrl(doc: Document, url: string): WalmartProduct | null {
  const prod = parseWalmartProduct(readNextData(doc));
  const urlId = extractItemId(url);
  if (prod?.itemId && urlId && prod.itemId !== urlId) return null;
  return prod;
}

// True when the document's embedded data does not describe the URL's product,
// so the caller should read a fresh copy of the page instead.
export function needsFreshProductDoc(doc: Document, url: string): boolean {
  return productForUrl(doc, url) === null;
}

// Fetch and parse a fresh copy of the product page (the server-rendered HTML
// carries the right __NEXT_DATA__). Null on any failure.
export async function fetchProductDoc(url: string): Promise<Document | null> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    return new DOMParser().parseFromString(await res.text(), "text/html");
  } catch {
    return null;
  }
}

// The neutral extractor the content router calls, mirroring
// amazon/product-signals extractSignals(doc, url).
export function extractSignals(doc: Document, url: string): ProductSignals {
  return toSignals(productForUrl(doc, url), url);
}

// The full Walmart product read (signals + Walmart-only demand fields), for the
// market contribution and the review-velocity estimate.
export function extractWalmartProduct(doc: Document, url: string): WalmartProduct | null {
  const prod = productForUrl(doc, url);
  if (prod && !prod.itemId) prod.itemId = extractItemId(url);
  return prod;
}
