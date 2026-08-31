// BSR -> estimated monthly units + revenue. A faithful port of the Influencer
// Butler desktop salesEstimator (v2), kept pure and DOM-free so it is
// node-testable and reusable across every overlay. The extension shows the
// uncalibrated baseline: the desktop additionally self-calibrates its category
// curve from real "bought in past month" data, which the extension does not have.

// Rank -> units/month reference points, log-log interpolated between.
const REFERENCE_CURVE: ReadonlyArray<readonly [number, number]> = [
  [1, 30000], [5, 12000], [10, 8000], [50, 3500], [100, 2000],
  [500, 800], [1000, 500], [5000, 220], [10000, 130], [50000, 40],
  [100000, 18], [500000, 4], [1000000, 1.2],
];

// Coarse per-category multipliers (bigger marketplaces sell more at the same
// rank). Matched by case-insensitive substring against the product's category.
const CATEGORY_MULTIPLIERS: ReadonlyArray<readonly [string, number]> = [
  ["home & kitchen", 1.6], ["grocery", 1.4], ["beauty", 1.3], ["health", 1.3],
  ["toys", 1.2], ["pet", 1.2], ["clothing", 1.1], ["electronics", 1.1],
  ["sports", 1.0], ["office", 0.9], ["automotive", 0.8], ["books", 0.5],
];

export type SalesRankInput = number | string | null | undefined;
export type PriceInput = number | string | null | undefined;

function categoryMultiplier(category: string | null | undefined): number {
  const key = String(category ?? "").trim().toLowerCase();
  if (!key) return 1;
  for (const [needle, mult] of CATEGORY_MULTIPLIERS) if (key.includes(needle)) return mult;
  return 1;
}

// Log-log interpolation over the reference curve. null for a missing/invalid rank.
function baseUnitsForRank(bsr: number | null): number | null {
  if (bsr == null) return null;
  const rank = Number(bsr);
  if (!Number.isFinite(rank) || rank < 1) return null;
  const first = REFERENCE_CURVE[0]!;
  const last = REFERENCE_CURVE[REFERENCE_CURVE.length - 1]!;
  if (rank <= first[0]) return first[1];
  if (rank >= last[0]) return last[1];
  for (let i = 1; i < REFERENCE_CURVE.length; i += 1) {
    const [r1, u1] = REFERENCE_CURVE[i - 1]!;
    const [r2, u2] = REFERENCE_CURVE[i]!;
    if (rank <= r2) {
      const tt = (Math.log(rank) - Math.log(r1)) / (Math.log(r2) - Math.log(r1));
      return Math.exp(Math.log(u1) + tt * (Math.log(u2) - Math.log(u1)));
    }
  }
  return last[1];
}

// Parse a sales-rank value: a number, or a "#1,234 in Home & Kitchen" string.
export function parseSalesRank(value: SalesRankInput): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  if (value == null) return null;
  const m = String(value).match(/([\d][\d,]*)/);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// Parse a price: a number, or a "$12.99" / "1,299.00" string. null if <= 0.
export function parsePrice(value: PriceInput): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (value == null) return null;
  const cleaned = String(value).replace(/[^0-9.,]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type UnitsInput = {
  salesRank?: SalesRankInput;
  category?: string | null;
  boughtPastMonth?: number | null;
};

// Estimated units/month. Prefers a real "bought in past month" figure when known
// (Amazon shows it as an "N+" floor), else the BSR curve. null when unknowable.
export function estimateMonthlyUnits({ salesRank, category, boughtPastMonth }: UnitsInput = {}): number | null {
  const actual = Number(boughtPastMonth);
  if (Number.isFinite(actual) && actual > 0) return Math.round(actual);
  const base = baseUnitsForRank(parseSalesRank(salesRank));
  if (base == null) return null;
  return Math.max(1, Math.round(base * categoryMultiplier(category)));
}

export type MonthlyInput = UnitsInput & { price?: PriceInput };

// Estimated revenue/month = estimated (or actual) units x price (whole currency
// units). null when price or units is unknown.
export function estimateMonthly({ salesRank, price, category, boughtPastMonth }: MonthlyInput = {}): {
  units: number | null;
  revenue: number | null;
} {
  const units = estimateMonthlyUnits({ salesRank, category, boughtPastMonth });
  const p = parsePrice(price);
  const revenue = units != null && p != null ? Math.round(units * p) : null;
  return { units, revenue };
}

export type ResolveInput = {
  // A calibrated units figure from the shared catalogue, preferred when present
  // so the extension's numbers match the desktop's calibrated ones.
  serverUnits?: number | null;
  salesRank?: SalesRankInput;
  // Price in cents, as every overlay carries it. Bridged to whole dollars here.
  priceCents?: number | null;
  category?: string | null;
  boughtPastMonth?: number | null;
};

// The single choke point every surface uses: prefer the server units, fall back
// to the local BSR estimate, and compute whole-dollar revenue from priceCents.
export function resolveEstimate({
  serverUnits,
  salesRank,
  priceCents,
  category,
  boughtPastMonth,
}: ResolveInput): { units: number | null; revenueDollars: number | null } {
  const units =
    serverUnits != null && Number.isFinite(serverUnits) && serverUnits > 0
      ? Math.round(serverUnits)
      : estimateMonthlyUnits({ salesRank, category, boughtPastMonth });
  const revenueDollars =
    units != null && priceCents != null && Number.isFinite(priceCents) && priceCents > 0
      ? Math.round((units * priceCents) / 100)
      : null;
  return { units, revenueDollars };
}

// Muted no-data placeholder. The em dash the desktop uses is banned in this repo,
// so labelled rows fall back to "n/a"; compact tiles omit the chip entirely.
export const EST_PLACEHOLDER = "n/a";

export function formatEstUnits(units: number | null): string {
  return units != null ? units.toLocaleString() : EST_PLACEHOLDER;
}

export function formatEstRevenue(revenueDollars: number | null): string {
  return revenueDollars != null ? `$${revenueDollars.toLocaleString()}` : EST_PLACEHOLDER;
}
