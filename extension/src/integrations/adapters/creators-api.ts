import type { IntegrationAdapter, TestResult } from "../types";
import { amzDate, signPaapi } from "../sigv4";
import { ASSOCIATES_CREDENTIALS_URL } from "../../shared/constants";

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

const DEFAULT_DOMAIN = "www.amazon.com";
const DEFAULT_ENDPOINT = { host: "webservices.amazon.com", region: "us-east-1" };

// Clean a pasted partner tag. A real Associates tracking id looks like `tag-20`
// with no leading `@` and no spaces; people routinely paste an `@handle` or a
// value with a stray space/line break. We strip a leading `@` and every
// whitespace character (tags never contain spaces) so a pasted `@littleprettyl-20`
// still connects. Case is preserved: tracking ids are case-sensitive.
export function normalizePartnerTag(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "");
}

// Normalize a user-entered marketplace into a `www.`-prefixed Amazon domain that
// matches the ENDPOINTS keys. Accepts a bare host (amazon.com), a www. host, a
// pasted store URL, the aliases us/usa, or a blank field (the field is optional,
// so blank means US). Mirrors the desktop app's marketplace handling and closes
// the bug where an empty value became the invalid Marketplace param "www.".
export function normalizeMarketplace(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim().toLowerCase();
  if (!trimmed || trimmed === "us" || trimmed === "usa") return DEFAULT_DOMAIN;
  const host = trimmed.replace(/^https?:\/\//, "").split("/")[0];
  if (!host) return DEFAULT_DOMAIN;
  return host.startsWith("www.") ? host : `www.${host}`;
}

function endpointFor(
  marketplace: string | null | undefined,
): { host: string; region: string; domain: string } {
  const domain = normalizeMarketplace(marketplace);
  const match = ENDPOINTS[domain];
  // Unknown store: fall back to a fully-consistent US config so the Marketplace
  // body param, Host, and Region never disagree.
  if (!match) return { ...DEFAULT_ENDPOINT, domain: DEFAULT_DOMAIN };
  return { ...match, domain };
}

// A local sanity check on the pasted keys, run before we ever hit Amazon. The two
// most common support tickets on this card are (a) pasting the newer Creators-API
// OAuth client id / an AWS-IAM key into the Access key box and (b) a secret that
// got a space or line break on paste. Both come back from Amazon as the misleading
// "The Access Key ID ... invalid.", so naming the real cause up front saves a
// confusing round-trip. PA-API access keys are 20 uppercase alphanumerics (usually
// starting AKIA/ASIA); the secret is a 40-char token.
export function precheckCredentials(accessKey: string, secretKey: string): string | null {
  if (/\s/.test(accessKey)) {
    return "Your access key has a space or line break in it. Re-copy just the key, with no surrounding text.";
  }
  if (/\s/.test(secretKey)) {
    return "Your secret key has a space or line break in it. Re-copy just the secret, with no surrounding text.";
  }
  // The newer Amazon Creators API issues an OAuth client id like
  // "amzn1.application-oa2-client..."; it is not a PA-API access key and Amazon
  // rejects it as an invalid Access Key ID. Any dot is a strong tell here.
  if (/^amzn1\./i.test(accessKey) || accessKey.includes(".")) {
    return "This looks like a Creators-API client id, not a Product Advertising API access key. This card needs the Access Key and Secret Key from Associates Central: Tools: Product Advertising API.";
  }
  if (accessKey.length < 16 || accessKey.length > 32) {
    return "That access key is not the length of a Product Advertising API key (about 20 characters). Copy the Access Key from Associates Central: Tools: Product Advertising API, not an AWS or IAM key.";
  }
  if (secretKey.length < 30) {
    return "That secret key looks too short. Copy the full Secret Key (about 40 characters) from Associates Central: Tools: Product Advertising API.";
  }
  return null;
}

// Map Amazon's own error (status + PA-API error code + message) to a plain next
// step. Amazon returns the same misleading "Access Key ID ... invalid" for several
// distinct causes, so we key off the code/message and tell the user which one it
// is. Returns null when we have no better wording than Amazon's own message.
export function guidanceFor(status: number, code: string, message: string): string | null {
  const c = code.toLowerCase();
  const m = message.toLowerCase();
  // Clock skew is checked before the signature branch: Amazon phrases an expired
  // request as "Signature expired ...", which would otherwise be mistaken for a
  // wrong secret key.
  if (c.includes("requestexpired") || m.includes("expired") || m.includes("skewed") || m.includes("timestamp") || m.includes("too far")) {
    return "Your computer clock looks out of sync, so Amazon rejected the request time. Turn on automatic date and time, then try again.";
  }
  if (c.includes("unrecognizedclient") || m.includes("access key id") || m.includes("security token")) {
    return "Amazon does not recognize this access key. Re-copy the Access Key and Secret Key from Associates Central: Tools: Product Advertising API (not an AWS or IAM key, and not the newer Creators-API client id or secret), and check for stray spaces.";
  }
  if (c.includes("incompletesignature") || c.includes("signaturedoesnotmatch") || m.includes("signature")) {
    return "The request signature did not match, which almost always means the secret key is wrong or was cut off. Paste the full Secret Key again.";
  }
  if (c.includes("invalidpartnertag") || m.includes("partner tag") || m.includes("not registered")) {
    return "Amazon did not accept the partner tag. Use your Associates tracking id (like tag-20) with no '@', and make sure it belongs to this marketplace.";
  }
  if (status === 429 || c.includes("toomanyrequests") || c.includes("throttl")) {
    return "Amazon throttled the request. The keys may be valid, but a new Product Advertising API account has to make a few qualifying sales before Amazon returns data. Try again later.";
  }
  return null;
}

async function test(creds: Record<string, string>): Promise<TestResult> {
  const accessKey = (creds.accessKey ?? "").trim();
  const secretKey = (creds.secretKey ?? "").trim();
  const partnerTag = normalizePartnerTag(creds.partnerTag);
  if (!accessKey || !secretKey || !partnerTag) {
    return { ok: false, message: "Enter your access key, secret key, and partner tag." };
  }
  const precheck = precheckCredentials(accessKey, secretKey);
  if (precheck) return { ok: false, message: precheck };
  const { host, region, domain } = endpointFor(creds.marketplace);
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
    const { code, detail } = await readError(res);
    const guidance = guidanceFor(res.status, code, detail);
    if (guidance) {
      // Lead with the actionable step, but keep Amazon's own wording below it so
      // nothing is hidden and a rare error stays diagnosable.
      return { ok: false, message: detail ? `${guidance}\n\nAmazon said: ${detail}` : guidance };
    }
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

// Pull both the PA-API error code and human message out of a failed response.
// PA-API business errors arrive as { Errors: [{ Code, Message }] }, but AWS-level
// auth failures (the "Access Key ID ... invalid" case) arrive as
// { __type: "...#UnrecognizedClientException", message: "..." }, so we read both
// shapes.
async function readError(res: Response): Promise<{ code: string; detail: string }> {
  try {
    const data = (await res.json()) as {
      Errors?: Array<{ Code?: string; Message?: string }>;
      __type?: string;
      message?: string;
      Message?: string;
    };
    const first = data.Errors?.[0];
    const code = first?.Code ?? data.__type ?? "";
    const detail = first?.Message ?? data.message ?? data.Message ?? "";
    return { code, detail };
  } catch {
    return { code: "", detail: "" };
  }
}

export const creatorsApiAdapter: IntegrationAdapter = {
  id: "creatorsApi",
  labelKey: "provCreatorsApi",
  category: "productData",
  hosts: PAAPI_HOST_PATTERNS,
  // The card is named "Creators API" to match the desktop app, but it is really
  // the Product Advertising API v5: it needs the Access Key + Secret Key from
  // Associates Central, not the newer Creators-API client id/secret. Spelling
  // that out prevents the wrong-credential paste that Amazon reports as an
  // invalid Access Key ID.
  descriptionKey: "creatorsApiHint",
  // Access key, secret key, and partner tag all live on the Associates
  // credentials page, same destination as the desktop app's "Show me where".
  credentialsUrl: ASSOCIATES_CREDENTIALS_URL,
  fields: [
    { name: "accessKey", labelKey: "fieldAccessKey", type: "password" },
    { name: "secretKey", labelKey: "fieldSecretKey", type: "password" },
    {
      name: "partnerTag",
      labelKey: "fieldPartnerTag",
      type: "text",
      placeholder: "mytag-20",
      normalize: normalizePartnerTag,
    },
    { name: "marketplace", labelKey: "fieldMarketplace", type: "text", placeholder: "www.amazon.com", optional: true },
  ],
  test,
};
