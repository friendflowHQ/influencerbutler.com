/**
 * walmart-api.ts - a minimal Walmart.io Affiliate API client used by
 * /api/extension/enrich to fetch Walmart product data, parallel to the Amazon
 * PA-API client in paapi.ts.
 *
 * Auth: Walmart signs each request with RSA-SHA256 over a canonical string of
 * three values (consumer id, timestamp in ms, key version), each newline
 * terminated. The signing primitive is exactly the one the repo already uses
 * for the GA4/GSC service accounts (src/lib/ga4.ts). The canonical-string and
 * signature builders are exported so walmart-api.test.ts can validate them
 * against Walmart's published example vector.
 *
 * Unlike Amazon (per-user Associates keys in the at-rest vault), Walmart is a
 * single first-party publisher account, so the credential lives in server env,
 * matching the GA4/GSC precedent. The private key never reaches the browser.
 */
import { createSign } from "node:crypto";
import {
  emptyEnrichedItem,
  type EnrichedItem,
} from "./enriched-item";

// Walmart Affiliate API v2 (the "Affiliate API" product resources).
const WALMART_API_BASE =
  "https://developer.api.walmart.com/api-proxy/service/affil/product/v2";

// The marketplace host as the extension records it for Walmart pages.
export const WALMART_MARKETPLACE = "walmart.com";

// Product Lookup accepts up to 20 ids per call.
export const WALMART_LOOKUP_MAX = 20;

export type WalmartCreds = {
  consumerId: string;
  keyVersion: string;
  privateKeyPem: string;
};

/**
 * Reads the global Walmart credential from env. Returns null when unset so the
 * enrich route can report `configured: false` the same way the Amazon path
 * reports zero creds. Handles the literal `\n` sequences Vercel stores PEM
 * secrets with (same handling as readServiceAccount in ga4.ts).
 */
export function loadWalmartCreds(): WalmartCreds | null {
  const consumerId = (process.env.WALMART_CONSUMER_ID ?? "").trim();
  const keyVersion = (process.env.WALMART_KEY_VERSION ?? "").trim();
  let privateKeyPem = process.env.WALMART_PRIVATE_KEY ?? "";
  if (!consumerId || !keyVersion || !privateKeyPem) return null;
  privateKeyPem = privateKeyPem.replace(/\\n/g, "\n");
  return { consumerId, keyVersion, privateKeyPem };
}

/**
 * The canonical string Walmart signs: the three header values in this fixed
 * order, each followed by a newline. Exported so the test can assert the exact
 * bytes (a wrong order or a missing trailing newline is a 401 in production).
 */
export function walmartCanonicalString(
  consumerId: string,
  timestampMs: number,
  keyVersion: string,
): string {
  return `${consumerId}\n${timestampMs}\n${keyVersion}\n`;
}

/**
 * RSA-SHA256 signature over the canonical string, base64-encoded. Exported for
 * the doc-vector test. `timestampMs` is passed in (not read from the clock) so
 * signing is deterministic and unit-testable, mirroring paapi's amzDate.
 */
export function walmartSignature(
  creds: WalmartCreds,
  timestampMs: number,
): string {
  const canonical = walmartCanonicalString(
    creds.consumerId,
    timestampMs,
    creds.keyVersion,
  );
  const signer = createSign("RSA-SHA256");
  signer.update(canonical);
  return signer.sign(creds.privateKeyPem).toString("base64");
}

/** The full header set every Walmart Affiliate API request must carry. */
export function walmartHeaders(
  creds: WalmartCreds,
  timestampMs: number,
): Record<string, string> {
  return {
    "WM_CONSUMER.ID": creds.consumerId,
    "WM_CONSUMER.INTIMESTAMP": String(timestampMs),
    "WM_SEC.KEY_VERSION": creds.keyVersion,
    "WM_SEC.AUTH_SIGNATURE": walmartSignature(creds, timestampMs),
    Accept: "application/json",
  };
}

// The subset of the Walmart Product response we read. Walmart returns many more
// fields; only these map onto EnrichedItem.
type RawWalmartItem = {
  itemId?: number | string;
  name?: string;
  brandName?: string;
  salePrice?: number;
  msrp?: number;
  currency?: string;
  stock?: string; // "Available" | "Not available"
  availableOnline?: boolean;
  mediumImage?: string;
  largeImage?: string;
  thumbnailImage?: string;
  productTrackingUrl?: string; // the affiliate-attributed link, when present
  productUrl?: string;
  categoryPath?: string;
  numReviews?: number;
  customerRating?: string;
  bestSellerRank?: number;
  salesRank?: number;
};

// Walmart's price is a dollar amount; convert to integer cents like PA-API.
function priceCentsOf(amount: number | undefined): number | null {
  return typeof amount === "number" && Number.isFinite(amount)
    ? Math.round(amount * 100)
    : null;
}

function availabilityOf(item: RawWalmartItem): string | null {
  if (typeof item.stock === "string" && item.stock) return item.stock;
  if (typeof item.availableOnline === "boolean") {
    return item.availableOnline ? "Available" : "Not available";
  }
  return null;
}

/**
 * Flatten one raw Walmart item into an EnrichedItem. Exported for unit testing
 * against a sample payload. Amazon-only fields stay null; Walmart demand
 * signals (numReviews, retailerRank) are populated for the estimator.
 */
export function normalizeWalmartItem(item: RawWalmartItem): EnrichedItem {
  const itemId = item.itemId != null ? String(item.itemId) : null;
  const price = priceCentsOf(item.salePrice);
  const rank =
    typeof item.bestSellerRank === "number"
      ? item.bestSellerRank
      : typeof item.salesRank === "number"
        ? item.salesRank
        : null;
  return {
    retailer: "walmart",
    marketplace: WALMART_MARKETPLACE,
    asin: null,
    itemId,
    found: true,
    title: item.name ?? null,
    brand: item.brandName ?? null,
    priceDisplay:
      price != null
        ? `${item.currency === "USD" || !item.currency ? "$" : ""}${(price / 100).toFixed(2)}`
        : null,
    priceCents: price,
    currency: item.currency ?? "USD",
    availability: availabilityOf(item),
    primeEligible: null,
    binding: null,
    browseNode: item.categoryPath ?? null,
    imageUrl: item.mediumImage ?? item.largeImage ?? item.thumbnailImage ?? null,
    detailPageUrl: item.productTrackingUrl ?? item.productUrl ?? null,
    numReviews: typeof item.numReviews === "number" ? item.numReviews : null,
    retailerRank: rank,
    error: null,
  };
}

type RawLookup = {
  items?: RawWalmartItem[];
  errors?: Array<{ code?: string; message?: string }>;
};

/**
 * Maps a raw Walmart Product Lookup response into one EnrichedItem per
 * requested id (order preserved, correlated by item id). Ids Walmart did not
 * return come back as not-found rows carrying their requested id. Exported for
 * unit testing against a sample payload.
 */
export function normalizeLookupBatch(
  raw: unknown,
  requestedIds: string[],
): EnrichedItem[] {
  const body = raw as RawLookup;
  const items = body?.items ?? [];
  const byId = new Map<string, EnrichedItem>();
  for (const item of items) {
    const row = normalizeWalmartItem(item);
    if (row.itemId) byId.set(row.itemId, row);
  }
  const err = items.length === 0 ? body?.errors?.[0] : undefined;
  const batchError = err ? err.message ?? err.code ?? "Walmart API error" : null;
  return requestedIds.map(
    (id) =>
      byId.get(id) ??
      emptyEnrichedItem({
        retailer: "walmart",
        marketplace: WALMART_MARKETPLACE,
        error: batchError,
        id,
      }),
  );
}

/**
 * Calls Walmart Product Lookup for up to WALMART_LOOKUP_MAX ids and returns one
 * EnrichedItem per requested id (order preserved). Network and API errors are
 * captured onto the returned rows rather than thrown, so a single bad lookup
 * never fails the whole enrichment (matching paapi's getItems).
 */
export async function lookupItems(
  creds: WalmartCreds,
  itemIds: string[],
  now: number = Date.now(),
): Promise<EnrichedItem[]> {
  const ids = itemIds.slice(0, WALMART_LOOKUP_MAX);
  if (ids.length === 0) return [];
  const url = `${WALMART_API_BASE}/items?ids=${encodeURIComponent(ids.join(","))}`;
  try {
    const res = await fetch(url, { headers: walmartHeaders(creds, now) });
    const json = await res.json().catch(() => null);
    if (!res.ok && !json) {
      return ids.map((id) =>
        emptyEnrichedItem({
          retailer: "walmart",
          marketplace: WALMART_MARKETPLACE,
          error: `Walmart API HTTP ${res.status}`,
          id,
        }),
      );
    }
    return normalizeLookupBatch(json, ids);
  } catch {
    return ids.map((id) =>
      emptyEnrichedItem({
        retailer: "walmart",
        marketplace: WALMART_MARKETPLACE,
        error: "Network error reaching Walmart API",
        id,
      }),
    );
  }
}

/**
 * Walmart product search by keyword. Returns normalized items (found rows
 * only). Used later for id-resolution / gap features, not the v1 enrich path.
 */
export async function searchItems(
  creds: WalmartCreds,
  queryText: string,
  now: number = Date.now(),
): Promise<EnrichedItem[]> {
  const url = `${WALMART_API_BASE}/search?query=${encodeURIComponent(queryText)}`;
  try {
    const res = await fetch(url, { headers: walmartHeaders(creds, now) });
    const json = (await res.json().catch(() => null)) as
      | { items?: RawWalmartItem[] }
      | null;
    const items = json?.items ?? [];
    return items.map(normalizeWalmartItem);
  } catch {
    return [];
  }
}
