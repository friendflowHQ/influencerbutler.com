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

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
