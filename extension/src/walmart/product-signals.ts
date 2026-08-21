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
  const priceInfo = p.priceInfo as { currentPrice?: { price?: unknown; currencyUnit?: unknown } } | undefined;
  const current = priceInfo?.currentPrice;
  const category = p.category as { path?: Array<{ name?: string }> } | undefined;
  const path = Array.isArray(category?.path) ? category.path : [];
  const image = p.imageInfo as { thumbnailUrl?: string } | undefined;
  return {
    itemId: typeof p.usItemId === "string" ? p.usItemId : p.usItemId != null ? String(p.usItemId) : null,
    title: typeof p.name === "string" ? p.name : null,
    brand: typeof p.brand === "string" ? p.brand : null,
    priceCents: centsOf(current?.price),
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
    inStock: prod?.inStock ?? true,
    boughtPastMonth: null,
    brand: prod?.brand ?? null,
    commissionRatePct: null,
    category: prod?.category ?? null,
    parentAsin: null,
    variationAsins: [],
    bestsellerRank: null,
    imageUrl: prod?.imageUrl ?? null,
  };
}

// The neutral extractor the content router calls, mirroring
// amazon/product-signals extractSignals(doc, url).
export function extractSignals(doc: Document, url: string): ProductSignals {
  return toSignals(parseWalmartProduct(readNextData(doc)), url);
}

// The full Walmart product read (signals + Walmart-only demand fields), for the
// market contribution and the review-velocity estimate.
export function extractWalmartProduct(doc: Document, url: string): WalmartProduct | null {
  const prod = parseWalmartProduct(readNextData(doc));
  if (prod && !prod.itemId) prod.itemId = extractItemId(url);
  return prod;
}
