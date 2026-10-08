/**
 * Server-side client for the influencerbutler-asin-lookup Cloudflare Worker.
 *
 * The extension's per-ASIN Creator Connections rate used to live in a 17M-row
 * Postgres table (extension_cc_rates, ~2.9 GB) that a cron rewrote end to end
 * every few hours, which exhausted Supabase's Disk IO budget. The same data is
 * already published nightly to the Worker's D1 index by the harvest, so the
 * rate now comes from there and Postgres holds none of it.
 *
 * The Worker answers per ASIN with parallel `campaignIds[]` / `campaigns[]`
 * ({ r: rate %, e: end date, s: open slots }) arrays; the best ACTIVE campaign
 * is picked here, the same rule the old build used (highest rate, skipping
 * campaigns that ended more than a day ago).
 */

const DEFAULT_LOOKUP_URL = "https://asin-lookup.influencerbutler.com";
const TIMEOUT_MS = 8_000;
const ENDED_GRACE_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 5_000;

export type CcRate = {
  ratePct: number;
  brand: string | null;
  endsAt: string | null;
  campaignId: string | null;
};

type LookupRecord = {
  brand?: string;
  bestRate?: number | null;
  soonestExpiry?: string | null;
  campaignIds?: string[];
  campaigns?: Array<{ r: number | null; e: string | null; s: number | null }>;
};

function lookupBaseUrl(): string {
  const fromEnv = (process.env.ASIN_LOOKUP_URL ?? "").trim();
  return (fromEnv || DEFAULT_LOOKUP_URL).replace(/\/+$/, "");
}

function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/** Best active campaign rate for one Worker record, or null when none. */
export function pickBestCcRate(rec: LookupRecord, now: number = Date.now()): CcRate | null {
  const brand = rec.brand?.trim() || null;
  const ids = Array.isArray(rec.campaignIds) ? rec.campaignIds : [];
  const tuples = Array.isArray(rec.campaigns) ? rec.campaigns : [];

  let best: CcRate | null = null;
  tuples.forEach((c, i) => {
    if (!c || typeof c.r !== "number" || !Number.isFinite(c.r)) return;
    const endsAt = isoOrNull(c.e);
    if (endsAt && Date.parse(endsAt) < now - ENDED_GRACE_MS) return;
    if (best && c.r <= best.ratePct) return;
    best = { ratePct: c.r, brand, endsAt, campaignId: ids[i] || null };
  });
  if (best) return best;

  // Rows published before per-campaign tuples existed carry only the summary.
  if (tuples.length === 0 && typeof rec.bestRate === "number" && Number.isFinite(rec.bestRate)) {
    const endsAt = isoOrNull(rec.soonestExpiry);
    if (endsAt && Date.parse(endsAt) < now - ENDED_GRACE_MS) return null;
    return { ratePct: rec.bestRate, brand, endsAt, campaignId: ids[0] || null };
  }
  return null;
}

// Per-instance cache so repeated chip lookups for the same ASINs do not each
// cost a Worker call (the Worker rate-limits per IP and Vercel egress is shared).
const cache = new Map<string, { at: number; rate: CcRate | null }>();

/**
 * CC rate per ASIN (absent = no active campaign). Throws when the Worker is
 * unreachable or rejects the call, so the caller can tell "no rate" from
 * "could not check".
 */
export async function fetchCcRates(asins: string[]): Promise<Record<string, CcRate>> {
  const now = Date.now();
  const out: Record<string, CcRate> = {};
  const misses: string[] = [];
  for (const asin of asins) {
    const hit = cache.get(asin);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      if (hit.rate) out[asin] = hit.rate;
    } else {
      misses.push(asin);
    }
  }
  if (misses.length === 0) return out;

  const res = await fetch(`${lookupBaseUrl()}/asin/lookup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ asins: misses }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`asin-lookup responded ${res.status}`);
  const body = (await res.json()) as { ok?: boolean; results?: Record<string, LookupRecord> };
  if (!body || body.ok === false || typeof body.results !== "object" || !body.results) {
    throw new Error("asin-lookup returned an unexpected payload");
  }

  if (cache.size > CACHE_MAX_ENTRIES) cache.clear();
  for (const asin of misses) {
    const rec = body.results[asin];
    const rate = rec ? pickBestCcRate(rec, now) : null;
    cache.set(asin, { at: now, rate });
    if (rate) out[asin] = rate;
  }
  return out;
}
