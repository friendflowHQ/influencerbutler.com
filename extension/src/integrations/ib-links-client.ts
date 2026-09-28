import { IB_LINKS_ENDPOINTS } from "../shared/constants";

// Pure fetch client for the Influencer Butler branded-link worker
// (links.influencerbutler.com). This is the MV3-clean equivalent of the desktop
// SelfHostedLinkClient: no chrome, no storage, no Electron. Every call takes the
// signed-in license key explicitly (the background reads it from auth and passes
// it in), so this module unit-tests without a browser. background/links.ts wraps
// these with the state reads (license, per-country tags, settings).

const REQUEST_TIMEOUT_MS = 30_000;

// Every worker error maps to one of these so the UI can react (upsell on a
// paid gate, explain a repoint clash) instead of showing a raw status number.
export type LinkErrorCode =
  | "not_signed_in"
  | "upgrade_required"
  | "target_in_use"
  | "not_found"
  | "invalid"
  | "network"
  | "failed";

export type LinkError = { ok: false; error: string; code: LinkErrorCode };

export type LinkMintTarget = {
  url: string;
  asin?: string;
  marketplace?: string;
  label?: string;
  sourceId?: string;
};

export type MintOk = { ok: true; slug: string; shortUrl: string; reused: boolean };
export type MintResult = MintOk | LinkError;

// One row of the owner-scoped registry (GET /api/links/list).
export type LinkRow = {
  slug: string;
  shortUrl: string;
  targetUrl: string | null;
  asin: string | null;
  marketplace: string | null;
  label: string | null;
  createdAt: number | null;
  originalTargetUrl: string | null;
  repointedAt: number | null;
};
export type ListOk = { ok: true; links: LinkRow[]; nextCursor: string | null };
export type ListResult = ListOk | LinkError;

export type RepointOk = {
  ok: true;
  slug: string;
  shortUrl: string;
  targetUrl: string;
  unchanged?: boolean;
};
export type RepointResult = RepointOk | LinkError;

// Account-wide retargeting pixel (the Doorbell). Platforms mirror the worker's
// PIXEL_PLATFORMS set; ids are validated server-side (sanitizePixels).
export type LinkPixelPlatform = "meta" | "google" | "tiktok";
export type LinkPixel = { platform: LinkPixelPlatform; id: string; name?: string };
export type PixelsOk = { ok: true; pixels: LinkPixel[] };
export type PixelsResult = PixelsOk | LinkError;

// The click-time routing definition pushed by /api/links/publish. Only the
// fields the redirect actually consumes; the worker sanitizes on receipt.
export type PublishRouting = {
  doormanOpen: boolean;
  passport: { enabled: boolean };
  interstitial: { enabled: boolean; autoContinueSeconds: number; poweredBy: boolean };
};
export type PublishTagging = { strategy: "best-rate" | "pinned"; pinnedTag: string | null };
export type PublishDef = {
  slug: string;
  tags: Record<string, string>;
  routing?: PublishRouting;
  tagging?: PublishTagging;
  healTarget?: string;
  dead?: boolean;
  campaign?: string;
};
export type PublishOk = { ok: true; slug: string; shortUrl: string };
export type PublishResult = PublishOk | LinkError;

// The subset of the Ledger stats payload the tab renders. The worker returns
// more (heatmap, regions, cities, referrers, ...); we type only what we show and
// read the rest defensively when needed.
export type StatsBreakdownRow = { label: string; clicks: number };
export type StatsTopLink = {
  slug: string;
  shortUrl: string;
  clicks: number;
  targetUrl: string | null;
  asin: string | null;
  label: string | null;
};
export type LinkStats = {
  range: string;
  totalClicks: number;
  prevClicks: number;
  linksCreated: number;
  series: Array<{ day: string; clicks: number }>;
  topLinks: StatsTopLink[];
  countries: StatsBreakdownRow[];
  devices: StatsBreakdownRow[];
  surfaces: StatsBreakdownRow[];
};
export type StatsOk = { ok: true; stats: LinkStats };
export type StatsResult = StatsOk | LinkError;

export type LinkStatsRange = "today" | "7d" | "30d" | "90d";
export type LinkTrafficFilter = "all" | "real" | "suspected" | "bots";

// ---- pure helpers (no request) ---------------------------------------------

// Map the creator's per-country Amazon tags to the worker's tags shape. The
// worker keys tags by marketplace CODE (US, CA, UK, ...) and upper-cases them
// (sanitizeTags); integrations.global.perCountryTags is already keyed by that
// same code, so this is a trim + uppercase + a US fallback to the storefront
// handle, matching resolveTag's US-only fallback in integrations/routing.ts.
export function buildPublishTags(
  perCountryTags: Record<string, string>,
  storefrontHandle: string | null,
): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const [code, tag] of Object.entries(perCountryTags ?? {})) {
    const trimmed = (tag ?? "").trim();
    if (trimmed) tags[code.toUpperCase()] = trimmed;
  }
  const handle = (storefrontHandle ?? "").trim();
  if (!tags.US && handle) tags.US = handle;
  return tags;
}

// The default routing definition for a browser-minted smart link: Doorman Open
// and Passport on, interstitial off. Matches the worker's sanitizeRouting
// defaults so a link that never re-publishes keeps plain-redirect behavior.
export function defaultRouting(): PublishRouting {
  return {
    doormanOpen: true,
    passport: { enabled: true },
    interstitial: { enabled: false, autoContinueSeconds: 2, poweredBy: false },
  };
}

// ---- request layer ----------------------------------------------------------

function authHeaders(licenseKey: string, withBody: boolean): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${licenseKey}`,
    Accept: "application/json",
  };
  if (withBody) headers["Content-Type"] = "application/json";
  return headers;
}

function parseJsonSafe(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Map a non-2xx worker response to a typed error. `special` lets a route claim a
// status that means something specific to it (repoint's 409 -> target_in_use).
function errorFromStatus(status: number, special?: Partial<Record<number, LinkErrorCode>>): LinkError {
  const code = special?.[status];
  if (code) {
    const messages: Record<LinkErrorCode, string> = {
      not_signed_in: "Sign in with your license key first.",
      upgrade_required: "The branded link service requires a paid plan.",
      target_in_use: "You already have a different link pointing at that URL.",
      not_found: "That link was not found on your account.",
      invalid: "That request was not valid.",
      network: "Could not reach the branded link service.",
      failed: `The branded link service returned status ${status}.`,
    };
    return { ok: false, error: messages[code], code };
  }
  if (status === 401) {
    return { ok: false, error: "License not recognized. Sign in again.", code: "not_signed_in" };
  }
  if (status === 402) {
    return { ok: false, error: "The branded link service requires a paid plan.", code: "upgrade_required" };
  }
  return { ok: false, error: `The branded link service returned status ${status}.`, code: "failed" };
}

function requireLicense(licenseKey: string): LinkError | null {
  return licenseKey.trim()
    ? null
    : { ok: false, error: "Sign in with your license key first.", code: "not_signed_in" };
}

// Mint (or reuse: the worker is idempotent per owner+target) a branded short
// link for an already-tagged url.
export async function mintLink(target: LinkMintTarget, licenseKey: string): Promise<MintResult> {
  const guard = requireLicense(licenseKey);
  if (guard) return guard;
  const url = (target.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: "That is not a valid URL.", code: "invalid" };

  const body: Record<string, string> = { url, sourceId: target.sourceId ?? "extension" };
  if (target.asin) body.asin = target.asin;
  if (target.marketplace) body.marketplace = target.marketplace;
  if (target.label) body.label = target.label;

  let response: Response;
  try {
    response = await fetch(IB_LINKS_ENDPOINTS.create, {
      method: "POST",
      headers: authHeaders(licenseKey, true),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "Could not reach the branded link service.", code: "network" };
  }
  if (!response.ok) return errorFromStatus(response.status);
  const payload = parseJsonSafe(await response.text());
  const shortUrl = typeof payload?.shortUrl === "string" ? payload.shortUrl : "";
  if (!shortUrl) {
    return { ok: false, error: "The branded link service returned no link.", code: "failed" };
  }
  // The worker returns the slug; derive it from the short url (/l/<slug>) as a
  // fallback so downstream publish always has one.
  const slug =
    typeof payload?.slug === "string" && payload.slug
      ? payload.slug
      : (/\/l\/([^/?#]+)/.exec(shortUrl)?.[1] ?? "");
  return { ok: true, slug, shortUrl, reused: payload?.reused === true };
}

// Push a link's routing definition so the edge does Passport / Best-Rate / heal
// at click time. Non-fatal for minting: the caller mints first and publishes
// best-effort, so a failed publish just leaves the link on plain redirect.
export async function publishLink(def: PublishDef, licenseKey: string): Promise<PublishResult> {
  const guard = requireLicense(licenseKey);
  if (guard) return guard;
  if (!def.slug) return { ok: false, error: "A slug is required to publish.", code: "invalid" };

  const body = {
    slug: def.slug,
    tags: def.tags,
    routing: def.routing ?? defaultRouting(),
    tagging: def.tagging ?? { strategy: "best-rate", pinnedTag: null },
    healTarget: def.healTarget,
    dead: def.dead === true,
    campaign: def.campaign,
  };
  let response: Response;
  try {
    response = await fetch(IB_LINKS_ENDPOINTS.publish, {
      method: "POST",
      headers: authHeaders(licenseKey, true),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "Could not reach the branded link service.", code: "network" };
  }
  if (!response.ok) return errorFromStatus(response.status, { 404: "not_found" });
  const payload = parseJsonSafe(await response.text());
  const shortUrl = typeof payload?.shortUrl === "string" ? payload.shortUrl : "";
  return { ok: true, slug: def.slug, shortUrl };
}

export async function listLinks(licenseKey: string, cursor?: string | null): Promise<ListResult> {
  const guard = requireLicense(licenseKey);
  if (guard) return guard;
  const params = new URLSearchParams({ limit: "50" });
  if (cursor) params.set("cursor", cursor);
  let response: Response;
  try {
    response = await fetch(`${IB_LINKS_ENDPOINTS.list}?${params.toString()}`, {
      method: "GET",
      headers: authHeaders(licenseKey, false),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "Could not reach the branded link service.", code: "network" };
  }
  if (!response.ok) return errorFromStatus(response.status);
  const payload = parseJsonSafe(await response.text());
  const rawLinks = Array.isArray(payload?.links) ? payload.links : [];
  const links: LinkRow[] = rawLinks.map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    return {
      slug: String(row.slug ?? ""),
      shortUrl: String(row.shortUrl ?? ""),
      targetUrl: typeof row.targetUrl === "string" ? row.targetUrl : null,
      asin: typeof row.asin === "string" ? row.asin : null,
      marketplace: typeof row.marketplace === "string" ? row.marketplace : null,
      label: typeof row.label === "string" ? row.label : null,
      createdAt: typeof row.createdAt === "number" ? row.createdAt : null,
      originalTargetUrl: typeof row.originalTargetUrl === "string" ? row.originalTargetUrl : null,
      repointedAt: typeof row.repointedAt === "number" ? row.repointedAt : null,
    };
  });
  const nextCursor = typeof payload?.nextCursor === "string" ? payload.nextCursor : null;
  return { ok: true, links, nextCursor };
}

export async function repointLink(
  input: { slug: string; url: string; asin?: string; marketplace?: string },
  licenseKey: string,
): Promise<RepointResult> {
  const guard = requireLicense(licenseKey);
  if (guard) return guard;
  if (!input.slug) return { ok: false, error: "A link is required.", code: "invalid" };
  if (!/^https?:\/\//i.test((input.url ?? "").trim())) {
    return { ok: false, error: "That is not a valid URL.", code: "invalid" };
  }
  const body: Record<string, string> = { slug: input.slug, url: input.url.trim() };
  if (input.asin) body.asin = input.asin;
  if (input.marketplace) body.marketplace = input.marketplace;

  let response: Response;
  try {
    response = await fetch(IB_LINKS_ENDPOINTS.repoint, {
      method: "POST",
      headers: authHeaders(licenseKey, true),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "Could not reach the branded link service.", code: "network" };
  }
  if (!response.ok) return errorFromStatus(response.status, { 409: "target_in_use", 404: "not_found" });
  const payload = parseJsonSafe(await response.text());
  return {
    ok: true,
    slug: String(payload?.slug ?? input.slug),
    shortUrl: String(payload?.shortUrl ?? ""),
    targetUrl: String(payload?.targetUrl ?? input.url.trim()),
    unchanged: payload?.unchanged === true,
  };
}

// Save the account-wide retargeting pixels. An empty list clears them. The
// worker sanitizes and returns the stored list back.
export async function savePixels(pixels: LinkPixel[], licenseKey: string): Promise<PixelsResult> {
  const guard = requireLicense(licenseKey);
  if (guard) return guard;
  let response: Response;
  try {
    response = await fetch(IB_LINKS_ENDPOINTS.pixels, {
      method: "POST",
      headers: authHeaders(licenseKey, true),
      body: JSON.stringify({ pixels }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "Could not reach the branded link service.", code: "network" };
  }
  if (!response.ok) return errorFromStatus(response.status);
  const payload = parseJsonSafe(await response.text());
  const raw = Array.isArray(payload?.pixels) ? payload.pixels : [];
  const stored: LinkPixel[] = raw
    .map((p) => (p ?? {}) as Record<string, unknown>)
    .filter((p): p is Record<string, unknown> => typeof p.platform === "string" && typeof p.id === "string")
    .map((p) => ({
      platform: p.platform as LinkPixelPlatform,
      id: String(p.id),
      name: typeof p.name === "string" ? p.name : undefined,
    }));
  return { ok: true, pixels: stored };
}

export async function fetchStats(
  licenseKey: string,
  range: LinkStatsRange,
  opts: { slug?: string; traffic?: LinkTrafficFilter } = {},
): Promise<StatsResult> {
  const guard = requireLicense(licenseKey);
  if (guard) return guard;
  const params = new URLSearchParams({ range });
  if (opts.slug) params.set("slug", opts.slug);
  if (opts.traffic) params.set("traffic", opts.traffic);
  let response: Response;
  try {
    response = await fetch(`${IB_LINKS_ENDPOINTS.stats}?${params.toString()}`, {
      method: "GET",
      headers: authHeaders(licenseKey, false),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "Could not reach the branded link service.", code: "network" };
  }
  if (!response.ok) return errorFromStatus(response.status);
  const payload = parseJsonSafe(await response.text());
  if (!payload || payload.ok !== true) {
    return { ok: false, error: "The branded link service returned no analytics.", code: "failed" };
  }
  return { ok: true, stats: normalizeStats(payload) };
}

// Map a labelled breakdown array (each row has one label-ish key plus `clicks`)
// to a uniform { label, clicks } list. The worker uses a different label key per
// breakdown (country/device/surface/...), so pick the first non-clicks string.
function toBreakdown(raw: unknown): StatsBreakdownRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    let label = "";
    for (const [key, value] of Object.entries(row)) {
      if (key !== "clicks" && typeof value === "string" && value) {
        label = value;
        break;
      }
    }
    const clicks = typeof row.clicks === "number" ? row.clicks : 0;
    return { label: label || "unknown", clicks };
  });
}

function normalizeStats(payload: Record<string, unknown>): LinkStats {
  const series = Array.isArray(payload.series)
    ? payload.series.map((s) => {
        const row = (s ?? {}) as Record<string, unknown>;
        return { day: String(row.day ?? ""), clicks: typeof row.clicks === "number" ? row.clicks : 0 };
      })
    : [];
  const topLinks = Array.isArray(payload.topLinks)
    ? payload.topLinks.map((l) => {
        const row = (l ?? {}) as Record<string, unknown>;
        return {
          slug: String(row.slug ?? ""),
          shortUrl: String(row.shortUrl ?? ""),
          clicks: typeof row.clicks === "number" ? row.clicks : 0,
          targetUrl: typeof row.targetUrl === "string" ? row.targetUrl : null,
          asin: typeof row.asin === "string" ? row.asin : null,
          label: typeof row.label === "string" ? row.label : null,
        };
      })
    : [];
  return {
    range: String(payload.range ?? "30d"),
    totalClicks: typeof payload.totalClicks === "number" ? payload.totalClicks : 0,
    prevClicks: typeof payload.prevClicks === "number" ? payload.prevClicks : 0,
    linksCreated: typeof payload.linksCreated === "number" ? payload.linksCreated : 0,
    series,
    topLinks,
    countries: toBreakdown(payload.countries),
    devices: toBreakdown(payload.devices),
    surfaces: toBreakdown(payload.surfaces),
  };
}
