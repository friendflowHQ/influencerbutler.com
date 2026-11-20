// Pure model for the "Accept campaigns on this page" review sheet. No DOM, so
// the ordering, selection and run rules are unit-testable.

export type SheetItem = {
  id: string;
  title: string;
  brand: string | null;
  ratePct: number | null;
  endsAt: string | null;
  score: number;
};

export type RowStatus = "waiting" | "working" | "done" | "failed" | "skipped";

// Best campaigns first (highest score, then highest commission), capped. Stable
// for ties so the page order breaks them.
export function orderItems(items: readonly SheetItem[], cap: number): SheetItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.score - a.item.score || (b.item.ratePct ?? -1) - (a.item.ratePct ?? -1) || a.index - b.index)
    .slice(0, Math.max(0, cap))
    .map((x) => x.item);
}

// A local gate (robot check, cooldown, accepting turned off) ends the whole
// batch: the remaining campaigns would only fail the same way.
export function isBatchStopper(reason: string | undefined): boolean {
  return reason === "blocked" || reason === "cooldown" || reason === "disabled";
}

export function selectedIds(items: readonly SheetItem[], checked: ReadonlySet<string>): string[] {
  return items.filter((i) => checked.has(i.id)).map((i) => i.id);
}

export type Summary = { done: number; failed: number; skipped: number; total: number };

export function summarize(statuses: Iterable<RowStatus>): Summary {
  let done = 0;
  let failed = 0;
  let skipped = 0;
  let total = 0;
  for (const s of statuses) {
    total += 1;
    if (s === "done") done += 1;
    else if (s === "failed") failed += 1;
    else if (s === "skipped") skipped += 1;
  }
  return { done, failed, skipped, total };
}

// "Ends Nov 30" style date, or null when missing or unparsable.
export function formatEnds(endsAt: string | null, locale: string): string | null {
  if (!endsAt) return null;
  const ms = Date.parse(endsAt);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}
