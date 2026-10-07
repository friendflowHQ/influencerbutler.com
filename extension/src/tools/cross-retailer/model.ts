// Pure model for the "Also on Walmart / Also on Target" card: what the page
// sends, what comes back, and how a result is described. No DOM, no chrome apis,
// so it unit-tests directly. The lookup itself lives in background/cross-retailer.ts.

export type CrossRetailer = "walmart" | "target";

export function otherRetailer(r: CrossRetailer): CrossRetailer {
  return r === "walmart" ? "target" : "walmart";
}

export function retailerLabel(r: CrossRetailer): string {
  return r === "walmart" ? "Walmart" : "Target";
}

// What the current page knows about its own product.
export type CrossSource = {
  retailer: CrossRetailer;
  // The page's own product id (Walmart item id / Target TCIN).
  id: string;
  upc: string | null;
  title: string | null;
  brand: string | null;
  priceCents: number | null;
};

export type CrossMatch = {
  retailer: CrossRetailer;
  id: string;
  title: string | null;
  priceCents: number | null;
  inStock: boolean | null;
  url: string;
  imageUrl: string | null;
  // "upc": the other retailer's own record carries the same barcode.
  // "similar": found by keyword with brand and sizes agreeing; shown as a
  // "possible match" so a different pack size never reads as exact.
  matchType: "upc" | "similar";
};

export type CrossResult =
  | { status: "found"; match: CrossMatch }
  // The other retailer was reached and does not carry it.
  | { status: "none" }
  // The lookup could not complete (bot wall, offline, not signed in, server not
  // configured). Never shown as "not sold there". `searchUrl` lets the user look
  // for themselves.
  | { status: "unchecked"; searchUrl: string | null };

// A plain search link on the other retailer, by barcode when known. Always
// works for a human even when the automated lookup is blocked.
export function searchUrlFor(target: CrossRetailer, src: Pick<CrossSource, "upc" | "title">): string | null {
  const term = src.upc ?? src.title;
  if (!term) return null;
  return target === "target"
    ? `https://www.target.com/s?searchTerm=${encodeURIComponent(term)}`
    : `https://www.walmart.com/search?q=${encodeURIComponent(term)}`;
}

// A lookup needs something to match on.
export function canLookUp(src: CrossSource): boolean {
  return Boolean(src.upc) || Boolean(src.title && src.title.trim().length >= 6);
}

// Cache key per product, so the same barcode is not re-queried on every visit.
export function cacheKey(src: CrossSource): string {
  return `${src.retailer}:${src.upc ?? src.id}`;
}

const HOUR_MS = 60 * 60 * 1000;

// Found results hold for 6h, genuine misses for 1h (stock changes), and a failed
// check is never cached so the next visit retries.
export function cacheTtlMs(result: CrossResult): number {
  if (result.status === "found") return 6 * HOUR_MS;
  if (result.status === "none") return HOUR_MS;
  return 0;
}

export type PriceDelta = { cents: number; direction: "cheaper" | "pricier" | "same" };

// How the other retailer's price compares with this page's. Null when either
// price is unknown. `cheaper` means the OTHER retailer is cheaper.
export function priceDelta(sourceCents: number | null, otherCents: number | null): PriceDelta | null {
  if (sourceCents == null || otherCents == null) return null;
  const diff = sourceCents - otherCents;
  if (diff === 0) return { cents: 0, direction: "same" };
  return { cents: Math.abs(diff), direction: diff > 0 ? "cheaper" : "pricier" };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Coerce an untrusted background reply into a CrossResult.
export function normalizeResult(raw: unknown, src: CrossSource): CrossResult {
  const unchecked: CrossResult = {
    status: "unchecked",
    searchUrl: searchUrlFor(otherRetailer(src.retailer), src),
  };
  if (!raw || typeof raw !== "object") return unchecked;
  const r = raw as { status?: unknown; match?: unknown };
  if (r.status === "none") return { status: "none" };
  if (r.status !== "found") return unchecked;
  const m = (r.match && typeof r.match === "object" ? r.match : null) as Record<string, unknown> | null;
  if (!m || typeof m.url !== "string" || typeof m.id !== "string") return unchecked;
  const url = m.url;
  // Only ever link to the OTHER retailer's own product pages.
  const other = otherRetailer(src.retailer);
  const allowed =
    other === "walmart" ? /^https:\/\/www\.walmart\.com\/ip\// : /^https:\/\/www\.target\.com\/p\//;
  if (!allowed.test(url)) return unchecked;
  return {
    status: "found",
    match: {
      retailer: other,
      id: m.id,
      title: typeof m.title === "string" ? m.title : null,
      priceCents: typeof m.priceCents === "number" ? m.priceCents : null,
      inStock: typeof m.inStock === "boolean" ? m.inStock : null,
      url,
      imageUrl: typeof m.imageUrl === "string" ? m.imageUrl : null,
      matchType: m.matchType === "similar" ? "similar" : "upc",
    },
  };
}
