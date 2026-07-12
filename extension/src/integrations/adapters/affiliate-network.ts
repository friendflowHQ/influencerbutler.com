import type { IntegrationAdapter, TestResult } from "../types";
import { PROVIDER_CREDENTIALS_URLS } from "../../shared/constants";
import { REQUEST_TIMEOUT_MS, firstString, obj, providerError, str, taggedUrlFor } from "../adapter-utils";

// Affiliate networks. Levanta and Archer are real API providers: they collect
// the same credentials the desktop app collects (integrations/levantaClient.js,
// integrations/archerClient.js), verify them read-only in test(), and mint a
// real attribution link in generateLink(). Logie collects its key/secret and
// verifies them read-only, but does not mint its own link (desktop parity: its
// attribution routes through the primary deeplink provider). Benable is just a
// referral profile url and a routing flag, with no network call.
//
// A network's minted link already encodes attribution, so routing.ts prefers it
// over the generic deeplink wrapper. generateLink always falls back to the plain
// tagged url on any error so a misconfigured network never blocks a link.

// Known-good product ASINs for the read-only connection tests, matching the
// desktop app's test calls.
const LEVANTA_TEST_ASIN = "B003IX0AT2";
const ARCHER_TEST_ASIN = "B0CMCKV5N2";

function marketplaceOf(value: unknown, fallback = "amazon.com"): string {
  return str(value) || fallback;
}

// Pull a usable attribution/deeplink url out of a network's create-link payload,
// covering the field shapes the desktop clients accept.
function extractNetworkLink(payload: unknown): string {
  const p = obj(payload);
  const link = obj(p.link);
  const data = obj(p.data);
  const dataLink = obj(data.link);
  return firstString(
    typeof p.link === "string" ? p.link : "",
    p.deeplink,
    p.deeplink_url,
    p.attribution_link,
    p.attributionLink,
    p.url,
    p.shortUrl,
    p.short_url,
    link.url,
    link.deeplink,
    typeof data.link === "string" ? data.link : "",
    data.deeplink,
    data.deeplink_url,
    data.attribution_link,
    data.url,
    dataLink.url,
    dataLink.deeplink,
  );
}

// ---------------------------------------------------------------------------
// Levanta (app.levanta.io)
// ---------------------------------------------------------------------------

const LEVANTA_BASE = "https://app.levanta.io/api/creator/v1";

const levantaAdapter: IntegrationAdapter = {
  id: "levanta",
  labelKey: "provLevanta",
  category: "affiliateNetwork",
  hosts: ["https://app.levanta.io/*"],
  credentialsUrl: PROVIDER_CREDENTIALS_URLS.levanta,
  fields: [
    { name: "apiKey", labelKey: "fieldApiKey", type: "password" },
    { name: "marketplace", labelKey: "fieldMarketplace", type: "text", placeholder: "amazon.com", optional: true },
  ],
  async test(creds): Promise<TestResult> {
    const apiKey = str(creds.apiKey);
    if (!apiKey) return { ok: false, message: "Paste your Levanta API key first." };
    const marketplace = marketplaceOf(creds.marketplace);
    const params = new URLSearchParams({ marketplace });
    let res: Response;
    try {
      res = await fetch(`${LEVANTA_BASE}/products/${LEVANTA_TEST_ASIN}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, message: "Could not reach Levanta. Are you online?" };
    }
    // A 404 means the key authenticated but that ASIN is not in Levanta, which
    // still confirms the connection works.
    if (res.ok || res.status === 404) return { ok: true, message: "Connected to Levanta." };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Levanta rejected that key. Check it in your Levanta account." };
    }
    if (res.status === 429) {
      return { ok: false, message: "Key looks valid but Levanta is rate limiting. Try again shortly." };
    }
    return { ok: false, message: await providerError(res, `Levanta returned ${res.status}.`) };
  },
  async generateLink(target, creds): Promise<string> {
    const apiKey = str(creds.apiKey);
    const tagged = taggedUrlFor(target);
    if (!apiKey || !target.asin) return tagged;
    try {
      const res = await fetch(`${LEVANTA_BASE}/links`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          marketplace: marketplaceOf(target.marketplace),
          asin: target.asin,
          source_id: "extension",
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return tagged;
      return extractNetworkLink(await res.json().catch(() => null)) || tagged;
    } catch {
      return tagged;
    }
  },
};

// ---------------------------------------------------------------------------
// Archer (api.archeraffiliates.com)
// ---------------------------------------------------------------------------

const ARCHER_BASE = "https://api.archeraffiliates.com";

// Archer is dual-mode: either a long-lived token/API key, or a username +
// password exchanged for a bearer token at /token. Resolve a bearer for a set
// of credentials, or throw with a user-facing reason.
async function archerBearer(creds: Record<string, string>): Promise<string> {
  const token = firstString(creds.token, creds.accessToken, creds.apiKey);
  if (token) return token;
  const username = str(creds.username);
  const password = str(creds.password);
  if (!username || !password) {
    throw new Error("Enter an Archer token, or a username and password.");
  }
  const body = new URLSearchParams({ grant_type: "password", username, password }).toString();
  const res = await fetch(`${ARCHER_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(await providerError(res, "Archer rejected that username or password."));
  }
  const payload = obj(await res.json().catch(() => null));
  const bearer = firstString(payload.access_token, payload.token, payload.jwt, obj(payload.data).access_token);
  if (!bearer) throw new Error("Archer did not return an access token.");
  return bearer;
}

const archerAdapter: IntegrationAdapter = {
  id: "archer",
  labelKey: "provArcher",
  category: "affiliateNetwork",
  hosts: ["https://api.archeraffiliates.com/*"],
  credentialsUrl: PROVIDER_CREDENTIALS_URLS.archer,
  fields: [
    { name: "token", labelKey: "fieldToken", type: "password", optional: true },
    { name: "username", labelKey: "fieldUsername", type: "text", optional: true },
    { name: "password", labelKey: "fieldPassword", type: "password", optional: true },
    { name: "marketplace", labelKey: "fieldMarketplace", type: "text", placeholder: "amazon.com", optional: true },
  ],
  async test(creds): Promise<TestResult> {
    if (!firstString(creds.token, creds.accessToken, creds.apiKey) && !(str(creds.username) && str(creds.password))) {
      return { ok: false, message: "Enter an Archer token, or a username and password." };
    }
    let bearer: string;
    try {
      bearer = await archerBearer(creds);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Archer credentials were rejected." };
    }
    const params = new URLSearchParams({ asin: ARCHER_TEST_ASIN, marketplace: marketplaceOf(creds.marketplace) });
    let res: Response;
    try {
      res = await fetch(`${ARCHER_BASE}/get_single_product?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, message: "Could not reach Archer. Are you online?" };
    }
    // 404 means the credentials authenticated but that ASIN is not in Archer's
    // catalog, which still confirms the connection works.
    if (res.ok || res.status === 404) return { ok: true, message: "Connected to Archer." };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Archer rejected those credentials. Check them in your Archer account." };
    }
    return { ok: false, message: await providerError(res, `Archer returned ${res.status}.`) };
  },
  async generateLink(target, creds): Promise<string> {
    const tagged = taggedUrlFor(target);
    if (!target.asin) return tagged;
    try {
      const bearer = await archerBearer(creds);
      const res = await fetch(`${ARCHER_BASE}/generate_attribution_link`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ asin: target.asin, link_name: `extension-${target.asin}` }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return tagged;
      return extractNetworkLink(await res.json().catch(() => null)) || tagged;
    } catch {
      return tagged;
    }
  },
};

// ---------------------------------------------------------------------------
// Logie (api.logie.ai) - verify only, no minting
// ---------------------------------------------------------------------------

const LOGIE_BASE = "https://api.logie.ai";

const logieAdapter: IntegrationAdapter = {
  id: "logie",
  labelKey: "provLogie",
  category: "affiliateNetwork",
  hosts: ["https://api.logie.ai/*"],
  credentialsUrl: PROVIDER_CREDENTIALS_URLS.logie,
  fields: [
    { name: "apiKey", labelKey: "fieldApiKey", type: "password" },
    { name: "apiSecret", labelKey: "fieldApiSecret", type: "password" },
  ],
  async test(creds): Promise<TestResult> {
    const apiKey = str(creds.apiKey);
    const apiSecret = str(creds.apiSecret);
    if (!apiKey || !apiSecret) return { ok: false, message: "Enter your Logie API key and secret." };
    let res: Response;
    try {
      res = await fetch(LOGIE_BASE, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "x-api-key": apiKey,
          "x-api-secret": apiSecret,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, message: "Could not reach Logie. Are you online?" };
    }
    if (res.ok) return { ok: true, message: "Connected to Logie." };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Logie rejected that key or secret. Check them in your Logie account." };
    }
    return { ok: false, message: await providerError(res, `Logie returned ${res.status}.`) };
  },
};

// ---------------------------------------------------------------------------
// Benable (referral profile, routing-only)
// ---------------------------------------------------------------------------

const benableAdapter: IntegrationAdapter = {
  id: "benable",
  labelKey: "provBenable",
  category: "affiliateNetwork",
  hosts: [],
  fields: [
    { name: "referralUrl", labelKey: "fieldReferralUrl", type: "text", placeholder: "https://benable.com/you" },
  ],
  async test(creds): Promise<TestResult> {
    const value = str(creds.referralUrl);
    if (!value) return { ok: false, message: "Enter your Benable referral link to connect." };
    return { ok: true, message: "Saved. Attribution links route through your primary deeplink provider." };
  },
};

export const affiliateNetworkAdapters: IntegrationAdapter[] = [
  levantaAdapter,
  archerAdapter,
  logieAdapter,
  benableAdapter,
];
