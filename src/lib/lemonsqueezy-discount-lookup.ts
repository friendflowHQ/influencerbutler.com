/**
 * Summary: Fetches Lemon Squeezy discount metadata by code with short-TTL in-memory caching.
 * Dependencies: ./lemonsqueezy, ./affiliate-lookup (withTimeout).
 *
 * The promo-code resolver compares the lifetime $ value of several candidate codes
 * before picking a winner, so it needs each code's amount / amount_type / duration
 * from LS. Without caching, every checkout would round-trip LS once per candidate;
 * the cache covers WELCOME30 and any popular affiliate code essentially for free.
 *
 * Negative results (no matching record, expired, unpublished) are cached too so a
 * typo doesn't repeatedly hammer LS. Cache is process-local - fine for a Next.js
 * server function where lambda warmth is short anyway.
 */

import { lsApi } from "./lemonsqueezy";
import { withTimeout } from "./affiliate-lookup";

export type DiscountDuration = "once" | "repeating" | "forever";
export type DiscountAmountType = "percent" | "fixed";

export type LsDiscount = {
  id: string;
  code: string;
  amount: number;
  amountType: DiscountAmountType;
  duration: DiscountDuration;
  durationInMonths: number | null;
};

export const DISCOUNT_LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 2_000;

type CacheEntry = { value: LsDiscount | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

/** Test-only: reset the in-memory cache. Not exported through any public surface. */
export function __resetDiscountLookupCacheForTests(): void {
  cache.clear();
}

function cacheKey(code: string, storeId: string): string {
  return `${storeId}::${code.toUpperCase()}`;
}

function parseAmountType(raw: unknown): DiscountAmountType | null {
  if (raw === "percent" || raw === "fixed") return raw;
  return null;
}

function parseDuration(raw: unknown): DiscountDuration | null {
  if (raw === "once" || raw === "repeating" || raw === "forever") return raw;
  return null;
}

function isWithinWindow(startsAt: unknown, expiresAt: unknown): boolean {
  const now = Date.now();
  if (typeof startsAt === "string" && startsAt.length > 0) {
    const t = Date.parse(startsAt);
    if (!Number.isNaN(t) && now < t) return false;
  }
  if (typeof expiresAt === "string" && expiresAt.length > 0) {
    const t = Date.parse(expiresAt);
    if (!Number.isNaN(t) && now > t) return false;
  }
  return true;
}

type LsDiscountListRecord = {
  id?: string;
  attributes?: {
    code?: string;
    amount?: number;
    amount_type?: string;
    duration?: string;
    duration_in_months?: number | null;
    status?: string;
    starts_at?: string | null;
    expires_at?: string | null;
  };
};

type LsDiscountListResponse = {
  data?: LsDiscountListRecord[];
};

function normalize(record: LsDiscountListRecord): LsDiscount | null {
  const attrs = record.attributes;
  if (!record.id || !attrs) return null;

  const status = typeof attrs.status === "string" ? attrs.status : "";
  if (status !== "published") return null;
  if (!isWithinWindow(attrs.starts_at, attrs.expires_at)) return null;

  const amount = typeof attrs.amount === "number" ? attrs.amount : Number(attrs.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const amountType = parseAmountType(attrs.amount_type);
  const duration = parseDuration(attrs.duration);
  const code = typeof attrs.code === "string" ? attrs.code : "";
  if (!amountType || !duration || code.length === 0) return null;

  const durationInMonths =
    duration === "repeating"
      ? Number.isFinite(attrs.duration_in_months ?? NaN)
        ? Number(attrs.duration_in_months)
        : null
      : null;

  return {
    id: record.id,
    code,
    amount,
    amountType,
    duration,
    durationInMonths,
  };
}

/**
 * Returns the published, in-window LS discount for `code` or null if nothing
 * matches. Case-insensitive (we pass the code through, LS treats it case-sensitive
 * but we cache by uppercase to dedupe). Wrapped in a 2s timeout - any LS hiccup
 * silently degrades to null rather than blocking checkout creation.
 */
export async function fetchDiscountByCode(
  code: string,
  storeId: string,
): Promise<LsDiscount | null> {
  const trimmed = typeof code === "string" ? code.trim() : "";
  if (trimmed.length === 0 || storeId.length === 0) return null;

  const key = cacheKey(trimmed, storeId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const result = await withTimeout(
    fetchUncached(trimmed, storeId),
    LOOKUP_TIMEOUT_MS,
    null,
  );

  cache.set(key, { value: result, expiresAt: Date.now() + DISCOUNT_LOOKUP_CACHE_TTL_MS });
  return result;
}

async function fetchUncached(code: string, storeId: string): Promise<LsDiscount | null> {
  try {
    const path = `/discounts?filter[code]=${encodeURIComponent(code)}&filter[store_id]=${encodeURIComponent(
      storeId,
    )}`;
    const response = await lsApi(path);
    if (!response.ok) {
      console.warn("discount-lookup: LS responded non-2xx", {
        status: response.status,
        code,
      });
      return null;
    }
    const payload = (await response.json()) as LsDiscountListResponse;
    const records = Array.isArray(payload.data) ? payload.data : [];

    // LS does a substring match on filter[code], so we have to find the exact code.
    const exact = records.find(
      (r) =>
        typeof r.attributes?.code === "string" &&
        r.attributes.code.toUpperCase() === code.toUpperCase(),
    );

    if (!exact) return null;
    return normalize(exact);
  } catch (error) {
    console.warn("discount-lookup: fetch threw", {
      error: error instanceof Error ? error.message : String(error),
      code,
    });
    return null;
  }
}
