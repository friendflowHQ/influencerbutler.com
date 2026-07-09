import { getState, patchState } from "../storage/store";
import {
  PRICE_HISTORY_ASINS_CAP,
  PRICE_HISTORY_POINTS_CAP,
  type PricePoint,
} from "../storage/schema";
import type { Finding } from "../transport/types";

// Local price history. As the creator browses, every product price the
// extension already reads is folded into a small per-product series, so the
// product panel can draw a sparkline and flag an all-time low without a Keepa
// account or any extra network call. The record is honest: it starts empty and
// grows from the moment the extension is installed.

// Record at most one unchanged-price sample per this window, but always record a
// price CHANGE immediately, so the series captures moves without bloating when a
// price sits still across many page views.
const SAMPLE_WINDOW_MS = 12 * 60 * 60 * 1000;

export function priceKey(asin: string, marketplace: string): string {
  return `${marketplace}:${asin.toUpperCase()}`;
}

function lastAt(points: PricePoint[] | undefined): number {
  return points && points.length > 0 ? (points[points.length - 1] as PricePoint).at : 0;
}

// Pure reducer: return the history map with `cents` folded into `key` at `now`.
// Kept pure (returns a new map, never mutates the input) so it is unit-testable
// and safe to call inside patchState.
export function recordPricePoint(
  history: Record<string, PricePoint[]>,
  key: string,
  cents: number,
  now: number,
): Record<string, PricePoint[]> {
  if (!Number.isFinite(cents) || cents <= 0) return history;

  const existing = history[key] ?? [];
  const last = existing[existing.length - 1];
  // Skip a redundant same-price sample inside the window; a changed price always
  // records so a drop or spike shows up the next time the creator opens the page.
  if (last && last.cents === cents && now - last.at < SAMPLE_WINDOW_MS) {
    return history;
  }

  const next = { ...history };
  const points = [...existing, { at: now, cents }];
  if (points.length > PRICE_HISTORY_POINTS_CAP) {
    points.splice(0, points.length - PRICE_HISTORY_POINTS_CAP);
  }
  next[key] = points;

  // Enforce the per-map product cap: drop least-recently-seen products first.
  const keys = Object.keys(next);
  if (keys.length > PRICE_HISTORY_ASINS_CAP) {
    keys.sort((a, b) => lastAt(next[a]) - lastAt(next[b]));
    for (const stale of keys.slice(0, keys.length - PRICE_HISTORY_ASINS_CAP)) {
      delete next[stale];
    }
  }
  return next;
}

export async function recordPrice(asin: string, marketplace: string, cents: number): Promise<void> {
  const key = priceKey(asin, marketplace);
  await patchState((state) => {
    state.priceHistory = recordPricePoint(state.priceHistory, key, cents, Date.now());
  });
}

// Fold a product-scan finding's price into the history. Any other finding type,
// or a scan with no usable price, is ignored.
export async function recordPriceFromFinding(finding: Finding): Promise<void> {
  if (finding.type !== "product_scan") return;
  if (typeof finding.priceCents !== "number" || finding.priceCents <= 0) return;
  await recordPrice(finding.asin, finding.marketplace, finding.priceCents);
}

export async function getPriceHistory(asin: string, marketplace: string): Promise<PricePoint[]> {
  const state = await getState();
  return state.priceHistory[priceKey(asin, marketplace)] ?? [];
}
