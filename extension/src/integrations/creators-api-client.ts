// Browser-side OAuth2 client for the Amazon Creators API, the same API the
// desktop app uses. An OAuth2 client_credentials grant mints a short-lived
// Bearer token, which authorizes POST calls to
// https://creatorsapi.amazon/catalog/v1/*. There is no request signing and no
// AWS Access Key / Secret Key. Runs in the background service worker, which
// holds the host permissions for the token endpoints and the catalog host.
//
// Kept in step with the server client in src/lib/creators-api.ts.

const CREATORS_HOST = "creatorsapi.amazon";

// Region -> OAuth token endpoint. v3.x+ credentials use Login with Amazon;
// v2.x credentials use Amazon Cognito.
const LWA_REGION_TOKEN_ENDPOINTS: Record<string, string> = {
  "us-east-1": "https://api.amazon.com/auth/o2/token",
  "eu-south-2": "https://api.amazon.co.uk/auth/o2/token",
  "us-west-2": "https://api.amazon.co.jp/auth/o2/token",
};
const LWA_DEFAULT_TOKEN_ENDPOINT = "https://api.amazon.com/auth/o2/token";

export function isLwaCredentialVersion(credentialVersion: string): boolean {
  const major = Number.parseInt(String(credentialVersion ?? "").trim(), 10);
  return Number.isFinite(major) && major >= 3;
}

function tokenEndpointFor(region: string, credentialVersion: string): string {
  const r = String(region ?? "").trim();
  if (isLwaCredentialVersion(credentialVersion)) {
    return LWA_REGION_TOKEN_ENDPOINTS[r] ?? LWA_DEFAULT_TOKEN_ENDPOINT;
  }
  return `https://creatorsapi.auth.${r || "us-east-1"}.amazoncognito.com/oauth2/token`;
}

export type CreatorsGroup = "NA" | "EU" | "FE";
export type CreatorsMarketplaceInfo = {
  marketplace: string; // x-marketplace value, e.g. "www.amazon.com"
  region: string;
  group: CreatorsGroup;
  credentialVersion: string;
};

const NA = (m: string): CreatorsMarketplaceInfo => ({ marketplace: m, region: "us-east-1", group: "NA", credentialVersion: "3.1" });
const EU = (m: string): CreatorsMarketplaceInfo => ({ marketplace: m, region: "eu-south-2", group: "EU", credentialVersion: "4.1" });
const FE = (m: string): CreatorsMarketplaceInfo => ({ marketplace: m, region: "us-west-2", group: "FE", credentialVersion: "5.1" });

// Keyed by marketplace host as recorded elsewhere in the extension (no www.).
export const CREATORS_MARKETPLACES: Record<string, CreatorsMarketplaceInfo> = {
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

// Match patterns for optional_host_permissions: the catalog host plus every
// OAuth token endpoint. Anything here must also appear in static/manifest.json.
export const CREATORS_HOST_PATTERNS: string[] = [
  `https://${CREATORS_HOST}/*`,
  "https://api.amazon.com/*",
  "https://api.amazon.co.uk/*",
  "https://api.amazon.co.jp/*",
  "https://creatorsapi.auth.us-east-1.amazoncognito.com/*",
  "https://creatorsapi.auth.eu-south-2.amazoncognito.com/*",
  "https://creatorsapi.auth.us-west-2.amazoncognito.com/*",
];

// Normalize a user-entered marketplace into a `www.`-prefixed Amazon domain used
// as the x-marketplace value. Accepts a bare host, a www. host, a pasted store
// URL, the aliases us/usa, or blank (defaults to US).
export function normalizeMarketplace(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim().toLowerCase();
  if (!trimmed || trimmed === "us" || trimmed === "usa") return "www.amazon.com";
  const host = trimmed.replace(/^https?:\/\//, "").split("/")[0];
  if (!host) return "www.amazon.com";
  return host.startsWith("www.") ? host : `www.${host}`;
}

// Look up the region/version/group for a marketplace value (host or www. host).
export function marketplaceInfoFor(marketplace: string | null | undefined): CreatorsMarketplaceInfo {
  const domain = normalizeMarketplace(marketplace);
  const bare = domain.replace(/^www\./, "");
  return CREATORS_MARKETPLACES[bare] ?? NA("www.amazon.com");
}

export type CreatorsCredsInput = {
  credentialId: string;
  credentialSecret: string;
  credentialVersion?: string;
  partnerTag: string;
  marketplace?: string;
};

// Mint an OAuth2 access token via the client_credentials grant. Throws on
// failure with the OAuth error_description where Amazon provides one.
export async function mintCreatorsToken(input: {
  credentialId: string;
  credentialSecret: string;
  credentialVersion: string;
  region: string;
}): Promise<string> {
  const endpoint = tokenEndpointFor(input.region, input.credentialVersion);
  const scope = isLwaCredentialVersion(input.credentialVersion) ? "creatorsapi::default" : "creatorsapi/default";
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: input.credentialId,
    client_secret: input.credentialSecret,
    scope,
  }).toString();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const text = await res.text().catch(() => "");
  let payload: { access_token?: string; token?: string; error?: string; error_description?: string } | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text ? { error_description: text } : null;
  }
  if (!res.ok) {
    const message = payload?.error_description || payload?.error || `Token request failed (${res.status}).`;
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = payload?.error;
    throw err;
  }
  const token = payload?.access_token || payload?.token;
  if (!token) throw new Error("Token response did not include an access token.");
  return token;
}

// A single getItems probe used by Test Connection: proves the partner tag and
// that Creator API access is unlocked. Returns the raw fetch Response.
export async function creatorsGetItems(
  token: string,
  input: { credentialVersion: string; marketplace: string; partnerTag: string; itemIds: string[]; resources?: string[] },
): Promise<Response> {
  const authorization = isLwaCredentialVersion(input.credentialVersion)
    ? `Bearer ${token}`
    : `Bearer ${token}, Version ${input.credentialVersion}`;
  return fetch(`https://${CREATORS_HOST}/catalog/v1/getItems`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-marketplace": input.marketplace,
      "user-agent": "InfluencerButler/CreatorsAPI",
      authorization,
    },
    body: JSON.stringify({
      itemIds: input.itemIds,
      resources: input.resources ?? ["itemInfo.title"],
      partnerTag: input.partnerTag,
      partnerType: "Associates",
      marketplace: input.marketplace,
    }),
  });
}
