import type { IntegrationAdapter, TestResult } from "../types";
import { PROVIDER_CREDENTIALS_URLS } from "../../shared/constants";
import { REQUEST_TIMEOUT_MS, firstString, obj, providerError, str, taggedUrlFor } from "../adapter-utils";

// Affiliate networks. Levanta and Archer are real API providers: they collect
// the same credentials the desktop app collects (integrations/levantaClient.js,
// integrations/archerClient.js), verify them read-only in test(), and mint a
// real attribution link in generateLink(). Benable is just a referral profile
// url and a routing flag, with no network call.
//
// A network's minted link already encodes attribution, so routing.ts prefers it
// over the generic deeplink wrapper. generateLink always falls back to the plain
// tagged url on any error so a misconfigured network never blocks a link.

// Known-good product ASINs for the read-only connection tests, matching the
// desktop app's test calls.
const LEVANTA_TEST_ASIN = "B003IX0AT2";
const ARCHER_TEST_ASIN = "B0CH1N88Y7";

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

// Best-effort commission-rate reader for a network's product payload. Networks
// rarely surface a per-product rate (the desktop app's extractRate notes the
// same), so this returns null far more often than not; highest-commission
// routing then falls back to priority order. Scans the common field shapes,
// treats a 0-1 value as a fraction, and rejects anything outside (0, 100].
function extractRate(payload: unknown): number | null {
  const p = obj(payload);
  const data = obj(p.data);
  const product = obj(p.product);
  const commission = obj(p.commission);
  const dataCommission = obj(data.commission);
  const raw = [
    p.commissionRate, p.commission_rate, p.commissionPct, p.commission_pct, p.payoutRate, p.payout_rate, p.rate,
    data.commissionRate, data.commission_rate, data.commissionPct, data.commission_pct, data.rate,
    product.commissionRate, product.commission_rate, product.commissionPct, product.rate,
    commission.rate, commission.pct, dataCommission.rate, dataCommission.pct,
  ];
  for (const value of raw) {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(n) || n <= 0) continue;
    const pct = n < 1 ? n * 100 : n;
    if (pct > 0 && pct <= 100) return pct;
  }
  return null;
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
  async estimateRate(target, creds): Promise<number | null> {
    const apiKey = str(creds.apiKey);
    if (!apiKey || !target.asin) return null;
    const params = new URLSearchParams({ marketplace: marketplaceOf(target.marketplace) });
    try {
      const res = await fetch(`${LEVANTA_BASE}/products/${target.asin}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return extractRate(await res.json().catch(() => null));
    } catch {
      return null;
    }
  },
};

// ---------------------------------------------------------------------------
// Archer (api.archeraffiliates.com)
// ---------------------------------------------------------------------------

const ARCHER_BASE = "https://api.archeraffiliates.com";

// Archer sign-in is username + password exchanged for a bearer token at
// /token. A previously saved long-lived token/API key still short-circuits
// (the options UI no longer collects one, but stored credentials keep
// working). Resolve a bearer for a set of credentials, or throw with a
// user-facing reason.
async function archerBearer(creds: Record<string, string>): Promise<string> {
  const token = firstString(creds.token, creds.accessToken, creds.apiKey);
  if (token) return token;
  const username = str(creds.username);
  const password = str(creds.password);
  if (!username || !password) {
    throw new Error("Enter your Archer username and password.");
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
    { name: "username", labelKey: "fieldUsername", type: "text" },
    { name: "password", labelKey: "fieldPassword", type: "password" },
    { name: "marketplace", labelKey: "fieldMarketplace", type: "text", placeholder: "amazon.com", optional: true },
  ],
  async test(creds): Promise<TestResult> {
    if (!firstString(creds.token, creds.accessToken, creds.apiKey) && !(str(creds.username) && str(creds.password))) {
      return { ok: false, message: "Enter your Archer username and password." };
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
  async estimateRate(target, creds): Promise<number | null> {
    if (!target.asin) return null;
    try {
      const bearer = await archerBearer(creds);
      const params = new URLSearchParams({ asin: target.asin, marketplace: marketplaceOf(creds.marketplace) });
      const res = await fetch(`${ARCHER_BASE}/get_single_product?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return extractRate(await res.json().catch(() => null));
    } catch {
      return null;
    }
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
  benableAdapter,
];
