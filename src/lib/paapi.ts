/**
 * paapi.ts - a minimal Amazon Product Advertising API (PA-API 5, "Creator
 * API") client used by /api/extension/enrich to fetch product data the listing
 * page does not surface (multi-marketplace availability, structured fields).
 *
 * PA-API authenticates with AWS Signature V4. The signing building blocks
 * (sha256Hex, hmac, deriveSigningKey, buildCanonicalRequest, signRequest) are
 * exported so paapi.test.ts can validate them against AWS's published SigV4
 * example vectors, independent of PA-API specifics.
 *
 * Signing happens ONLY here on the server; the secret key never reaches the
 * browser (see src/lib/creator-api-creds.ts for the at-rest vault).
 */
import { createHash, createHmac } from "node:crypto";
import { emptyEnrichedItem, type EnrichedItem } from "./enriched-item";

// Re-exported so existing importers (the enrich route) keep resolving the type
// from here. The canonical definition now lives in enriched-item.ts so the
// Amazon and Walmart clients share one retailer-agnostic shape.
export type { EnrichedItem } from "./enriched-item";

export const PAAPI_RESOURCES = [
  "ItemInfo.Title",
  "ItemInfo.ByLineInfo",
  "ItemInfo.Classifications",
  "ItemInfo.ProductInfo",
  "Offers.Listings.Price",
  "Offers.Listings.Availability.Message",
  "Offers.Listings.DeliveryInfo.IsPrimeEligible",
  "BrowseNodeInfo.BrowseNodes",
  "Images.Primary.Medium",
] as const;

// Marketplace host (as the extension records it, e.g. "amazon.co.uk") mapped to
// the PA-API endpoint host, AWS region, and the Marketplace request value. Only
// marketplaces the user actually holds credentials for are ever queried.
export type MarketplaceInfo = { paapiHost: string; region: string; marketplace: string };

export const MARKETPLACES: Record<string, MarketplaceInfo> = {
  "amazon.com": { paapiHost: "webservices.amazon.com", region: "us-east-1", marketplace: "www.amazon.com" },
  "amazon.ca": { paapiHost: "webservices.amazon.ca", region: "us-east-1", marketplace: "www.amazon.ca" },
  "amazon.com.mx": { paapiHost: "webservices.amazon.com.mx", region: "us-east-1", marketplace: "www.amazon.com.mx" },
  "amazon.com.br": { paapiHost: "webservices.amazon.com.br", region: "us-east-1", marketplace: "www.amazon.com.br" },
  "amazon.co.uk": { paapiHost: "webservices.amazon.co.uk", region: "eu-west-1", marketplace: "www.amazon.co.uk" },
  "amazon.de": { paapiHost: "webservices.amazon.de", region: "eu-west-1", marketplace: "www.amazon.de" },
  "amazon.fr": { paapiHost: "webservices.amazon.fr", region: "eu-west-1", marketplace: "www.amazon.fr" },
  "amazon.it": { paapiHost: "webservices.amazon.it", region: "eu-west-1", marketplace: "www.amazon.it" },
  "amazon.es": { paapiHost: "webservices.amazon.es", region: "eu-west-1", marketplace: "www.amazon.es" },
  "amazon.nl": { paapiHost: "webservices.amazon.nl", region: "eu-west-1", marketplace: "www.amazon.nl" },
  "amazon.se": { paapiHost: "webservices.amazon.se", region: "eu-west-1", marketplace: "www.amazon.se" },
  "amazon.pl": { paapiHost: "webservices.amazon.pl", region: "eu-west-1", marketplace: "www.amazon.pl" },
  "amazon.in": { paapiHost: "webservices.amazon.in", region: "eu-west-1", marketplace: "www.amazon.in" },
  "amazon.co.jp": { paapiHost: "webservices.amazon.co.jp", region: "us-west-2", marketplace: "www.amazon.co.jp" },
  "amazon.com.au": { paapiHost: "webservices.amazon.com.au", region: "us-west-2", marketplace: "www.amazon.com.au" },
  "amazon.sg": { paapiHost: "webservices.amazon.sg", region: "us-west-2", marketplace: "www.amazon.sg" },
  "amazon.ae": { paapiHost: "webservices.amazon.ae", region: "eu-west-1", marketplace: "www.amazon.ae" },
  "amazon.sa": { paapiHost: "webservices.amazon.sa", region: "eu-west-1", marketplace: "www.amazon.sa" },
};

export function marketplaceInfo(host: string): MarketplaceInfo | null {
  return MARKETPLACES[host.toLowerCase()] ?? null;
}

export function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/**
 * AWS SigV4 signing key: HMAC chain over the date, region, service, and the
 * fixed "aws4_request" terminator, seeded with "AWS4" + secret.
 */
export function deriveSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export type CanonicalInput = {
  method: string;
  path: string;
  query: string;
  headers: Record<string, string>;
  payload: string;
};

/**
 * Builds the SigV4 canonical request string and the signed-headers list from a
 * set of headers. Header names are lowercased and sorted; values are trimmed.
 */
export function buildCanonicalRequest(input: CanonicalInput): {
  canonicalRequest: string;
  signedHeaders: string;
} {
  const entries = Object.entries(input.headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, " ")] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const canonicalHeaders = entries.map(([name, value]) => `${name}:${value}\n`).join("");
  const signedHeaders = entries.map(([name]) => name).join(";");
  const canonicalRequest = [
    input.method,
    input.path,
    input.query,
    canonicalHeaders,
    signedHeaders,
    sha256Hex(input.payload),
  ].join("\n");
  return { canonicalRequest, signedHeaders };
}

export type SignInput = {
  method: string;
  host: string;
  path: string;
  query?: string;
  region: string;
  service: string;
  headers: Record<string, string>;
  payload: string;
  accessKeyId: string;
  secretKey: string;
  // amzDate: YYYYMMDDTHHMMSSZ. Passed in (not read from the clock) so signing
  // is deterministic and unit-testable.
  amzDate: string;
};

/**
 * Signs a request with AWS SigV4 and returns the headers to send (the input
 * headers plus x-amz-date and Authorization).
 */
export function signRequest(input: SignInput): Record<string, string> {
  const dateStamp = input.amzDate.slice(0, 8);
  const headers = { ...input.headers, host: input.host, "x-amz-date": input.amzDate };
  const { canonicalRequest, signedHeaders } = buildCanonicalRequest({
    method: input.method,
    path: input.path,
    query: input.query ?? "",
    headers,
    payload: input.payload,
  });
  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = deriveSigningKey(input.secretKey, dateStamp, input.region, input.service);
  const signature = hmac(signingKey, stringToSign).toString("hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { ...headers, Authorization: authorization };
}

export type PaapiCreds = {
  host: string; // marketplace host as recorded by the extension, e.g. "amazon.com"
  partnerTag: string;
  accessKeyId: string;
  secretKey: string;
};

function emptyItem(
  marketplace: string,
  error: string | null,
  found = false,
  asin: string | null = null,
): EnrichedItem {
  return emptyEnrichedItem({ retailer: "amazon", marketplace, error, found, id: asin });
}

type RawItem = {
  ASIN?: string;
  DetailPageURL?: string;
  ItemInfo?: {
    Title?: { DisplayValue?: string };
    ByLineInfo?: { Brand?: { DisplayValue?: string }; Manufacturer?: { DisplayValue?: string } };
    Classifications?: { Binding?: { DisplayValue?: string } };
  };
  Images?: { Primary?: { Medium?: { URL?: string } } };
  Offers?: {
    Listings?: Array<{
      Price?: { DisplayAmount?: string; Amount?: number; Currency?: string };
      Availability?: { Message?: string };
      DeliveryInfo?: { IsPrimeEligible?: boolean };
    }>;
  };
  BrowseNodeInfo?: { BrowseNodes?: Array<{ DisplayName?: string }> };
};

// Flatten one raw PA-API item into an EnrichedItem for the given marketplace.
function normalizeItem(marketplaceHost: string, item: RawItem): EnrichedItem {
  const listing = item.Offers?.Listings?.[0];
  const priceAmount = listing?.Price?.Amount;
  const asin = item.ASIN ? item.ASIN.toUpperCase() : null;
  return {
    retailer: "amazon",
    marketplace: marketplaceHost,
    asin,
    itemId: asin,
    found: true,
    title: item.ItemInfo?.Title?.DisplayValue ?? null,
    brand:
      item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue ??
      item.ItemInfo?.ByLineInfo?.Manufacturer?.DisplayValue ??
      null,
    priceDisplay: listing?.Price?.DisplayAmount ?? null,
    priceCents: typeof priceAmount === "number" ? Math.round(priceAmount * 100) : null,
    currency: listing?.Price?.Currency ?? null,
    availability: listing?.Availability?.Message ?? null,
    primeEligible: listing?.DeliveryInfo?.IsPrimeEligible ?? null,
    binding: item.ItemInfo?.Classifications?.Binding?.DisplayValue ?? null,
    browseNode: item.BrowseNodeInfo?.BrowseNodes?.[0]?.DisplayName ?? null,
    imageUrl: item.Images?.Primary?.Medium?.URL ?? null,
    detailPageUrl: item.DetailPageURL ?? null,
    numReviews: null,
    retailerRank: null,
    error: null,
  };
}

type RawGetItems = {
  Errors?: Array<{ Code?: string; Message?: string }>;
  ItemsResult?: { Items?: RawItem[] };
};

/**
 * Maps a raw PA-API GetItemsResponse into a flat EnrichedItem for one
 * marketplace (single-ASIN case). Exported for unit testing against a sample
 * payload.
 */
export function normalizeGetItems(marketplaceHost: string, raw: unknown): EnrichedItem {
  const body = raw as RawGetItems;
  const items = body?.ItemsResult?.Items;
  if (!items || items.length === 0) {
    const err = body?.Errors?.[0];
    // NoResults / ItemNotAccessible means the ASIN is not on this marketplace.
    const notFound = !err || err.Code === "NoResults" || err.Code === "ItemNotAccessible";
    return emptyItem(marketplaceHost, notFound ? null : err?.Message ?? err?.Code ?? "PA-API error", false);
  }
  return normalizeItem(marketplaceHost, items[0]);
}

/**
 * Batch variant: a GetItems call for up to 10 ASINs returns one EnrichedItem
 * per requested ASIN (order preserved). ASINs PA-API did not return (not on
 * this marketplace, or a top-level Errors response) come back as not-found rows
 * carrying their requested ASIN, so callers can always correlate by ASIN.
 * Exported for unit testing against a sample payload.
 */
export function normalizeGetItemsBatch(
  marketplaceHost: string,
  raw: unknown,
  requestedAsins: string[],
): EnrichedItem[] {
  const body = raw as RawGetItems;
  const items = body?.ItemsResult?.Items ?? [];
  const byAsin = new Map<string, EnrichedItem>();
  for (const item of items) {
    const row = normalizeItem(marketplaceHost, item);
    if (row.asin) byAsin.set(row.asin, row);
  }
  // A top-level error with no items applies to the whole batch (bad partner
  // tag, throttling, etc.); NoResults just means the ASINs are not here.
  const err = items.length === 0 ? body?.Errors?.[0] : undefined;
  const notFound = !err || err.Code === "NoResults" || err.Code === "ItemNotAccessible";
  const batchError = notFound ? null : err?.Message ?? err?.Code ?? "PA-API error";
  return requestedAsins.map(
    (asin) => byAsin.get(asin) ?? emptyItem(marketplaceHost, batchError, false, asin),
  );
}

// YYYYMMDDTHHMMSSZ from a Date (UTC), the format SigV4's x-amz-date expects.
export function amzDate(now: Date): string {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

// PA-API GetItems accepts at most 10 ItemIds per request.
export const GET_ITEMS_MAX = 10;

/**
 * Calls PA-API GetItems for up to 10 ASINs on one marketplace and returns one
 * EnrichedItem per requested ASIN (order preserved, correlated by ASIN).
 * Network and PA-API errors are captured onto the returned rows rather than
 * thrown, so a single bad marketplace never fails the whole enrichment.
 */
export async function getItems(
  creds: PaapiCreds,
  asins: string[],
  now: Date = new Date(),
): Promise<EnrichedItem[]> {
  const ids = asins.slice(0, GET_ITEMS_MAX);
  const info = marketplaceInfo(creds.host);
  if (!info) return ids.map((a) => emptyItem(creds.host, "Unsupported marketplace", false, a));
  if (ids.length === 0) return [];

  const path = "/paapi5/getitems";
  const target = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems";
  const payload = JSON.stringify({
    ItemIds: ids,
    ItemIdType: "ASIN",
    Resources: PAAPI_RESOURCES,
    PartnerTag: creds.partnerTag,
    PartnerType: "Associates",
    Marketplace: info.marketplace,
  });

  const signed = signRequest({
    method: "POST",
    host: info.paapiHost,
    path,
    region: info.region,
    service: "ProductAdvertisingAPI",
    headers: {
      "content-encoding": "amz-1.0",
      "content-type": "application/json; charset=utf-8",
      "x-amz-target": target,
    },
    payload,
    accessKeyId: creds.accessKeyId,
    secretKey: creds.secretKey,
    amzDate: amzDate(now),
  });

  try {
    const res = await fetch(`https://${info.paapiHost}${path}`, {
      method: "POST",
      headers: signed,
      body: payload,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok && !json) {
      return ids.map((a) => emptyItem(creds.host, `PA-API HTTP ${res.status}`, false, a));
    }
    return normalizeGetItemsBatch(creds.host, json, ids);
  } catch {
    return ids.map((a) => emptyItem(creds.host, "Network error reaching PA-API", false, a));
  }
}
