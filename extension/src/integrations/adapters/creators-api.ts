import type { IntegrationAdapter, TestResult } from "../types";
import { amzDate, signPaapi } from "../sigv4";

// Amazon Product Advertising API v5 (what the desktop app calls the "Creators
// API" for product data). Test is a read-only SearchItems call, signed with
// SigV4 and sent straight to the regional webservices.amazon.* host.
//
// Note: PA-API access requires an approved Associates account with recent
// qualifying sales; a valid key on a not-yet-approved account returns a
// TooManyRequests/AccessDenied style error rather than 401, which we surface.

const SERVICE = "ProductAdvertisingAPI";
const SEARCH_PATH = "/paapi5/searchitems";
const SEARCH_TARGET = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems";

// Amazon marketplace domain -> PA-API host + signing region.
const ENDPOINTS: Record<string, { host: string; region: string }> = {
  "www.amazon.com": { host: "webservices.amazon.com", region: "us-east-1" },
  "www.amazon.ca": { host: "webservices.amazon.ca", region: "us-east-1" },
  "www.amazon.com.mx": { host: "webservices.amazon.com.mx", region: "us-east-1" },
  "www.amazon.com.br": { host: "webservices.amazon.com.br", region: "us-east-1" },
  "www.amazon.co.uk": { host: "webservices.amazon.co.uk", region: "eu-west-1" },
  "www.amazon.de": { host: "webservices.amazon.de", region: "eu-west-1" },
  "www.amazon.fr": { host: "webservices.amazon.fr", region: "eu-west-1" },
  "www.amazon.it": { host: "webservices.amazon.it", region: "eu-west-1" },
  "www.amazon.es": { host: "webservices.amazon.es", region: "eu-west-1" },
  "www.amazon.nl": { host: "webservices.amazon.nl", region: "eu-west-1" },
  "www.amazon.se": { host: "webservices.amazon.se", region: "eu-west-1" },
  "www.amazon.pl": { host: "webservices.amazon.pl", region: "eu-west-1" },
  "www.amazon.com.tr": { host: "webservices.amazon.com.tr", region: "eu-west-1" },
  "www.amazon.ae": { host: "webservices.amazon.ae", region: "eu-west-1" },
  "www.amazon.sa": { host: "webservices.amazon.sa", region: "eu-west-1" },
  "www.amazon.in": { host: "webservices.amazon.in", region: "eu-west-1" },
  "www.amazon.co.jp": { host: "webservices.amazon.co.jp", region: "us-west-2" },
  "www.amazon.com.au": { host: "webservices.amazon.com.au", region: "us-west-2" },
  "www.amazon.sg": { host: "webservices.amazon.sg", region: "us-west-2" },
};

// Match patterns for every regional PA-API host, for optional_host_permissions.
export const PAAPI_HOST_PATTERNS: string[] = Object.values(ENDPOINTS).map(
  (e) => `https://${e.host}/*`,
);

const DEFAULT_ENDPOINT = { host: "webservices.amazon.com", region: "us-east-1" };

function endpointFor(marketplace: string): { host: string; region: string; domain: string } {
  const domain = marketplace.startsWith("www.") ? marketplace : `www.${marketplace}`;
  const match = ENDPOINTS[domain] ?? DEFAULT_ENDPOINT;
  return { ...match, domain };
}

async function test(creds: Record<string, string>): Promise<TestResult> {
  const accessKey = (creds.accessKey ?? "").trim();
  const secretKey = (creds.secretKey ?? "").trim();
  const partnerTag = (creds.partnerTag ?? "").trim();
  if (!accessKey || !secretKey || !partnerTag) {
    return { ok: false, message: "Enter your access key, secret key, and partner tag." };
  }
  const { host, region, domain } = endpointFor(creds.marketplace ?? "www.amazon.com");
  const body = JSON.stringify({
    Keywords: "gift",
    SearchIndex: "All",
    ItemCount: 1,
    Resources: ["ItemInfo.Title"],
    PartnerTag: partnerTag,
    PartnerType: "Associates",
    Marketplace: domain,
  });
  try {
    const signed = await signPaapi({
      accessKey,
      secretKey,
      host,
      region,
      service: SERVICE,
      path: SEARCH_PATH,
      target: SEARCH_TARGET,
      body,
      amzDate: amzDate(new Date().toISOString()),
    });
    const res = await fetch(signed.url, { method: "POST", headers: signed.headers, body: signed.body });
    if (res.ok) return { ok: true, message: "Connected to the Amazon Product Advertising API." };
    const detail = await readError(res);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: detail || "Amazon rejected those credentials." };
    }
    if (res.status === 429) {
      return {
        ok: false,
        message:
          detail || "Throttled by Amazon. Credentials may be valid but your account needs recent sales to use PA-API.",
      };
    }
    return { ok: false, message: detail || `Amazon returned ${res.status}.` };
  } catch {
    return { ok: false, message: "Could not reach the Amazon API. Are you online?" };
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { Errors?: Array<{ Message?: string }>; message?: string };
    return data.Errors?.[0]?.Message ?? data.message ?? "";
  } catch {
    return "";
  }
}

export const creatorsApiAdapter: IntegrationAdapter = {
  id: "creatorsApi",
  labelKey: "provCreatorsApi",
  category: "productData",
  hosts: PAAPI_HOST_PATTERNS,
  fields: [
    { name: "accessKey", labelKey: "fieldAccessKey", type: "password" },
    { name: "secretKey", labelKey: "fieldSecretKey", type: "password" },
    { name: "partnerTag", labelKey: "fieldPartnerTag", type: "text", placeholder: "mytag-20" },
    { name: "marketplace", labelKey: "fieldMarketplace", type: "text", placeholder: "www.amazon.com", optional: true },
  ],
  test,
};
