/**
 * desktop-earnings.ts - pure validation for the desktop app's "Sync to web"
 * payload (POST /api/desktop/earnings-sync) plus the shared shapes the
 * dashboard reads back. No I/O here so it can be unit-tested directly.
 *
 * Contract (v1):
 *   { v: 1, appVersion, syncedAt, currency, offsiteTracked,
 *     months: [{ month: "YYYY-MM", onsiteCents, ccCents, offsiteCents,
 *                brandDealCents, internationalCents, bonusCents, totalCents }],
 *     topAsins: [{ period: "all" | "12m" | "YYYY-MM", asin, marketplace,
 *                  title, imageUrl, amountCents, units, orders, rank }] }
 *
 * Normalisation rules:
 *   - money is integer cents; numbers and numeric strings are accepted,
 *     rounded, clamped to +/- MAX_CENTS, anything else becomes 0;
 *   - a missing/invalid totalCents is recomputed as the sum of the six
 *     category buckets;
 *   - months must be real calendar months ("YYYY-MM", 01..12); invalid rows
 *     are dropped, duplicates keep the last occurrence, and the result is
 *     sorted ascending and capped to the MOST RECENT MAX_MONTHS;
 *   - top ASINs must carry a valid period and a 10-char ASIN; duplicates on
 *     (period, asin) keep the last occurrence, each period is sorted by rank
 *     and capped to MAX_ASINS_PER_PERIOD, and ranks are re-numbered 1..n so
 *     the dashboard ordering is always dense;
 *   - the month range (min..max) is derived from the surviving month rows
 *     and is what the sync route replaces in the database.
 */
import { ASIN_RE, MARKETPLACE_RE, cleanString, clampInt, parseTimestamp } from "@/lib/extension-api";

export const MAX_MONTHS = 120;
export const MAX_ASINS_PER_PERIOD = 50;
export const MAX_CENTS = 10_000_000_000_000; // 100 billion dollars, plenty of headroom
export const MAX_UNITS = 1_000_000_000;
export const APP_VERSION_MAX = 40;
export const TITLE_MAX = 300;
export const IMAGE_URL_MAX = 600;

export const EARNINGS_CATEGORIES = [
  "onsite",
  "cc",
  "offsite",
  "brandDeal",
  "international",
  "bonus",
] as const;
export type EarningsCategory = (typeof EARNINGS_CATEGORIES)[number];

export const EARNINGS_CATEGORY_LABELS: Record<EarningsCategory, string> = {
  onsite: "On-site",
  cc: "Creator Connections",
  offsite: "Off-site",
  brandDeal: "Brand deals",
  international: "International",
  bonus: "Bonuses",
};

const MONTH_RE = /^(\d{4})-(\d{2})$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

export type NormalizedMonth = {
  /** "YYYY-MM-01" (a Postgres DATE literal). */
  month: string;
  onsiteCents: number;
  ccCents: number;
  offsiteCents: number;
  brandDealCents: number;
  internationalCents: number;
  bonusCents: number;
  totalCents: number;
};

export type NormalizedTopAsin = {
  period: string;
  asin: string;
  marketplace: string;
  title: string | null;
  imageUrl: string | null;
  amountCents: number;
  units: number;
  orders: number;
  rank: number;
};

export type NormalizedEarningsPayload = {
  ok: true;
  appVersion: string | null;
  syncedAt: string;
  currency: string;
  offsiteTracked: boolean;
  months: NormalizedMonth[];
  /** Inclusive month range covered by `months`, or null when no months. */
  monthRange: { min: string; max: string } | null;
  topAsins: NormalizedTopAsin[];
  /** Distinct periods present in `topAsins`, in payload order. */
  periods: string[];
};

export type EarningsPayloadError = { ok: false; error: string };

export type EarningsPayloadResult = NormalizedEarningsPayload | EarningsPayloadError;

/** Coerces a cents value: number or numeric string, rounded and clamped; else 0. */
export function toCents(value: unknown): number {
  let n: number | null = null;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    n = Number(value);
  }
  if (n === null || !Number.isFinite(n)) return 0;
  return Math.min(MAX_CENTS, Math.max(-MAX_CENTS, Math.round(n)));
}

/** "YYYY-MM" -> "YYYY-MM-01", or null when not a real calendar month. */
export function parseMonthKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = MONTH_RE.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

export function parsePeriod(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v === "all" || v === "12m") return v;
  const asMonth = parseMonthKey(v);
  return asMonth ? v : null;
}

function parseCurrency(value: unknown): string {
  const raw = cleanString(value, 8);
  if (!raw) return "USD";
  const upper = raw.toUpperCase();
  return CURRENCY_RE.test(upper) ? upper : "USD";
}

function parseImageUrl(value: unknown): string | null {
  const url = cleanString(value, IMAGE_URL_MAX);
  if (!url || !/^https:\/\//i.test(url)) return null;
  return url;
}

function normalizeMonths(raw: unknown): NormalizedMonth[] {
  if (!Array.isArray(raw)) return [];
  const byMonth = new Map<string, NormalizedMonth>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const month = parseMonthKey(row.month);
    if (!month) continue;
    const onsiteCents = toCents(row.onsiteCents);
    const ccCents = toCents(row.ccCents);
    const offsiteCents = toCents(row.offsiteCents);
    const brandDealCents = toCents(row.brandDealCents);
    const internationalCents = toCents(row.internationalCents);
    const bonusCents = toCents(row.bonusCents);
    const sum = onsiteCents + ccCents + offsiteCents + brandDealCents + internationalCents + bonusCents;
    const hasTotal =
      typeof row.totalCents === "number" ||
      (typeof row.totalCents === "string" && row.totalCents.trim() !== "");
    const totalCents = hasTotal ? toCents(row.totalCents) : Math.min(MAX_CENTS, Math.max(-MAX_CENTS, sum));
    byMonth.set(month, {
      month,
      onsiteCents,
      ccCents,
      offsiteCents,
      brandDealCents,
      internationalCents,
      bonusCents,
      totalCents,
    });
  }
  const sorted = [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  // Keep the most recent MAX_MONTHS: the newest data is what the dashboard shows.
  return sorted.length > MAX_MONTHS ? sorted.slice(sorted.length - MAX_MONTHS) : sorted;
}

function normalizeTopAsins(raw: unknown): { rows: NormalizedTopAsin[]; periods: string[] } {
  if (!Array.isArray(raw)) return { rows: [], periods: [] };
  const byKey = new Map<string, NormalizedTopAsin>();
  const periods: string[] = [];
  let index = 0;
  for (const item of raw) {
    index += 1;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const period = parsePeriod(row.period);
    const asin = typeof row.asin === "string" ? row.asin.trim().toUpperCase() : "";
    if (!period || !ASIN_RE.test(asin)) continue;
    const marketplaceRaw = typeof row.marketplace === "string" ? row.marketplace.trim().toLowerCase() : "";
    const marketplace = MARKETPLACE_RE.test(marketplaceRaw) ? marketplaceRaw : "amazon.com";
    if (!periods.includes(period)) periods.push(period);
    byKey.set(`${period}:${asin}`, {
      period,
      asin,
      marketplace,
      title: cleanString(row.title, TITLE_MAX),
      imageUrl: parseImageUrl(row.imageUrl),
      amountCents: toCents(row.amountCents),
      units: clampInt(row.units, 0, MAX_UNITS) ?? 0,
      orders: clampInt(row.orders, 0, MAX_UNITS) ?? 0,
      rank: clampInt(row.rank, 1, 1_000_000) ?? index,
    });
  }
  const rows: NormalizedTopAsin[] = [];
  for (const period of periods) {
    const inPeriod = [...byKey.values()]
      .filter((r) => r.period === period)
      .sort((a, b) => a.rank - b.rank || b.amountCents - a.amountCents)
      .slice(0, MAX_ASINS_PER_PERIOD)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    rows.push(...inPeriod);
  }
  return { rows, periods };
}

export function normalizeEarningsPayload(body: unknown): EarningsPayloadResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const raw = body as Record<string, unknown>;
  if (raw.v !== 1) return { ok: false, error: "Unsupported payload version (expected v: 1)" };
  if (raw.months !== undefined && !Array.isArray(raw.months)) {
    return { ok: false, error: "months must be an array" };
  }
  if (raw.topAsins !== undefined && !Array.isArray(raw.topAsins)) {
    return { ok: false, error: "topAsins must be an array" };
  }

  const months = normalizeMonths(raw.months);
  const { rows: topAsins, periods } = normalizeTopAsins(raw.topAsins);
  const monthRange =
    months.length > 0 ? { min: months[0].month, max: months[months.length - 1].month } : null;

  return {
    ok: true,
    appVersion: cleanString(raw.appVersion, APP_VERSION_MAX),
    syncedAt: parseTimestamp(raw.syncedAt) ?? new Date().toISOString(),
    currency: parseCurrency(raw.currency),
    offsiteTracked: raw.offsiteTracked === true,
    months,
    monthRange,
    topAsins,
    periods,
  };
}

/** Sums the six category buckets and the total over a set of month rows. */
export function sumCategories(months: readonly NormalizedMonth[]): Record<`${EarningsCategory}Cents`, number> & {
  totalCents: number;
} {
  const totals = {
    onsiteCents: 0,
    ccCents: 0,
    offsiteCents: 0,
    brandDealCents: 0,
    internationalCents: 0,
    bonusCents: 0,
    totalCents: 0,
  };
  for (const m of months) {
    totals.onsiteCents += m.onsiteCents;
    totals.ccCents += m.ccCents;
    totals.offsiteCents += m.offsiteCents;
    totals.brandDealCents += m.brandDealCents;
    totals.internationalCents += m.internationalCents;
    totals.bonusCents += m.bonusCents;
    totals.totalCents += m.totalCents;
  }
  return totals;
}

/**
 * The 12 calendar months ending at `endMonth` ("YYYY-MM-01"), inclusive, as a
 * "YYYY-MM-01" lower bound. Used for the dashboard's "last 12 months" totals.
 */
export function twelveMonthFloor(endMonth: string): string {
  const [y, m] = endMonth.split("-").map(Number);
  // 11 months back from endMonth so the window holds 12 months inclusive.
  const total = y * 12 + (m - 1) - 11;
  const fy = Math.floor(total / 12);
  const fm = (total % 12) + 1;
  return `${fy}-${String(fm).padStart(2, "0")}-01`;
}
