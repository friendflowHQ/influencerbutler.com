import { rateForCategory, type StoredRateCard } from "../../rate-card/cache";

// Resolve the commission rate (%) that applies to a product, in the same order
// the calculator uses: a live SiteStripe rate wins, then the Associates rate
// card matched on category, then the user's saved default. Kept separate from
// the calculator panel so both the Butler Score badge and the search overlay
// resolve rates identically. Pure: the caller loads the rate card once.
export function resolveRatePct(opts: {
  liveRatePct: number | null;
  category: string | null;
  card: StoredRateCard | null;
  defaultRatePct: number;
}): number {
  if (opts.liveRatePct !== null) return opts.liveRatePct;
  if (opts.card) {
    const match = rateForCategory(opts.card, opts.category);
    if (match) return match.ratePct;
  }
  return opts.defaultRatePct;
}
