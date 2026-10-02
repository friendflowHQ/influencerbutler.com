// Shared timezone helpers (no date library; Intl only).
//
// The business operates on Mountain Time ("today", "this month", send
// windows) regardless of where a request or a visitor's browser clock comes
// from, so "current month" and day-bucketing logic must anchor to this zone
// instead of UTC or the caller's local clock. See src/lib/daily-digest.ts for
// the original version of these helpers; this module is the shared source so
// src/lib/growth-metrics.ts can use the same local-day logic without a
// circular import.

export const DEFAULT_TIMEZONE = "America/Denver";

export type LocalParts = { year: number; month: number; day: number; hour: number };

/** Wall-clock Y/M/D/H in a timezone for a given instant. */
export function localParts(date: Date, tz: string): LocalParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
  };
}

/** "YYYY-MM-DD" wall-clock date in a timezone. */
export function localDateStr(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "YYYY-MM" wall-clock month in a timezone, e.g. for the live dashboard's "current month". */
export function currentMonthKey(date: Date, tz: string = DEFAULT_TIMEZONE): string {
  const p = localParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

/** Offset (localWall - UTC) in ms for an instant in a timezone. */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

/** The UTC instant of a wall-clock time (y,m,d,h:00) in a timezone. */
export function zonedTimeToUtc(y: number, m: number, d: number, h: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, 0, 0);
  const offset = tzOffsetMs(new Date(guess), tz);
  let instant = guess - offset;
  // One refinement handles the DST transition where the first guess landed in
  // the wrong offset.
  const offset2 = tzOffsetMs(new Date(instant), tz);
  if (offset2 !== offset) instant = guess - offset2;
  return new Date(instant);
}
