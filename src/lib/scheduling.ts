/**
 * Call scheduling engine — pure, timezone-correct (luxon). Powers both the
 * customer slot picker and the owner calendar, so availability is computed the
 * same way everywhere. All returned instants are UTC epoch-ms; render per
 * viewer in their own IANA zone.
 */
import { DateTime } from "luxon";

export type CallTypeKey = "support" | "demo";

export const CALL_TYPES: Record<CallTypeKey, {
  key: CallTypeKey;
  label: string;
  userMinutes: number;   // shown to the customer (their calendar invite length)
  blockMinutes: number;  // reserved on the owner's calendar (incl. wrap buffer)
  requiresSubscription: boolean;
  description: string;
}> = {
  support: {
    key: "support",
    label: "Support call",
    userMinutes: 45,
    blockMinutes: 60,
    requiresSubscription: true,
    description: "A 45-minute 1:1 to work through an issue with your setup.",
  },
  demo: {
    key: "demo",
    label: "Demo call",
    userMinutes: 120,
    blockMinutes: 120,
    requiresSubscription: false,
    description: "A 2-hour walkthrough of Influencer Butler, tailored to you.",
  },
};

export type AvailabilityRule = {
  weekday: number;      // 0=Sun..6=Sat
  start_min: number;
  end_min: number;
  timezone: string;     // IANA
  effective_from: string | null; // 'YYYY-MM-DD'
  effective_to: string | null;   // 'YYYY-MM-DD' exclusive
};

export type BusyRange = { startMs: number; endMs: number };

/** An always-on weekly protected block (owner deep-work, standing personal
 *  time). Expanded across the horizon into busy ranges, like decoys. */
export type RecurringBlock = {
  weekday: number;   // 0=Sun..6=Sat
  start_min: number; // minutes from local midnight
  end_min: number;
  timezone: string;  // IANA
};

export type Slot = {
  startMs: number;    // block start (UTC)
  endMs: number;      // block end (UTC, incl. buffer)
  userEndMs: number;  // customer-facing end (UTC)
};

const GRID_MIN = 30;   // slots start on a 30-minute grid
const DECOY_LENGTHS = [45, 60];
const FIXED_DECOY_START = 900;  // 15:00 local (minutes)
const FIXED_DECOY_END = 1020;   // 17:00 local
const PROTECT_MIN = 120;        // keep one demo-length window decoy-free each day

// luxon weekday is 1=Mon..7=Sun; DB weekday is 0=Sun..6=Sat.
function luxonToDbWeekday(luxonWeekday: number): number {
  return luxonWeekday % 7; // Mon(1)->1 ... Sun(7)->0
}

/** Pick the availability rule active on `dateISO` for its weekday, or null. */
export function activeRuleForDate(rules: AvailabilityRule[], dateISO: string): AvailabilityRule | null {
  const dt = DateTime.fromISO(dateISO);
  if (!dt.isValid) return null;
  const dbWeekday = luxonToDbWeekday(dt.weekday);
  const candidates = rules.filter((r) => {
    if (r.weekday !== dbWeekday) return false;
    if (r.effective_from && dateISO < r.effective_from) return false;
    if (r.effective_to && dateISO >= r.effective_to) return false;
    return true;
  });
  // If both an ending and a starting rule match the boundary date, prefer the
  // one whose effective window is more specific (has effective_from set).
  candidates.sort((a, b) => (b.effective_from ? 1 : 0) - (a.effective_from ? 1 : 0));
  return candidates[0] ?? null;
}

// Deterministic PRNG (mulberry32) seeded from a string, so decoy blocks are
// stable across renders (they don't reshuffle on refresh) but look organic.
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local-minute ranges for a day's decoy blocks (fixed 3-5pm + a few random). */
export function decoyRangesForDay(
  dateISO: string,
  rule: AvailabilityRule,
  opts: { minPerDay: number; maxPerDay: number },
): Array<{ startMin: number; endMin: number }> {
  const ranges: Array<{ startMin: number; endMin: number }> = [];
  // Fixed afternoon block (3-5pm) when it falls inside the window.
  if (FIXED_DECOY_START < rule.end_min) {
    ranges.push({ startMin: Math.max(FIXED_DECOY_START, rule.start_min), endMin: Math.min(FIXED_DECOY_END, rule.end_min) });
  }
  const rand = mulberry32(hashSeed(dateISO));
  const randCeil = Math.min(FIXED_DECOY_START, rule.end_min); // random decoys live before the fixed block

  // Reserve one demo-length (2h) window, grid-aligned and decoy-free, so a demo
  // can always be booked despite the breaks. This window is NOT a decoy; we
  // just avoid placing decoys on it.
  const protLatest = randCeil - PROTECT_MIN;
  let protect: { startMin: number; endMin: number } | null = null;
  if (protLatest >= rule.start_min) {
    const gridSlots = Math.floor((protLatest - rule.start_min) / GRID_MIN);
    const pStart = rule.start_min + Math.floor(rand() * (gridSlots + 1)) * GRID_MIN;
    protect = { startMin: pStart, endMin: pStart + PROTECT_MIN };
  }
  const blocked = () => (protect ? [...ranges, protect] : ranges);

  const count = opts.minPerDay + Math.floor(rand() * (Math.max(opts.minPerDay, opts.maxPerDay) - opts.minPerDay + 1));
  let attempts = 0;
  while (ranges.length < count + 1 && attempts < 60) {
    attempts++;
    const len = DECOY_LENGTHS[Math.floor(rand() * DECOY_LENGTHS.length)];
    const latestStart = randCeil - len;
    if (latestStart <= rule.start_min) break;
    const gridSlots = Math.floor((latestStart - rule.start_min) / GRID_MIN);
    const startMin = rule.start_min + Math.floor(rand() * (gridSlots + 1)) * GRID_MIN;
    const endMin = startMin + len;
    const overlaps = blocked().some((r) => startMin < r.endMin && endMin > r.startMin);
    if (!overlaps) ranges.push({ startMin, endMin });
  }
  return ranges;
}

function localMinToUtcMs(dateISO: string, minutes: number, tz: string): number {
  return DateTime.fromISO(dateISO, { zone: tz }).plus({ minutes }).toMillis();
}

/** UTC busy-ranges for a day's decoys (for overlap tests + owner display). */
export function decoyBusyRanges(
  dateISO: string,
  rule: AvailabilityRule,
  opts: { minPerDay: number; maxPerDay: number },
): BusyRange[] {
  return decoyRangesForDay(dateISO, rule, opts).map((r) => ({
    startMs: localMinToUtcMs(dateISO, r.startMin, rule.timezone),
    endMs: localMinToUtcMs(dateISO, r.endMin, rule.timezone),
  }));
}

function overlaps(aStart: number, aEnd: number, busy: BusyRange[]): boolean {
  return busy.some((b) => aStart < b.endMs && aEnd > b.startMs);
}

/**
 * Bookable slots for a single day + call type. Grid-aligned starts whose full
 * BLOCK fits in the window, minus decoys, manual blocks, existing bookings,
 * past times, and the lead-time floor.
 */
export function computeDaySlots(args: {
  dateISO: string;
  callType: CallTypeKey;
  rules: AvailabilityRule[];
  busy: BusyRange[];        // existing confirmed bookings + manual blocks (UTC)
  nowMs: number;
  leadHours: number;
  decoyOpts: { minPerDay: number; maxPerDay: number };
}): Slot[] {
  const rule = activeRuleForDate(args.rules, args.dateISO);
  if (!rule) return [];
  const ct = CALL_TYPES[args.callType];
  const tz = rule.timezone;
  const decoys = decoyBusyRanges(args.dateISO, rule, args.decoyOpts);
  const busy = [...args.busy, ...decoys];
  const leadFloorMs = args.nowMs + args.leadHours * 3600_000;

  const slots: Slot[] = [];
  for (let m = rule.start_min; m + ct.blockMinutes <= rule.end_min; m += GRID_MIN) {
    const startMs = localMinToUtcMs(args.dateISO, m, tz);
    const endMs = startMs + ct.blockMinutes * 60_000;
    const userEndMs = startMs + ct.userMinutes * 60_000;
    if (startMs < leadFloorMs) continue;
    if (overlaps(startMs, endMs, busy)) continue;
    slots.push({ startMs, endMs, userEndMs });
  }
  return slots;
}

/**
 * Expand weekly recurring blocks into UTC busy ranges that overlap [fromMs,
 * toMs]. Each block is materialized per matching calendar day in its own zone,
 * so DST is handled the same way as availability windows.
 */
export function recurringBlockBusyRanges(blocks: RecurringBlock[], fromMs: number, toMs: number): BusyRange[] {
  if (fromMs >= toMs) return [];
  const out: BusyRange[] = [];
  for (const block of blocks) {
    const tz = block.timezone;
    // Walk calendar days in the block's zone, padding a day each side so a
    // block spanning midnight (in UTC terms) near the range edges is caught.
    let day = DateTime.fromMillis(fromMs, { zone: tz }).startOf("day").minus({ days: 1 });
    const last = DateTime.fromMillis(toMs, { zone: tz }).startOf("day").plus({ days: 1 });
    for (; day <= last; day = day.plus({ days: 1 })) {
      if (luxonToDbWeekday(day.weekday) !== block.weekday) continue;
      const dateISO = day.toISODate();
      if (!dateISO) continue;
      const startMs = localMinToUtcMs(dateISO, block.start_min, tz);
      const endMs = localMinToUtcMs(dateISO, block.end_min, tz);
      if (endMs > startMs && startMs < toMs && endMs > fromMs) out.push({ startMs, endMs });
    }
  }
  return out;
}

/** ISO date strings (in `tz`) from today through `horizonDays` ahead. */
export function horizonDates(nowMs: number, horizonDays: number, tz: string): string[] {
  const start = DateTime.fromMillis(nowMs, { zone: tz }).startOf("day");
  const out: string[] = [];
  for (let i = 0; i < horizonDays; i++) out.push(start.plus({ days: i }).toISODate() as string);
  return out;
}
