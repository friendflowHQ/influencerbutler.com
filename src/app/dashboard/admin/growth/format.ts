// Client-side formatting + shared types for the Growth dashboard.
//
// The metric catalog (labels/units) travels in the /api/admin/growth/metrics
// response so client code never imports server-only libs; these helpers
// humanize whatever arrives.

export type MetricUnit = "count" | "cents";

export type CatalogEntry = {
  key: string;
  label: string;
  goalLabel: string;
  unit: MetricUnit;
  goalable: boolean;
};

export type MetricSnapshot = {
  current: number | null;
  previous: number | null;
  series: number[] | null;
};

export type ProjectionFigure = {
  trials: number;
  trialCents: number;
  activeRenewals: number;
  activeRenewalCents: number;
  totalCents: number | null;
};

export type PayoutBucket = {
  payoutDateMs: number;
  cents: number;
};

export type EarningsProjection = {
  securedCents: number | null;
  bestCase: ProjectionFigure;
  thisMonth: ProjectionFigure;
  payoutSplit: PayoutBucket[] | null;
};

export type PlanBreakdownRow = {
  plan: string;
  label: string;
  active: number;
  comped: number;
  onTrial: number;
  mrrCents: number | null;
};

export function formatUsdFromCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export function formatMetricValue(unit: MetricUnit, value: number | null): string {
  if (value === null) return "n/a";
  return unit === "cents" ? formatUsdFromCents(value) : value.toLocaleString("en-US");
}

/** Fallback label when the catalog has not loaded: 'trial_clicks' -> 'Trial clicks'. */
export function humanizeMetricKey(key: string): string {
  const words = key.replace(/_cents$/, "").split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function catalogEntry(catalog: CatalogEntry[] | null, key: string): CatalogEntry {
  const found = catalog?.find((c) => c.key === key);
  if (found) return found;
  return {
    key,
    label: humanizeMetricKey(key),
    goalLabel: humanizeMetricKey(key).toLowerCase(),
    unit: key.endsWith("_cents") ? "cents" : "count",
    goalable: false,
  };
}

/** '2026-07' -> 'July 2026'. */
export function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

// The business runs on Mountain Time regardless of the admin's own browser
// timezone, so "current month" must match the server's (growth-metrics.ts),
// not whatever UTC or local-to-the-viewer would say.
const GROWTH_TIMEZONE = "America/Denver";

export function currentMonthKey(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GROWTH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Whole months from `from` to `to` (both 'YYYY-MM'); positive when `to` is later. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** True when `month` is later than the current UTC month. */
export function isFutureMonth(month: string): boolean {
  return monthsBetween(currentMonthKey(), month) > 0;
}
