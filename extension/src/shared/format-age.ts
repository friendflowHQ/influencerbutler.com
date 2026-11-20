// "2h ago" style ages for data freshness labels. Pure so it can be tested
// without a clock or a browser.

export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// Milliseconds since `iso`, or null when the date is missing or unparsable.
export function ageMs(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, nowMs - then);
}

export function isStale(iso: string | null | undefined, nowMs: number): boolean {
  const age = ageMs(iso, nowMs);
  return age !== null && age > STALE_AFTER_MS;
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

// Relative age in the given locale ("2 hours ago", "hace 3 dias"), "just now"
// style for under a minute (via the formatter's numeric:auto), null when unknown.
export function formatAge(iso: string | null | undefined, nowMs: number, locale: string): string | null {
  const age = ageMs(iso, nowMs);
  if (age === null) return null;
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  } catch {
    rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
  }
  for (const [unit, size] of UNITS) {
    if (age >= size) return rtf.format(-Math.floor(age / size), unit);
  }
  return rtf.format(0, "second");
}
