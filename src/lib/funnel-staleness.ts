// Freshness helpers for built-in funnel copy and sequences (Funnels v2).
//
// "Last touched" for a funnel step is the newest of: the admin override's
// updated_at, its reviewed_at ("Mark reviewed"), and the code-default date in
// COPY_UPDATED_AT (funnel-copy-dates.ts). The badge colors from it:
//   fresh  <= 30 days
//   amber  31-60 days
//   red    > 60 days, or no date at all (never reviewed)
//
// Also: mergeStepTimestamps, used by the sequences admin route so replacing a
// sequence's steps (delete + insert) keeps the old updated_at on steps whose
// content did not change.
//
// Pure, no imports: safe on the client and in tests.

export type Staleness = "fresh" | "amber" | "red";

export const DAY_MS = 86_400_000;
export const FRESH_MAX_DAYS = 30;
export const AMBER_MAX_DAYS = 60;

/** Parses an ISO timestamp or a YYYY-MM-DD date to epoch ms; null when unusable. */
export function toMs(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** Whole days between `date` and `now` (never negative); null without a date. */
export function ageDays(
  date: string | number | Date | null | undefined,
  now: number | Date = Date.now(),
): number | null {
  const t = toMs(date);
  const n = toMs(now);
  if (t === null || n === null) return null;
  return Math.max(0, Math.floor((n - t) / DAY_MS));
}

/** fresh <= 30 days, amber <= 60 days, red beyond (or no date). */
export function staleness(
  date: string | number | Date | null | undefined,
  now: number | Date = Date.now(),
): Staleness {
  const d = ageDays(date, now);
  if (d === null) return "red";
  if (d <= FRESH_MAX_DAYS) return "fresh";
  if (d <= AMBER_MAX_DAYS) return "amber";
  return "red";
}

/** Short label that never relies on color: "Fresh", "Aging (34 days)", "Stale (72 days, review)". */
export function stalenessLabel(
  date: string | number | Date | null | undefined,
  now: number | Date = Date.now(),
): string {
  const d = ageDays(date, now);
  if (d === null) return "Never reviewed";
  const s = staleness(date, now);
  if (s === "fresh") return "Fresh";
  if (s === "amber") return `Aging (${d} days)`;
  return `Stale (${d} days, review)`;
}

export type Stamp = { at: string | null; by: string | null };

/** Newest of several (at, by) stamps; ties keep the earlier argument. Returns
 * the original `at` string (ISO or YYYY-MM-DD) of the winner. */
export function latestStamp(...stamps: Array<Stamp | null | undefined>): Stamp {
  let best: Stamp = { at: null, by: null };
  let bestMs = -Infinity;
  for (const s of stamps) {
    if (!s) continue;
    const ms = toMs(s.at);
    if (ms === null) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = { at: s.at, by: s.by ?? null };
    }
  }
  return best;
}

/** lastTouched = max(updated_at, reviewed_at, code date). */
export function lastTouched(args: {
  updatedAt?: string | null;
  updatedBy?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  codeDate?: string | null;
}): Stamp {
  return latestStamp(
    { at: args.updatedAt ?? null, by: args.updatedBy ?? null },
    { at: args.reviewedAt ?? null, by: args.reviewedBy ?? null },
    { at: args.codeDate ?? null, by: args.codeDate ? "code default" : null },
  );
}

// ---------------------------------------------------------------------------
// Sequence step stamps
// ---------------------------------------------------------------------------

export type StepContent = { day_offset: number; subject: string; body: string };
export type StampedStep = StepContent & { updated_at?: string | null; updated_by?: string | null };

function sameContent(a: StepContent, b: StepContent): boolean {
  return a.day_offset === b.day_offset && a.subject === b.subject && a.body === b.body;
}

/**
 * Stamps replacement steps (compared by position): a step whose
 * (day_offset, subject, body) is unchanged keeps its old updated_at/by (when it
 * had one); every other step gets `now` / `actor`. `contentChanged` is true
 * when any step was edited, added or removed, which is when the sequence's
 * content_updated_at should bump.
 */
export function mergeStepTimestamps<T extends StepContent>(
  oldSteps: ReadonlyArray<StampedStep>,
  newSteps: ReadonlyArray<T>,
  now: string,
  actor: string | null,
): { steps: Array<T & { updated_at: string; updated_by: string | null }>; contentChanged: boolean } {
  let contentChanged = oldSteps.length !== newSteps.length;
  const steps = newSteps.map((step, i) => {
    const prev = oldSteps[i];
    if (prev && sameContent(prev, step)) {
      return {
        ...step,
        updated_at: prev.updated_at || now,
        updated_by: prev.updated_at ? (prev.updated_by ?? null) : actor,
      };
    }
    contentChanged = true;
    return { ...step, updated_at: now, updated_by: actor };
  });
  return { steps, contentChanged };
}
