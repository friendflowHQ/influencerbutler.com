/**
 * market-estimate.ts - BSR -> estimated monthly sales for the shared product
 * catalogue ("internal Keepa").
 *
 * Amazon stopped publishing product sales counts, but it still shows Best
 * Sellers Rank (BSR) on product pages, and on many listings it also shows a
 * real "N+ bought in past month" figure. Because our extension captures BOTH
 * on the same products, we can fit our own rank -> sales curve per category by
 * regressing bought_past_month against bsr_rank, instead of licensing Keepa's
 * model. See /api/cron/calibrate-sales-curves.
 *
 * The curve is the standard power law used across the BSR-estimation space:
 *
 *     estMonthlySales = a * rank^(-b)          (a > 0, b > 0)
 *
 * A smaller rank (closer to #1) means MORE sales, so the exponent is negative.
 * Fitting is linear in log-log space: ln(sales) = ln(a) - b * ln(rank).
 */

export type SalesCurve = {
  /** Scale coefficient a in sales = a * rank^(-b). */
  coefA: number;
  /** Decay exponent b (positive). */
  coefB: number;
};

/**
 * Seed curves keyed by a normalized top-level category family. These are
 * documented rule-of-thumb starting points (rank #1 lands in the low tens of
 * thousands of monthly sales, tapering steeply); the calibration cron replaces
 * them per BSR category label as real co-captured data accumulates.
 */
const SEED_CURVES: Record<string, SalesCurve> = {
  electronics: { coefA: 90_000, coefB: 0.85 },
  "home & kitchen": { coefA: 120_000, coefB: 0.9 },
  "toys & games": { coefA: 80_000, coefB: 0.88 },
  beauty: { coefA: 100_000, coefB: 0.9 },
  "health & household": { coefA: 110_000, coefB: 0.9 },
  "sports & outdoors": { coefA: 70_000, coefB: 0.88 },
  "clothing, shoes & jewelry": { coefA: 130_000, coefB: 0.95 },
  "grocery & gourmet food": { coefA: 90_000, coefB: 0.9 },
  "tools & home improvement": { coefA: 60_000, coefB: 0.86 },
  "office products": { coefA: 55_000, coefB: 0.86 },
  "pet supplies": { coefA: 75_000, coefB: 0.88 },
  books: { coefA: 100_000, coefB: 1.0 },
};

/** Fallback used when a category has neither a fitted nor a seed curve. */
const DEFAULT_CURVE: SalesCurve = { coefA: 90_000, coefB: 0.9 };

/**
 * Map a raw BSR category label (e.g. "Beauty & Personal Care", "Cell Phones &
 * Accessories") to a seed-curve family key. Best-effort substring match; the
 * fitted per-label curves are what carry real accuracy once calibrated.
 */
export function seedCurveFor(bsrCategory: string | null | undefined): SalesCurve {
  if (!bsrCategory) return DEFAULT_CURVE;
  const key = bsrCategory.trim().toLowerCase();
  if (SEED_CURVES[key]) return SEED_CURVES[key];
  for (const [family, curve] of Object.entries(SEED_CURVES)) {
    const head = family.split(/[&,]/)[0].trim();
    if (key.includes(head)) return curve;
  }
  return DEFAULT_CURVE;
}

/**
 * Estimate monthly sales from a BSR rank using the supplied curve (a fitted
 * curve when available, otherwise a seed). Returns null when there is no
 * usable rank. Clamps to a sane floor of 0.
 */
export function estMonthlySales(bsrRank: number | null | undefined, curve: SalesCurve): number | null {
  if (typeof bsrRank !== "number" || !Number.isFinite(bsrRank) || bsrRank < 1) return null;
  const raw = curve.coefA * Math.pow(bsrRank, -curve.coefB);
  if (!Number.isFinite(raw) || raw < 0) return null;
  return Math.round(raw);
}

export type ReviewVelocityEstimate = {
  est: number | null;
  confidence: "low" | "medium";
};

// Roughly what share of buyers leave a review. Used to scale review growth back
// up to a sales figure. This is a coarse industry rule of thumb (~1-3%); the
// estimate is surfaced as low/medium confidence precisely because this constant
// is an assumption, not a fitted value.
const REVIEW_RATE = 0.02;

// Coarse lifetime-sales bands by absolute review count, damped to a monthly
// figure, for the single-observation fallback (no velocity yet). Deliberately
// conservative and always flagged "low" confidence.
function monthlyFromAbsoluteReviews(reviews: number): number | null {
  if (!Number.isFinite(reviews) || reviews < 1) return null;
  // lifetime sales ~ reviews / REVIEW_RATE, spread over an assumed ~24-month
  // shelf life, floored so a handful of reviews still reads as "some" sales.
  const lifetime = reviews / REVIEW_RATE;
  return Math.max(1, Math.round(lifetime / 24));
}

/**
 * Estimate monthly sales for a retailer with no BSR (Walmart) from the change
 * in review count between two observations. The primary signal is review
 * velocity: reviews accrue as a fraction of sales, so monthly review growth
 * divided by the review rate approximates monthly sales. Falls back to an
 * absolute-review-count band when there is only one observation (no span yet).
 *
 * `oldReviews`/`newReviews` are the review counts at the ends of the window;
 * `spanDays` is the gap between them. Returns { est, confidence }; confidence is
 * "medium" when a real positive-growth span drove the number, "low" for the
 * single-observation fallback (or when growth is flat/negative).
 */
export function estMonthlySalesFromReviews(
  oldReviews: number | null | undefined,
  newReviews: number | null | undefined,
  spanDays: number | null | undefined,
): ReviewVelocityEstimate {
  const now = typeof newReviews === "number" && Number.isFinite(newReviews) ? newReviews : null;
  const then = typeof oldReviews === "number" && Number.isFinite(oldReviews) ? oldReviews : null;
  const span = typeof spanDays === "number" && Number.isFinite(spanDays) ? spanDays : null;

  // Real span with positive growth -> velocity estimate, medium confidence.
  if (now != null && then != null && span != null && span >= 1 && now > then) {
    const monthlyReviewGrowth = ((now - then) * 30) / span;
    const est = Math.max(1, Math.round(monthlyReviewGrowth / REVIEW_RATE));
    return { est, confidence: "medium" };
  }

  // Otherwise fall back to the absolute count (single observation, or flat /
  // shrinking reviews), always low confidence.
  const basis = now ?? then;
  return { est: basis != null ? monthlyFromAbsoluteReviews(basis) : null, confidence: "low" };
}

/**
 * Fit a power-law curve from co-captured (rank, sales) observations via
 * ordinary least squares in log-log space. Returns null if there are too few
 * usable points or the inputs are degenerate. Used by the calibration cron.
 */
export function fitSalesCurve(
  points: Array<{ rank: number; sales: number }>,
): { curve: SalesCurve; sampleSize: number; rSquared: number } | null {
  const usable = points.filter(
    (p) => Number.isFinite(p.rank) && Number.isFinite(p.sales) && p.rank >= 1 && p.sales > 0,
  );
  if (usable.length < 8) return null;

  // x = ln(rank), y = ln(sales); fit y = intercept + slope * x.
  // slope maps to -b, intercept maps to ln(a).
  const n = usable.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const p of usable) {
    const x = Math.log(p.rank);
    const y = Math.log(p.sales);
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const coefB = -slope;
  const coefA = Math.exp(intercept);
  // Only accept a downward-sloping fit (more sales at better rank); a flat or
  // inverted fit means the sample is too noisy to trust this round.
  if (!Number.isFinite(coefA) || !Number.isFinite(coefB) || coefB <= 0) return null;

  // R^2 in log space, so callers can gate on fit quality.
  const meanY = sumY / n;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of usable) {
    const x = Math.log(p.rank);
    const y = Math.log(p.sales);
    const pred = intercept + slope * x;
    ssRes += (y - pred) ** 2;
    ssTot += (y - meanY) ** 2;
  }
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { curve: { coefA, coefB }, sampleSize: n, rSquared };
}
