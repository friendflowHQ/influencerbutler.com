import { getCache, loadFilters, membership } from "../../catalogue/cache";
import { getRateCard } from "../../rate-card/cache";
import { computeButlerScore } from "./model";
import { resolveRatePct } from "./rate";
import { renderScore } from "./badge";
import type { ProductSignals } from "../../amazon/product-signals";
import type { VideoCounts } from "../../transport/types";
import type { Settings } from "../../storage/schema";

// Product-page orchestration for the Butler Score: load the rate card and the
// campaign catalogue (both cached locally, zero server cost), resolve this
// product's commission rate, compute the score, and render the badge. Returns
// the score so the caller can add a popup summary line. The panel rebuilds when
// video coverage improves, so a partial influencer count is refined on rerun.
export async function renderProductScore(
  signals: ProductSignals,
  counts: VideoCounts | null,
  settings: Settings,
): Promise<number | null> {
  if (!signals.asin) return null;
  const [card, cache] = await Promise.all([getRateCard(), getCache()]);
  const flags = membership(loadFilters(cache), signals.asin);
  const ratePct = resolveRatePct({
    liveRatePct: signals.commissionRatePct,
    category: signals.category,
    card,
    defaultRatePct: settings.commissionRatePct,
  });
  const score = computeButlerScore(
    {
      priceCents: signals.priceCents,
      commissionRatePct: ratePct,
      influencerVideos: counts ? counts.influencer : null,
      boughtPastMonth: signals.boughtPastMonth,
      reviewCount: null,
      inStock: signals.inStock,
      membership: { cc: flags.cc, spcc: flags.spcc },
    },
    settings,
  );
  renderScore(score);
  return score.score;
}
