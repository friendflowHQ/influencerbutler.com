// Shared helpers for the Finance dashboard components.

export function usd(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "-";
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Parse a dollars string ("21.49") into integer cents, or null. */
export function parseDollarsToCents(value: string): number | null {
  const n = Number(value.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
      new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso),
    );
  } catch {
    return iso;
  }
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export type StepUpState = "unknown" | "required" | "verified";
