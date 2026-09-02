// Google Search Console API client (server-only, zero dependencies).
//
// Shows the actual search TERMS people find the site with, which GA4 cannot:
// Google strips query keywords from Analytics, but Search Console exposes them
// (query, clicks, impressions, CTR, average position).
//
// Auth mirrors src/lib/ga4.ts: the SAME service account (GA_SERVICE_ACCOUNT_JSON)
// signs a JWT with node:crypto and exchanges it for a token. The only
// differences are the OAuth scope (webmasters.readonly) and the endpoint, so we
// keep a small self-contained mint here rather than reworking ga4's exports
// (its buildJwtParts hardcodes the analytics scope).
//
// Env:
//   GA_SERVICE_ACCOUNT_JSON  reused from ga4.ts (readServiceAccount)
//   GSC_SITE_URL             the verified Search Console property, e.g.
//                            "sc-domain:influencerbutler.com" or
//                            "https://www.influencerbutler.com/"
//
// Setup on Google's side: verify the site in Search Console, then add the
// service-account email under Settings > Users and permissions (Restricted is
// enough), and enable the "Google Search Console API" in the Cloud project.
//
// Quota care: the route caches the summary in app_config for an hour. Every
// function degrades to null instead of throwing.

import { createSign } from "node:crypto";
import { readServiceAccount } from "@/lib/ga4";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const SEARCH_API = "https://searchconsole.googleapis.com/webmasters/v3";

export function gscSiteUrl(): string | null {
  const raw = (process.env.GSC_SITE_URL ?? "").trim();
  return raw.length > 0 ? raw : null;
}

export function isGscConfigured(): boolean {
  return gscSiteUrl() !== null && readServiceAccount() !== null;
}

// ---------------------------------------------------------------------------
// OAuth token (module-level cache; a cold start just re-mints, which is cheap)
// ---------------------------------------------------------------------------

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

let cachedToken: { token: string; expiresAtMs: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const account = readServiceAccount();
  if (!account) return null;

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - now > 5 * 60 * 1000) {
    return cachedToken.token;
  }

  try {
    const nowSeconds = Math.floor(now / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claims = {
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    };
    const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    const signature = signer.sign(account.private_key).toString("base64url");
    const assertion = `${unsigned}.${signature}`;

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!res.ok) {
      console.error("gsc: token exchange failed", res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    cachedToken = {
      token: json.access_token,
      expiresAtMs: now + (json.expires_in ?? 3600) * 1000,
    };
    return cachedToken.token;
  } catch (err) {
    console.error("gsc: token minting threw", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type GscRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscSummary = {
  topQueries: GscRow[];
  topPages: GscRow[];
};

type ApiRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

// One dimension query either yields rows or fails with a human-readable reason.
// The reason is what makes the admin panel self-diagnosing instead of just
// saying "did not respond".
type DimensionResult = { rows: GscRow[] | null; error: string | null };

// Turn Google's HTTP status + JSON body into a short admin-facing sentence.
// Google returns { error: { code, message, status } }; we lead with the message
// because it names the exact cause (permission, unknown property, API disabled).
function describeGscError(status: number, body: string): string {
  let message = "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    message = parsed.error?.message?.trim() ?? "";
  } catch {
    // Non-JSON body (e.g. an HTML error page); fall back to the status alone.
  }
  const hint =
    status === 403
      ? " Add the service-account email under Search Console Settings > Users and permissions, enable the Search Console API in Google Cloud, and confirm GSC_SITE_URL matches a verified property."
      : status === 401
        ? " The service-account token was rejected; check GA_SERVICE_ACCOUNT_JSON."
        : "";
  const detail = message ? `: ${message.replace(/\.$/, "")}.` : ".";
  return `Search Console returned ${status}${detail}${hint}`;
}

// Search Console counts data with a ~2-3 day lag, so the window ends 3 days ago
// rather than "yesterday" to avoid a misleadingly empty tail.
function windowDates(): { startDate: string; endDate: string } {
  const day = 24 * 60 * 60 * 1000;
  const end = new Date(Date.now() - 3 * day);
  const start = new Date(end.getTime() - 27 * day);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

async function queryDimension(dimension: "query" | "page", rowLimit: number): Promise<DimensionResult> {
  const token = await getAccessToken();
  const site = gscSiteUrl();
  if (!site) return { rows: null, error: "GSC_SITE_URL is not set." };
  if (!token) {
    return {
      rows: null,
      error: "Could not obtain a Google access token; check GA_SERVICE_ACCOUNT_JSON.",
    };
  }

  const { startDate, endDate } = windowDates();
  try {
    const res = await fetch(
      `${SEARCH_API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: [dimension],
          rowLimit,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error(`gsc: ${dimension} query failed`, res.status, body);
      return { rows: null, error: describeGscError(res.status, body) };
    }
    const json = (await res.json()) as { rows?: ApiRow[] };
    const rows = (json.rows ?? []).map((r) => ({
      key: r.keys?.[0] ?? "",
      clicks: Math.round(r.clicks ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));
    return { rows, error: null };
  } catch (err) {
    console.error(`gsc: ${dimension} query threw`, err);
    const reason = err instanceof Error ? err.message : String(err);
    return { rows: null, error: `Request to Search Console failed: ${reason}.` };
  }
}

// A null summary carries the reason both dimension calls failed so the caller
// can show it; a present summary may still carry an error if one dimension
// failed while the other succeeded (partial outage).
export type GscFetchResult = { summary: GscSummary | null; error: string | null };

/**
 * Top search queries and top landing pages from search over the last 28 days
 * (ending 3 days ago for data completeness). Returns a null summary only if BOTH
 * calls fail, so a partial outage still shows what it can.
 */
export async function fetchGscSummary(): Promise<GscFetchResult> {
  const [queries, pages] = await Promise.all([
    queryDimension("query", 15),
    queryDimension("page", 10),
  ]);
  if (queries.rows === null && pages.rows === null) {
    return {
      summary: null,
      error: queries.error ?? pages.error ?? "Search Console did not respond.",
    };
  }
  return {
    summary: {
      topQueries: queries.rows ?? [],
      topPages: pages.rows ?? [],
    },
    error: queries.error ?? pages.error,
  };
}
