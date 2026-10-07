import type { ProductSignals } from "../amazon/product-signals";
import {
  EMPTY_TARGET_PRODUCT,
  TARGET_DEFAULT_KEY,
  TARGET_MARKETPLACE,
  cleanBarcode,
  decodeEntities,
  extractTcin,
  fetchTargetPdp,
  type TargetProduct,
} from "./redsky";

// Target's product-page equivalent of walmart/product-signals. The page is read
// two ways and merged: JSON-LD in the document (instant, no network) and the
// redsky product record (richer: the barcode, brand, rating). Either can be
// missing; the result simply carries nulls for what neither supplied.

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}

// Flatten a JSON-LD blob (object, array, or @graph) into its nodes.
function ldNodes(json: unknown): Obj[] {
  if (Array.isArray(json)) return json.flatMap(ldNodes);
  const o = obj(json);
  if (!o) return [];
  const graph = Array.isArray(o["@graph"]) ? ldNodes(o["@graph"]) : [];
  return [o, ...graph];
}

function isProductNode(node: Obj): boolean {
  const t = node["@type"];
  return t === "Product" || (Array.isArray(t) && t.includes("Product"));
}

// Pure: the product facts out of the raw text of every JSON-LD script tag.
export function parseJsonLdProduct(texts: string[]): TargetProduct | null {
  for (const text of texts) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      continue;
    }
    const node = ldNodes(json).find(isProductNode);
    if (!node) continue;
    const offers = obj(Array.isArray(node.offers) ? node.offers[0] : node.offers);
    const price = Number(offers?.price ?? offers?.lowPrice);
    const rating = obj(node.aggregateRating);
    const brand = typeof node.brand === "string" ? node.brand : obj(node.brand)?.name;
    const image = Array.isArray(node.image) ? node.image[0] : node.image;
    const title = typeof node.name === "string" ? node.name.trim() : "";
    const avail = typeof offers?.availability === "string" ? offers.availability : "";
    return {
      ...EMPTY_TARGET_PRODUCT,
      tcin: typeof node.sku === "string" && /^\d{7,10}$/.test(node.sku) ? node.sku : null,
      title: title ? decodeEntities(title) : null,
      brand: typeof brand === "string" && brand.trim() ? brand.trim() : null,
      priceCents: Number.isFinite(price) ? Math.round(price * 100) : null,
      upc: cleanBarcode(node.gtin ?? node.gtin13 ?? node.gtin12 ?? node.gtin14),
      inStock: avail ? !/OutOfStock|SoldOut|Discontinued/i.test(avail) : null,
      averageRating: Number.isFinite(Number(rating?.ratingValue)) ? Number(rating?.ratingValue) : null,
      numReviews: Number.isFinite(Number(rating?.reviewCount)) ? Number(rating?.reviewCount) : null,
      imageUrl: typeof image === "string" ? image : null,
    };
  }
  return null;
}

function jsonLdTexts(doc: Document): string[] {
  return [...doc.querySelectorAll('script[type="application/ld+json"]')].map(
    (s) => s.textContent ?? "",
  );
}

// The public web key from the page's inline config, when present. The content
// script cannot read window globals (isolated world), so it scans script text.
export function readApiKeyFromText(text: string): string | null {
  return text.match(/"defaultServicesApiKey"\s*:\s*"([a-f0-9]{30,50})"/)?.[1] ?? null;
}

function readApiKey(doc: Document): string {
  for (const s of doc.querySelectorAll("script:not([src])")) {
    const text = s.textContent ?? "";
    if (text.length > 200_000 || !text.includes("defaultServicesApiKey")) continue;
    const key = readApiKeyFromText(text);
    if (key) return key;
  }
  return TARGET_DEFAULT_KEY;
}

// Merge two partial reads, preferring the first non-null value per field.
export function mergeTargetProducts(a: TargetProduct | null, b: TargetProduct | null): TargetProduct | null {
  if (!a && !b) return null;
  const x = a ?? EMPTY_TARGET_PRODUCT;
  const y = b ?? EMPTY_TARGET_PRODUCT;
  return {
    tcin: x.tcin ?? y.tcin,
    title: x.title ?? y.title,
    brand: x.brand ?? y.brand,
    priceCents: x.priceCents ?? y.priceCents,
    upc: x.upc ?? y.upc,
    inStock: x.inStock ?? y.inStock,
    averageRating: x.averageRating ?? y.averageRating,
    numReviews: x.numReviews ?? y.numReviews,
    imageUrl: x.imageUrl ?? y.imageUrl,
  };
}

// The synchronous read (JSON-LD only) the retailer module and the panel's first
// paint use. tcin always comes from the URL when the page does not carry it.
export function extractTargetProductSync(doc: Document, url: string): TargetProduct | null {
  const tcin = extractTcin(url);
  let ld = parseJsonLdProduct(jsonLdTexts(doc));
  // After a client-side navigation the document still carries the FIRST page's
  // JSON-LD, which would show the previous product's price and barcode. When it
  // names a different TCIN than the URL, ignore it (the redsky read fills in).
  if (ld?.tcin && tcin && ld.tcin !== tcin) ld = null;
  if (!ld && !tcin) return null;
  return { ...(ld ?? EMPTY_TARGET_PRODUCT), tcin: tcin ?? ld?.tcin ?? null };
}

// The full read: JSON-LD, then the redsky product record fills what JSON-LD lacks
// (the barcode above all). A blocked or failed redsky call just leaves the
// JSON-LD read as is.
export async function readTargetProduct(doc: Document, url: string): Promise<TargetProduct | null> {
  const sync = extractTargetProductSync(doc, url);
  const tcin = sync?.tcin ?? extractTcin(url);
  if (!tcin) return sync;
  if (sync?.upc && sync.title && sync.priceCents != null) return sync;
  const pdp = await fetchTargetPdp(tcin, readApiKey(doc));
  const remote = pdp.status === "ok" ? pdp.value : null;
  return mergeTargetProducts(sync, remote ? { ...remote, tcin } : null);
}

// Adapt a TargetProduct into the neutral ProductSignals shape (tcin carried in
// `asin`, like Walmart's item id) for the shared RetailerModule contract.
export function targetToSignals(prod: TargetProduct | null, url: string): ProductSignals {
  return {
    asin: prod?.tcin ?? extractTcin(url),
    marketplace: TARGET_MARKETPLACE,
    title: prod?.title ?? null,
    priceCents: prod?.priceCents ?? null,
    currency: "USD",
    listPriceCents: null,
    dealKind: null,
    inStock: prod?.inStock ?? true,
    boughtPastMonth: null,
    brand: prod?.brand ?? null,
    commissionRatePct: null,
    category: null,
    parentAsin: null,
    variationAsins: [],
    bestsellerRank: null,
    listedAt: null,
    sellerCount: null,
    imageUrl: prod?.imageUrl ?? null,
  };
}

export function extractSignals(doc: Document, url: string): ProductSignals {
  return targetToSignals(extractTargetProductSync(doc, url), url);
}
