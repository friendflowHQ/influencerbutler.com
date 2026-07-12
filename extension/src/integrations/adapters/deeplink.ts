import type { IntegrationAdapter, LinkTarget, TestResult } from "../types";
import { PROVIDER_CREDENTIALS_URLS } from "../../shared/constants";
import {
  REQUEST_TIMEOUT_MS,
  TEST_TARGET_URL,
  firstString,
  obj,
  providerError,
  str,
  taggedUrlFor,
} from "../adapter-utils";

// Deeplink providers. Two kinds live here:
//
//   * Self-hosted: pure string construction from the user's own link pattern, so
//     it needs no credential and no network call. The user pastes a pattern
//     (encoding their branded domain and account); we validate and apply it. A
//     pattern uses {url} for the affiliate-tagged product url, url-encoded (or
//     {rawurl} for the un-encoded form), plus {tag} and {asin}.
//
//   * URLGenius, Linktw.in, Geniuslink: real API providers. They collect the
//     same credentials the desktop app collects (see integrations/amazon/links
//     in the desktop repo), verify them read-only in test(), and mint a real
//     short link in generateLink(). Credentials are sent only to the provider's
//     own host, which the options page requests as an optional permission before
//     any call. generateLink always falls back to the plain tagged url on any
//     error so a misconfigured provider never blocks copying a working link.

// ---------------------------------------------------------------------------
// Self-hosted (link pattern) provider
// ---------------------------------------------------------------------------

function templateValid(template: string): boolean {
  return template.includes("{url}") || template.includes("{rawurl}");
}

export function applyTemplate(template: string, target: LinkTarget): string {
  const tagged = taggedUrlFor(target);
  return template
    .split("{url}").join(encodeURIComponent(tagged))
    .split("{rawurl}").join(tagged)
    .split("{tag}").join(target.tag ?? "")
    .split("{asin}").join(target.asin);
}

const selfhostedAdapter: IntegrationAdapter = {
  id: "selfhosted",
  labelKey: "provSelfhosted",
  category: "deeplink",
  hosts: [],
  fields: [
    {
      name: "linkTemplate",
      labelKey: "fieldLinkTemplate",
      type: "text",
      placeholder: "https://links.yoursite.com/go?url={url}",
    },
  ],
  async test(creds): Promise<TestResult> {
    const template = str(creds.linkTemplate);
    if (!template) {
      return { ok: true, message: "No link pattern set. Links will carry your affiliate tag only." };
    }
    if (!templateValid(template)) {
      return { ok: false, message: "Add {url} where the product link goes in your pattern." };
    }
    return { ok: true, message: "Link pattern looks valid." };
  },
  async generateLink(target, creds): Promise<string> {
    const template = str(creds.linkTemplate);
    const tagged = taggedUrlFor(target);
    if (!template || !templateValid(template)) return tagged;
    return applyTemplate(template, target);
  },
};

// ---------------------------------------------------------------------------
// URLGenius (api.urlgeni.us)
// ---------------------------------------------------------------------------

const URLGENIUS_ENDPOINT = "https://api.urlgeni.us/api/v2/links";

function extractUrlGeniusShortUrl(payload: unknown): string {
  const p = obj(payload);
  const nestedLink = obj(obj(p.payload).link);
  const link = obj(p.link);
  return firstString(
    nestedLink.genius_url,
    nestedLink.short_url,
    link.genius_url,
    link.short_url,
    p.short_url,
    p.shortUrl,
    p.url,
    typeof p.link === "string" ? p.link : "",
    p.geniuslink,
  );
}

async function urlGeniusCreate(apiKey: string, targetUrl: string): Promise<Response> {
  return fetch(URLGENIUS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({ url: targetUrl, fallback_app_store: true }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

const urlGeniusAdapter: IntegrationAdapter = {
  id: "urlgenius",
  labelKey: "provUrlgenius",
  category: "deeplink",
  hosts: ["https://api.urlgeni.us/*"],
  credentialsUrl: PROVIDER_CREDENTIALS_URLS.urlgenius,
  fields: [{ name: "apiKey", labelKey: "fieldApiKey", type: "password" }],
  async test(creds): Promise<TestResult> {
    const apiKey = str(creds.apiKey);
    if (!apiKey) return { ok: false, message: "Paste your URLGenius API key first." };
    let res: Response;
    try {
      res = await urlGeniusCreate(apiKey, TEST_TARGET_URL);
    } catch {
      return { ok: false, message: "Could not reach URLGenius. Are you online?" };
    }
    if (res.ok) return { ok: true, message: "Connected to URLGenius." };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "URLGenius rejected that key. Check it in your URLGenius account." };
    }
    return { ok: false, message: await providerError(res, `URLGenius returned ${res.status}.`) };
  },
  async generateLink(target, creds): Promise<string> {
    const apiKey = str(creds.apiKey);
    const tagged = taggedUrlFor(target);
    if (!apiKey) return tagged;
    try {
      const res = await urlGeniusCreate(apiKey, tagged);
      if (!res.ok) return tagged;
      return extractUrlGeniusShortUrl(await res.json().catch(() => null)) || tagged;
    } catch {
      return tagged;
    }
  },
};

// ---------------------------------------------------------------------------
// Linktw.in (linktw.in)
// ---------------------------------------------------------------------------

const LINKTWIN_ACCOUNT_ENDPOINT = "https://linktw.in/api/account";
const LINKTWIN_CREATE_ENDPOINT = "https://linktw.in/api/url/add";

function linktwinErrorCode(payload: unknown): number | null {
  const p = obj(payload);
  if (!Object.prototype.hasOwnProperty.call(p, "error")) return null;
  const code = Number(p.error);
  return Number.isFinite(code) ? code : null;
}

function extractLinktwinShortUrl(payload: unknown): string {
  const p = obj(payload);
  return firstString(p.shorturl, p.shortUrl, p.short_url, p.url, typeof p.link === "string" ? p.link : "");
}

const linktwinAdapter: IntegrationAdapter = {
  id: "linktwin",
  labelKey: "provLinktwin",
  category: "deeplink",
  hosts: ["https://linktw.in/*"],
  credentialsUrl: PROVIDER_CREDENTIALS_URLS.linktwin,
  fields: [{ name: "apiKey", labelKey: "fieldApiKey", type: "password" }],
  async test(creds): Promise<TestResult> {
    const apiKey = str(creds.apiKey);
    if (!apiKey) return { ok: false, message: "Paste your Linktw.in API key first." };
    let res: Response;
    try {
      res = await fetch(LINKTWIN_ACCOUNT_ENDPOINT, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, message: "Could not reach Linktw.in. Are you online?" };
    }
    const payload = await res.json().catch(() => null);
    const errorCode = linktwinErrorCode(payload);
    if (res.ok && (errorCode == null || errorCode === 0)) {
      return { ok: true, message: "Connected to Linktw.in." };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Linktw.in rejected that key. Check it in your Linktw.in account." };
    }
    if (res.status === 429) {
      return { ok: false, message: "Key looks valid but Linktw.in is rate limiting. Try again shortly." };
    }
    return { ok: false, message: await providerError(res, `Linktw.in returned ${res.status}.`) };
  },
  async generateLink(target, creds): Promise<string> {
    const apiKey = str(creds.apiKey);
    const tagged = taggedUrlFor(target);
    if (!apiKey) return tagged;
    try {
      const res = await fetch(LINKTWIN_CREATE_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ url: tagged }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return tagged;
      const payload = await res.json().catch(() => null);
      const errorCode = linktwinErrorCode(payload);
      if (errorCode != null && errorCode !== 0) return tagged;
      return extractLinktwinShortUrl(payload) || tagged;
    } catch {
      return tagged;
    }
  },
};

// ---------------------------------------------------------------------------
// Geniuslink (api.geni.us)
// ---------------------------------------------------------------------------

const GENIUSLINK_GROUPS_ENDPOINT = "https://api.geni.us/v1/groups/list";
const GENIUSLINK_CREATE_ENDPOINT = "https://api.geni.us/v3/shorturls";

function isPositiveInteger(value: string): boolean {
  return /^[0-9]+$/.test(value) && Number(value) > 0;
}

function shortUrlFromParts(value: unknown): string {
  const o = obj(value);
  const domain = str(o.domain || o.baseDomain || o.shortDomain)
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  const code = str(o.code || o.baseCode || o.vanityCode || o.slug).replace(/^\/+/, "");
  if (domain && code) return `https://${domain}/${code}`;
  if (code) return `https://geni.us/${code}`;
  return "";
}

function extractGeniusLinkShortUrl(payload: unknown): string {
  const p = obj(payload);
  const data = obj(p.data);
  return firstString(
    shortUrlFromParts(p.shortUrl),
    shortUrlFromParts(p.short_url),
    shortUrlFromParts(data.shortUrl),
    p.shortUrl,
    p.short_url,
    p.geniuslink,
    data.url,
    data.shortUrl,
    p.url,
  );
}

const geniusLinkAdapter: IntegrationAdapter = {
  id: "geniuslink",
  labelKey: "provGeniuslink",
  category: "deeplink",
  hosts: ["https://api.geni.us/*"],
  credentialsUrl: PROVIDER_CREDENTIALS_URLS.geniuslink,
  fields: [
    { name: "apiKey", labelKey: "fieldApiKey", type: "password" },
    { name: "apiSecret", labelKey: "fieldApiSecret", type: "password" },
    { name: "groupId", labelKey: "fieldGroupId", type: "text" },
  ],
  async test(creds): Promise<TestResult> {
    const apiKey = str(creds.apiKey);
    const apiSecret = str(creds.apiSecret);
    const groupId = str(creds.groupId);
    if (!apiKey || !apiSecret) return { ok: false, message: "Enter your Geniuslink API key and secret." };
    if (!groupId) return { ok: false, message: "Enter your Geniuslink group id." };
    if (!isPositiveInteger(groupId)) return { ok: false, message: "Group id must be a positive number." };
    let res: Response;
    try {
      // Listing groups requires auth but creates nothing, and lets us confirm
      // the configured group id exists in this account.
      res = await fetch(GENIUSLINK_GROUPS_ENDPOINT, {
        method: "GET",
        headers: { "X-Api-Key": apiKey, "X-Api-Secret": apiSecret, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, message: "Could not reach Geniuslink. Are you online?" };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Geniuslink rejected that key or secret. Check them in your Geniuslink account." };
    }
    if (!res.ok) {
      return { ok: false, message: await providerError(res, `Geniuslink returned ${res.status}.`) };
    }
    const payload = obj(await res.json().catch(() => null));
    const groups = Array.isArray(payload.Groups) ? payload.Groups : null;
    if (groups) {
      const found = groups.some((g) => str(obj(g).Id) === groupId);
      if (!found) {
        return {
          ok: false,
          message: `Key and secret are valid, but group ${groupId} was not found in this Geniuslink account.`,
        };
      }
    }
    return { ok: true, message: "Connected to Geniuslink." };
  },
  async generateLink(target, creds): Promise<string> {
    const apiKey = str(creds.apiKey);
    const apiSecret = str(creds.apiSecret);
    const groupId = str(creds.groupId);
    const tagged = taggedUrlFor(target);
    if (!apiKey || !apiSecret || !groupId) return tagged;
    try {
      const res = await fetch(GENIUSLINK_CREATE_ENDPOINT, {
        method: "POST",
        headers: {
          "X-Api-Key": apiKey,
          "X-Api-Secret": apiSecret,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ url: tagged, groupId }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return tagged;
      const shortUrl = extractGeniusLinkShortUrl(await res.json().catch(() => null));
      return shortUrl && shortUrl !== tagged ? shortUrl : tagged;
    } catch {
      return tagged;
    }
  },
};

export const deeplinkAdapters: IntegrationAdapter[] = [
  linktwinAdapter,
  urlGeniusAdapter,
  geniusLinkAdapter,
  selfhostedAdapter,
];
