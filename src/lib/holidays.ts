/**
 * Owner holidays: whole days when no call can be booked. loadBusy
 * (scheduling-server.ts) treats them as busy, so the public picker, booking
 * re-validation, reschedules, partner-reserved slots and event follow-up offers
 * all skip them. Computed by rule, so no yearly upkeep and no migration.
 *
 * For one-off days off (a ski trip, a school day), use a block in
 * Admin > Scheduling instead.
 */
import { DateTime } from "luxon";
import type { BusyRange } from "@/lib/scheduling";

export const HOLIDAY_TIMEZONE = "America/Denver";

export type Holiday = { date: string; name: string }; // date: 'YYYY-MM-DD'

/** nth (1-based) `weekday` (luxon: 1=Mon..7=Sun) of a month. */
function nthWeekday(year: number, month: number, weekday: number, n: number): DateTime {
  const first = DateTime.utc(year, month, 1);
  return first.plus({ days: ((weekday - first.weekday + 7) % 7) + (n - 1) * 7 });
}

function lastWeekday(year: number, month: number, weekday: number): DateTime {
  const last = DateTime.utc(year, month, 1).endOf("month").startOf("day");
  return last.minus({ days: (last.weekday - weekday + 7) % 7 });
}

export function holidaysForYear(year: number): Holiday[] {
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const days: Array<[DateTime, string]> = [
    [DateTime.utc(year, 1, 1), "New Year's Day"],
    [lastWeekday(year, 5, 1), "Memorial Day"],
    [DateTime.utc(year, 7, 4), "Independence Day"],
    [nthWeekday(year, 9, 1, 1), "Labor Day"],
    [thanksgiving, "Thanksgiving"],
    [thanksgiving.plus({ days: 1 }), "Day after Thanksgiving"],
    [DateTime.utc(year, 12, 24), "Christmas Eve"],
    [DateTime.utc(year, 12, 25), "Christmas Day"],
    [DateTime.utc(year, 12, 31), "New Year's Eve"],
  ];
  return days.map(([d, name]) => ({ date: d.toISODate() as string, name }));
}

/** UTC busy ranges for every holiday that overlaps [fromMs, toMs). */
export function holidayBusyRanges(fromMs: number, toMs: number): BusyRange[] {
  if (fromMs >= toMs) return [];
  const firstYear = DateTime.fromMillis(fromMs, { zone: HOLIDAY_TIMEZONE }).year;
  const lastYear = DateTime.fromMillis(toMs, { zone: HOLIDAY_TIMEZONE }).year;
  const out: BusyRange[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    for (const h of holidaysForYear(year)) {
      const day = DateTime.fromISO(h.date, { zone: HOLIDAY_TIMEZONE });
      const startMs = day.toMillis();
      const endMs = day.plus({ days: 1 }).toMillis();
      if (startMs < toMs && endMs > fromMs) out.push({ startMs, endMs });
    }
  }
  return out;
}
