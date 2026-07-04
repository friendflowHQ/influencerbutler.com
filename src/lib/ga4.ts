// Google Analytics 4 Data API client (server-only, zero dependencies).
//
// Auth: signs the service-account JWT with node:crypto (RS256) and exchanges
// it at Google's token endpoint - no googleapis/@google-analytics packages,
// which would add tens of MB to the bundle for two REST calls.
//
// Env (see the "Connect Google Analytics" card for user-facing steps):
//   GA4_PROPERTY_ID          numeric property id (NOT the G-XXXX measurement id)
//   GA_SERVICE_ACCOUNT_JSON  full service-account key JSON as one env var
//
// Quota care: the summary report is one batchRunReports call, cached by the
// route in app_config for an hour. The realtime call is per page load only.
// Every function degrades instead of throwing.

import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

export function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const email = typeof parsed.client_email === "string" ? parsed.client_email : null;
    let key = typeof parsed.private_key === "string" ? parsed.private_key : null;
    if (!email || !key) return null;
    // Vercel env vars often arrive with literal \n sequences.
    key = key.replace(/\\n/g, "\n");
    return { client_email: email, private_key: key };
  } catch {
    return null;
  }
}

export function gaPropertyId(): string | null {
  const id = (process.env.GA4_PROPERTY_ID ?? "").trim();
  return /^\d+$/.test(id) ? id : null;
}

export function isGaConfigured(): boolean {
  return gaPropertyId() !== null && readServiceAccount() !== null;
}

// ---------------------------------------------------------------------------
// OAuth token (module-level cache; a cold start just re-mints, which is cheap)
// ---------------------------------------------------------------------------

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** JWT header+claims for the service-account grant. Exported for tests. */
export function buildJwtParts(
  clientEmail: string,
  nowSeconds: number,
): { header: Record<string, string>; claims: Record<string, unknown> } {
  return {
    header: { alg: "RS256", typ: "JWT" },
    claims: {
      iss: clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    },
  };
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
    const { header, claims } = buildJwtParts(account.client_email, nowSeconds);
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
      console.error("ga4: token exchange failed", res.status, await res.text());
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
    console.error("ga4: token minting threw", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type GaTrendDay = { date: string; activeUsers: number; newUsers: number };
export type GaTotals = { activeUsers: number; newUsers: number };
export type GaChannel = { channel: string; sessions: number };
export type GaPage = { path: string; views: number };

export type GaSummary = {
  trend: { days: GaTrendDay[]; totals: GaTotals; prevTotals: GaTotals };
  channels: GaChannel[];
  topPages: GaPage[];
};

type GaRow = {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
};

type GaReport = { rows?: GaRow[] };

function metricNum(row: GaRow, i: number): number {
  const v = Number(row.metricValues?.[i]?.value);
  return Number.isFinite(v) ? v : 0;
}

function dim(row: GaRow, i: number): string {
  return row.dimensionValues?.[i]?.value ?? "";
}

/** 'YYYYMMDD' -> 'YYYY-MM-DD'. */
function gaDate(raw: string): string {
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
}

async function gaPost(path: string, body: unknown): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken();
  const property = gaPropertyId();
  if (!token || !property) return null;
  try {
    const res = await fetch(`${DATA_API}/properties/${property}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`ga4: ${path} failed`, res.status, await res.text());
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.error(`ga4: ${path} threw`, err);
    return null;
  }
}

/**
 * One batchRunReports call: daily users trend (with a previous 28-day window
 * for deltas), traffic channels, and top pages. Returns null on any failure;
 * the route decides whether to serve a stale cache.
 */
export async function fetchGaSummary(): Promise<GaSummary | null> {
  const current = { startDate: "28daysAgo", endDate: "yesterday" };
  const previous = { startDate: "56daysAgo", endDate: "29daysAgo" };

  const json = await gaPost(":batchRunReports", {
    requests: [
      {
        dateRanges: [current, previous],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "newUsers" }],
        limit: 200,
      },
      {
        dateRanges: [current],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 8,
      },
      {
        dateRanges: [current],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 8,
      },
    ],
  });
  if (!json) return null;

  const reports = (json.reports as GaReport[] | undefined) ?? [];
  const [trendReport, channelReport, pagesReport] = reports;

  // With two date ranges GA appends a dateRange dimension after `date`.
  const days: GaTrendDay[] = [];
  const totals: GaTotals = { activeUsers: 0, newUsers: 0 };
  const prevTotals: GaTotals = { activeUsers: 0, newUsers: 0 };
  for (const row of trendReport?.rows ?? []) {
    const range = dim(row, 1); // 'date_range_0' | 'date_range_1' | ''
    const isPrev = range === "date_range_1";
    const activeUsers = metricNum(row, 0);
    const newUsers = metricNum(row, 1);
    if (isPrev) {
      prevTotals.activeUsers += activeUsers;
      prevTotals.newUsers += newUsers;
    } else {
      totals.activeUsers += activeUsers;
      totals.newUsers += newUsers;
      days.push({ date: gaDate(dim(row, 0)), activeUsers, newUsers });
    }
  }
  days.sort((a, b) => (a.date < b.date ? -1 : 1));

  const channels: GaChannel[] = (channelReport?.rows ?? []).map((row) => ({
    channel: dim(row, 0) || "(other)",
    sessions: metricNum(row, 0),
  }));

  const topPages: GaPage[] = (pagesReport?.rows ?? []).map((row) => ({
    path: dim(row, 0) || "/",
    views: metricNum(row, 0),
  }));

  return { trend: { days, totals, prevTotals }, channels, topPages };
}

/** Active users on the site right now. Null on any failure. */
export async function fetchGaRealtime(): Promise<number | null> {
  const json = await gaPost(":runRealtimeReport", {
    metrics: [{ name: "activeUsers" }],
  });
  if (!json) return null;
  const rows = (json.rows as GaRow[] | undefined) ?? [];
  if (rows.length === 0) return 0;
  return rows.reduce((sum, row) => sum + metricNum(row, 0), 0);
}
