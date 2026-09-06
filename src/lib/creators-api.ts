/**
 * creators-api.ts - a minimal Amazon Creators API client used by
 * /api/extension/enrich to fetch product data the listing page does not surface
 * (multi-marketplace availability, structured fields).
 *
 * This is the real OAuth2 Creators API, the same one the desktop app uses: an
 * OAuth2 client_credentials grant mints a short-lived Bearer token, which then
 * authorizes POST calls to https://creatorsapi.amazon/catalog/v1/*. It replaces
 * the older Product Advertising API (PA-API) SigV4 path. There is no request
 * signing and no AWS Access Key / Secret Key: credentials are a Credential ID
 * (an amzn1.application-oa2-client... value) and a Credential Secret.
 *
 * Auth happens ONLY here on the server; the client secret never reaches the
 * browser (see src/lib/creator-api-creds.ts for the at-rest vault).
 */
import { emptyEnrichedItem, type EnrichedItem } from "./enriched-item";

// Re-exported so existing importers (the enrich route) keep resolving the type
// from here. The canonical definition lives in enriched-item.ts so the Amazon
// and Walmart clients share one retailer-agnostic shape.
export type { EnrichedItem } from "./enriched-item";

// The single Creators API catalog host. Unlike PA-API's per-region webservices.*
// hosts, every marketplace is reached through this one host; the marketplace is
// carried by the x-marketplace header and the region only selects the OAuth
// token endpoint.
const CREATORS_HOST = "creatorsapi.amazon";

// Creators API resource enum is camelCase. These cover every field
// normalizeItem() reads below; the price leaf carries the currency/amount.
export const CREATORS_RESOURCES = [
  "itemInfo.title",
  "itemInfo.byLineInfo",
  "itemInfo.classifications",
  "offersV2.listings.price",
  "offersV2.listings.availability",
  "browseNodeInfo.browseNodes",
  "images.primary.medium",
] as const;

// Region -> OAuth token endpoint. v3.x+ credentials authenticate with Login with
// Amazon (LWA); v2.x credentials use Amazon Cognito. Mirrors the desktop app's
// creatorsTokenProvider.js.
const LWA_REGION_TOKEN_ENDPOINTS: Record<string, string> = {
  "us-east-1": "https://api.amazon.com/auth/o2/token",
  "eu-south-2": "https://api.amazon.co.uk/auth/o2/token",
  "us-west-2": "https://api.amazon.co.jp/auth/o2/token",
};
const LWA_DEFAULT_TOKEN_ENDPOINT = "https://api.amazon.com/auth/o2/token";
const COGNITO_REGION_TOKEN_ENDPOINTS: Record<string, string> = {
  "us-east-1": "https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token",
  "eu-south-2": "https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token",
  "us-west-2": "https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token",
};

// Credential version major >= 3 means Login with Amazon; anything lower is the
// older Cognito era.
export function isLwaCredentialVersion(credentialVersion: string): boolean {
  const major = Number.parseInt(String(credentialVersion ?? "").trim(), 10);
  return Number.isFinite(major) && major >= 3;
}

export function resolveTokenEndpoint(region: string, credentialVersion: string): string {
  const r = String(region ?? "").trim();
  if (isLwaCredentialVersion(credentialVersion)) {
    return LWA_REGION_TOKEN_ENDPOINTS[r] ?? LWA_DEFAULT_TOKEN_ENDPOINT;
  }
  return (
    COGNITO_REGION_TOKEN_ENDPOINTS[r] ??
    `https://creatorsapi.auth.${r || "us-east-1"}.amazoncognito.com/oauth2/token`
  );
}

// The three credential regions Amazon issues Creators API credentials for, and
// the marketplaces they serve. `credentialVersion` is the default version for
// the region (users can still override per credential set). Mirrors the desktop
// app's creatorsApiMarketplaces.js.
export type CreatorsGroup = "NA" | "EU" | "FE";
export type MarketplaceInfo = {
  marketplace: string; // the x-marketplace value, e.g. "www.amazon.com"
  region: string; // selects the OAuth token endpoint
  group: CreatorsGroup;
  credentialVersion: string;
};

const NA = (marketplace: string): MarketplaceInfo => ({ marketplace, region: "us-east-1", group: "NA", credentialVersion: "3.1" });
const EU = (marketplace: string): MarketplaceInfo => ({ marketplace, region: "eu-south-2", group: "EU", credentialVersion: "4.1" });
const FE = (marketplace: string): MarketplaceInfo => ({ marketplace, region: "us-west-2", group: "FE", credentialVersion: "5.1" });

// Keyed by marketplace host as the extension records it (e.g. "amazon.co.uk").
export const MARKETPLACES: Record<string, MarketplaceInfo> = {
  "amazon.com": NA("www.amazon.com"),
  "amazon.ca": NA("www.amazon.ca"),
  "amazon.com.br": NA("www.amazon.com.br"),
  "amazon.com.mx": NA("www.amazon.com.mx"),

  "amazon.co.uk": EU("www.amazon.co.uk"),
  "amazon.ie": EU("www.amazon.ie"),
  "amazon.de": EU("www.amazon.de"),
  "amazon.fr": EU("www.amazon.fr"),
  "amazon.it": EU("www.amazon.it"),
  "amazon.es": EU("www.amazon.es"),
  "amazon.nl": EU("www.amazon.nl"),
  "amazon.com.be": EU("www.amazon.com.be"),
  "amazon.se": EU("www.amazon.se"),
  "amazon.pl": EU("www.amazon.pl"),
  "amazon.com.tr": EU("www.amazon.com.tr"),
  "amazon.ae": EU("www.amazon.ae"),
  "amazon.sa": EU("www.amazon.sa"),
  "amazon.eg": EU("www.amazon.eg"),

  "amazon.co.jp": FE("www.amazon.co.jp"),
  "amazon.com.au": FE("www.amazon.com.au"),
  "amazon.sg": FE("www.amazon.sg"),
  "amazon.in": FE("www.amazon.in"),
};

export function marketplaceInfo(host: string): MarketplaceInfo | null {
  return MARKETPLACES[String(host ?? "").toLowerCase()] ?? null;
}

// Which credential region group serves a given marketplace host. Callers hold a
// credential set per group (NA/EU/FE); this picks the right one per ASIN.
export function resolveCreatorsApiGroup(host: string): CreatorsGroup | null {
  return marketplaceInfo(host)?.group ?? null;
}

// Creator API credentials for one marketplace, as the vault hands them over.
export type CreatorsCreds = {
  host: string; // marketplace host as recorded by the extension, e.g. "amazon.com"
  partnerTag: string;
  credentialId: string;
  credentialSecret: string;
  credentialVersion: string;
};

// Creators API GetItems accepts at most 10 itemIds per request.
export const GET_ITEMS_MAX = 10;

/* ------------------------------- token cache ------------------------------- */

const TOKEN_TTL_MS = 60 * 60 * 1000;
const TOKEN_SKEW_MS = 30 * 1000;
type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();
const tokenInFlight = new Map<string, Promise<string>>();

// Mint (or reuse a cached) OAuth2 access token via the client_credentials grant.
// Tokens are cached in-memory per client id + endpoint for ~1h with a 30s skew;
// there is no refresh token (client_credentials just re-mints).
async function getAccessToken(creds: CreatorsCreds, region: string): Promise<string> {
  const tokenEndpoint = resolveTokenEndpoint(region, creds.credentialVersion);
  const key = `${tokenEndpoint}::${creds.credentialId}`;
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt - TOKEN_SKEW_MS) return cached.token;

  const existing = tokenInFlight.get(key);
  if (existing) return existing;

  const scope = isLwaCredentialVersion(creds.credentialVersion)
    ? "creatorsapi::default"
    : "creatorsapi/default";
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.credentialId,
    client_secret: creds.credentialSecret,
    scope,
  }).toString();

  const promise = (async () => {
    const res = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text().catch(() => "");
    let payload: { access_token?: string; token?: string; error?: string; error_description?: string } | null = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text ? { error_description: text } : null;
    }
    if (!res.ok) {
      const message = payload?.error_description || payload?.error || `Token request failed with status ${res.status}.`;
      const err = new Error(message) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    const token = payload?.access_token || payload?.token;
    if (!token) throw new Error("Token response did not include an access token.");
    tokenCache.set(key, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
    return token;
  })().finally(() => {
    tokenInFlight.delete(key);
  });

  tokenInFlight.set(key, promise);
  return promise;
}

/* ------------------------------ response types ----------------------------- */

type RawMoney = { displayAmount?: string; amount?: number; currency?: string; currencyCode?: string };
type RawListing = {
  price?: { money?: RawMoney } | null;
  availability?: { message?: string; Message?: string } | null;
  deliveryInfo?: { isPrimeEligible?: boolean } | null;
};
type RawItem = {
  ASIN?: string;
  asin?: string;
  detailPageUrl?: string;
  detailPageURL?: string;
  itemInfo?: {
    title?: { displayValue?: string };
    byLineInfo?: { brand?: { displayValue?: string }; manufacturer?: { displayValue?: string } };
    classifications?: { binding?: { displayValue?: string } };
  };
  images?: { primary?: { medium?: { url?: string; URL?: string }; large?: { url?: string; URL?: string } } };
  browseNodeInfo?: { browseNodes?: Array<{ displayName?: string }> };
  offersV2?: { listings?: RawListing[] };
};
type RawGetItems = {
  errors?: Array<{ code?: string; message?: string }>;
  Errors?: Array<{ Code?: string; Message?: string }>;
  itemsResult?: { items?: RawItem[] };
  ItemsResult?: { Items?: RawItem[] };
};

function emptyItem(marketplace: string, error: string | null, found = false, asin: string | null = null): EnrichedItem {
  return emptyEnrichedItem({ retailer: "amazon", marketplace, error, found, id: asin });
}

function extractItems(body: RawGetItems | null): RawItem[] {
  return body?.itemsResult?.items ?? body?.ItemsResult?.Items ?? [];
}

function firstError(body: RawGetItems | null): { code: string; message: string } | null {
  const lower = body?.errors?.[0];
  const upper = body?.Errors?.[0];
  const code = lower?.code ?? upper?.Code;
  const message = lower?.message ?? upper?.Message;
  if (!code && !message) return null;
  return { code: code ?? "", message: message ?? "" };
}

// Flatten one raw Creators API item into an EnrichedItem for the given
// marketplace. Reads the camelCase response shape (defensively dual-cased where
// Amazon has been observed returning PascalCase).
function normalizeItem(marketplaceHost: string, item: RawItem): EnrichedItem {
  const asin = (item.ASIN || item.asin || "").toUpperCase() || null;
  const listing = item.offersV2?.listings?.[0] ?? null;
  const money = listing?.price?.money ?? null;
  const amount = typeof money?.amount === "number" ? money.amount : null;
  const info = item.itemInfo;
  const image = item.images?.primary?.medium ?? item.images?.primary?.large ?? null;
  return {
    retailer: "amazon",
    marketplace: marketplaceHost,
    asin,
    itemId: asin,
    found: true,
    title: info?.title?.displayValue ?? null,
    brand: info?.byLineInfo?.brand?.displayValue ?? info?.byLineInfo?.manufacturer?.displayValue ?? null,
    priceDisplay: money?.displayAmount ?? null,
    priceCents: amount != null ? Math.round(amount * 100) : null,
    currency: money?.currency ?? money?.currencyCode ?? null,
    availability: listing?.availability?.message ?? listing?.availability?.Message ?? null,
    primeEligible: listing?.deliveryInfo?.isPrimeEligible ?? null,
    binding: info?.classifications?.binding?.displayValue ?? null,
    browseNode: item.browseNodeInfo?.browseNodes?.[0]?.displayName ?? null,
    imageUrl: image?.url ?? image?.URL ?? null,
    detailPageUrl: item.detailPageUrl ?? item.detailPageURL ?? null,
    numReviews: null,
    retailerRank: null,
    error: null,
  };
}

/**
 * Batch variant: a getItems call for up to 10 ASINs returns one EnrichedItem per
 * requested ASIN (order preserved, correlated by ASIN). ASINs the API did not
 * return come back as not-found rows carrying their requested ASIN. Exported for
 * unit testing against a sample payload.
 */
export function normalizeGetItemsBatch(
  marketplaceHost: string,
  raw: unknown,
  requestedAsins: string[],
): EnrichedItem[] {
  const body = raw as RawGetItems;
  const items = extractItems(body);
  const byAsin = new Map<string, EnrichedItem>();
  for (const item of items) {
    const row = normalizeItem(marketplaceHost, item);
    if (row.asin) byAsin.set(row.asin, row);
  }
  // A top-level error with no items applies to the whole batch (bad partner tag,
  // throttling, etc.); NoResults just means the ASINs are not on this store.
  const err = items.length === 0 ? firstError(body) : null;
  const code = err?.code ?? "";
  const notFound = !err || code === "NoResults" || code === "ItemNotAccessible";
  const batchError = notFound ? null : err?.message || code || "Creators API error";
  return requestedAsins.map((asin) => byAsin.get(asin) ?? emptyItem(marketplaceHost, batchError, false, asin));
}

/* --------------------------------- getItems -------------------------------- */

const RETRYABLE_STATUS = new Set([401, 403, 429, 500]);
const MAX_RETRIES = 2;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls Creators API getItems for up to 10 ASINs on one marketplace and returns
 * one EnrichedItem per requested ASIN (order preserved, correlated by ASIN).
 * Network and API errors are captured onto the returned rows rather than thrown,
 * so a single bad marketplace never fails the whole enrichment.
 */
export async function getItems(creds: CreatorsCreds, asins: string[]): Promise<EnrichedItem[]> {
  const ids = asins.slice(0, GET_ITEMS_MAX);
  const info = marketplaceInfo(creds.host);
  if (!info) return ids.map((a) => emptyItem(creds.host, "Unsupported marketplace", false, a));
  if (ids.length === 0) return [];
  if (!creds.partnerTag) return ids.map((a) => emptyItem(creds.host, "Missing partner tag", false, a));

  const url = `https://${CREATORS_HOST}/catalog/v1/getItems`;
  const requestBody = JSON.stringify({
    itemIds: ids,
    resources: CREATORS_RESOURCES,
    partnerTag: creds.partnerTag,
    partnerType: "Associates",
    marketplace: info.marketplace,
  });

  let token: string;
  try {
    token = await getAccessToken(creds, info.region);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Creators API auth failed";
    return ids.map((a) => emptyItem(creds.host, message, false, a));
  }

  // v3.x+ (LWA): Authorization: Bearer <token>
  // v2.x (Cognito): Authorization: Bearer <token>, Version <version>
  const authorization = isLwaCredentialVersion(creds.credentialVersion)
    ? `Bearer ${token}`
    : `Bearer ${token}, Version ${creds.credentialVersion}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-marketplace": info.marketplace,
          "user-agent": "InfluencerButler/CreatorsAPI",
          authorization,
        },
        body: requestBody,
      });
      const json = (await res.json().catch(() => null)) as RawGetItems | null;
      if (res.ok) return normalizeGetItemsBatch(creds.host, json, ids);
      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
        await delay(500 * 2 ** attempt);
        continue;
      }
      const err = firstError(json);
      const detail = err?.message || err?.code || `Creators API HTTP ${res.status}`;
      return ids.map((a) => emptyItem(creds.host, detail, false, a));
    } catch {
      if (attempt < MAX_RETRIES) {
        await delay(500 * 2 ** attempt);
        continue;
      }
      return ids.map((a) => emptyItem(creds.host, "Network error reaching Creators API", false, a));
    }
  }
  return ids.map((a) => emptyItem(creds.host, "Creators API request failed", false, a));
}
