/**
 * Pure metric math for the per-video "passport" (see the video-intel route).
 * Kept separate from the route so it is unit-testable without a database.
 *
 * The one rule: never fabricate a longitudinal metric. Presence, rotation, and
 * active-day strength are withheld (null, collecting=true) until enough distinct
 * days have accrued, and a calendar day with no observation is "no_data", never
 * treated as the video being absent.
 */

export const WINDOW_DAYS = 90;
export const MIN_ACTIVE_DAYS = 3;
const DAY_MS = 86_400_000;

export type DayRow = {
  observed_day: string;
  asin: string;
  carousel: string;
  position: number | null;
};

export type PassportSeriesDay = {
  day: string;
  status: "visible" | "no_data";
  asinCount: number;
};

export type Passport = {
  collecting: boolean;
  firstSeen: string | null;
  daysTracked: number;
  activeDays: number;
  productReach: number;
  upperShare: number | null;
  lowerShare: number | null;
  presenceRate: number | null;
  rotationRate: number | null;
  stability: number | null;
  activeDayStrength: number | null;
  series: PassportSeriesDay[];
};

export function buildPassport(
  rows: DayRow[],
  firstSeen: string | null,
  nowMs: number = Date.now(),
): Passport {
  const daysSinceFirst = firstSeen
    ? Math.floor((nowMs - Date.parse(`${firstSeen}T00:00:00Z`)) / DAY_MS) + 1
    : 0;
  const daysTracked = Math.max(0, Math.min(WINDOW_DAYS, daysSinceFirst));

  const byDay = new Map<string, DayRow[]>();
  for (const row of rows) {
    const list = byDay.get(row.observed_day) ?? [];
    list.push(row);
    byDay.set(row.observed_day, list);
  }
  const activeDays = byDay.size;
  const productReach = new Set(rows.map((r) => r.asin)).size;

  let upperObs = 0;
  let lowerObs = 0;
  let asinDaySum = 0;
  for (const [, dayRows] of byDay) {
    for (const r of dayRows) {
      if (r.carousel === "upper") upperObs += 1;
      else if (r.carousel === "lower") lowerObs += 1;
    }
    asinDaySum += new Set(dayRows.map((r) => r.asin)).size;
  }
  const totalSide = upperObs + lowerObs;
  const upperShare = totalSide > 0 ? upperObs / totalSide : null;
  const lowerShare = totalSide > 0 ? lowerObs / totalSide : null;

  const { transitions, changes } = countRotations(rows);
  const collecting = activeDays < MIN_ACTIVE_DAYS || transitions < 1;

  return {
    collecting,
    firstSeen,
    daysTracked,
    activeDays,
    productReach,
    upperShare,
    lowerShare,
    presenceRate: collecting || daysTracked === 0 ? null : activeDays / daysTracked,
    rotationRate: transitions > 0 ? changes / transitions : null,
    stability: transitions > 0 ? 1 - changes / transitions : null,
    activeDayStrength: collecting || activeDays === 0 ? null : asinDaySum / activeDays,
    series: buildSeries(byDay, nowMs),
  };
}

// Coarse placement bucket so small position jitter is not read as churn.
export function positionBand(position: number | null): string {
  if (position === null) return "x";
  if (position <= 3) return "a";
  if (position <= 6) return "b";
  return "c";
}

export function countRotations(rows: DayRow[]): { transitions: number; changes: number } {
  const byAsin = new Map<string, Map<string, string>>();
  for (const r of rows) {
    const days = byAsin.get(r.asin) ?? new Map<string, string>();
    if (!days.has(r.observed_day)) {
      days.set(r.observed_day, `${r.carousel}:${positionBand(r.position)}`);
    }
    byAsin.set(r.asin, days);
  }
  let transitions = 0;
  let changes = 0;
  for (const [, days] of byAsin) {
    const ordered = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (let i = 1; i < ordered.length; i += 1) {
      transitions += 1;
      if (ordered[i]![1] !== ordered[i - 1]![1]) changes += 1;
    }
  }
  return { transitions, changes };
}

export function buildSeries(byDay: Map<string, DayRow[]>, nowMs: number): PassportSeriesDay[] {
  const out: PassportSeriesDay[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(nowMs - i * DAY_MS).toISOString().slice(0, 10);
    const dayRows = byDay.get(d);
    if (dayRows && dayRows.length > 0) {
      out.push({ day: d, status: "visible", asinCount: new Set(dayRows.map((r) => r.asin)).size });
    } else {
      out.push({ day: d, status: "no_data", asinCount: 0 });
    }
  }
  return out;
}
