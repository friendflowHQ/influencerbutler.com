// Pure money math for the Creator Hub "Manage videos" overlay. No DOM, no Chrome
// APIs, so it is unit-testable on its own. The overlay reads the manage rows,
// resolves each to its tagged ASINs, fans out the shared earnings / market / CC
// lookups, and hands the results here to build one VideoMoney per row and to
// rank them for the reshoot panel.

import type { CcRate, MarketProduct } from "../../shared/messages";
import type { AsinEarnings } from "../../transport/hud-commands";
import { calculate } from "../calculator/model";
import { tileTotals, type CurrencyTotal } from "../earnings-overlay/model";

export type VideoStatus = "published" | "draft" | "other";

// DOM-free view of one manage-list video, built by the overlay from a ManageRow
// plus the harvest join.
export type VideoInput = {
  contentId: string;
  title: string | null;
  status: VideoStatus;
  views: number | null;
  asins: string[];
};

// Demand direction from a product's BSR trend. "up" means the product is
// selling better (its rank fell), "down" worse. Null when there is not enough
// history to tell.
export type DemandTrend = "up" | "down" | "flat" | null;

// Everything the row badge and the reshoot panel need for one video.
export type VideoMoney = {
  contentId: string;
  title: string | null;
  status: VideoStatus;
  views: number | null;
  asins: string[];
  // Scoped real earnings (desktop ledger), possibly several currencies, sorted
  // by amount. Empty when unpaired or the video never earned.
  earned: CurrencyTotal[];
  // Earnings per 1,000 views in the top currency: the headline "what converts"
  // number. Null with no earnings or no view count.
  epv: number | null;
  // Best live Creator Connections rate across the video's product(s), and when
  // that campaign ends (ISO), for the "pays X% right now" / "ending" chip.
  liveRatePct: number | null;
  rateEndsAt: string | null;
  // Real demand: max bought-past-month across tagged products, plus BSR trend.
  boughtPastMonth: number | null;
  demand: DemandTrend;
  // Projected earnings (cents) for these views at the live/default rate, shown
  // only when there are no real earnings (unpaired users). Null otherwise.
  projectedCents: number | null;
  currency: string;
};

// `/vdp/<contentId>` -> contentId. The storefront harvest keys videos by this
// URL, which joins to the manage row's `/creatorhub/video/<contentId>` link.
export function vdpContentId(url: string): string | null {
  return url.match(/\/vdp\/([^/?#]+)/)?.[1]?.trim() ?? null;
}

// Build a contentId -> tagged-ASINs index from harvested storefront items, so a
// manage row can look its products up by contentId. ASINs are upper-cased and
// de-duplicated; items without a /vdp/ url are skipped.
export function buildContentAsinIndex(
  items: Array<{ url: string; taggedAsins: string[] }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const item of items) {
    const id = vdpContentId(item.url);
    if (!id) continue;
    const asins = item.taggedAsins.map((a) => a.toUpperCase()).filter(Boolean);
    const prior = map.get(id) ?? [];
    map.set(id, [...new Set([...prior, ...asins])]);
  }
  return map;
}

// Earnings per 1,000 views. Null unless both a positive amount and positive
// view count are known.
export function epvPer1000(amount: number, views: number | null): number | null {
  if (views === null || !Number.isFinite(views) || views <= 0) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return (amount / views) * 1000;
}

// Projected earnings (cents) for a view count at a commission rate, via the
// calculator model with no competition split (share = 1) and no time cost, so
// the figure is simply views x conversion x commission-per-sale. Null when the
// price or view count is unknown.
export function projectedEarningsCents(input: {
  priceCents: number | null;
  ratePct: number;
  views: number | null;
  conversionPct: number;
}): number | null {
  if (input.priceCents === null || input.priceCents <= 0) return null;
  if (input.views === null || input.views <= 0) return null;
  const result = calculate({
    priceCents: input.priceCents,
    commissionRatePct: input.ratePct,
    viewsPerMonth: input.views,
    conversionPct: input.conversionPct,
    minutesPerVideo: 0,
    hourlyValueCents: 0,
    influencerCompetition: 0,
  });
  return result.estMonthlyProfitCents;
}

// Demand direction from an oldest-first BSR trend. Lower rank is better, so a
// falling rank ("up") means the product is selling better. Needs at least two
// real rank points; a >15% relative move counts as a trend, otherwise flat.
export function demandTrend(
  trend: Array<{ bsrRank: number | null }> | undefined,
): DemandTrend {
  if (!trend || trend.length === 0) return null;
  const ranks = trend
    .map((p) => p.bsrRank)
    .filter((r): r is number => r !== null && Number.isFinite(r) && r > 0);
  if (ranks.length < 2) return null;
  const first = ranks[0];
  const last = ranks[ranks.length - 1];
  if (first === undefined || last === undefined) return null;
  const rel = (first - last) / Math.max(first, 1);
  if (rel > 0.15) return "up";
  if (rel < -0.15) return "down";
  return "flat";
}

// Compose one VideoMoney from the per-ASIN lookup results.
export function buildVideoMoney(
  video: VideoInput,
  ctx: {
    earnings: Map<string, AsinEarnings>;
    market: Map<string, MarketProduct>;
    ccRates: Map<string, CcRate>;
    marketplace: string | null;
    defaultRatePct: number;
    conversionPct: number;
  },
): VideoMoney {
  const asins = video.asins.map((a) => a.toUpperCase());
  const earned = tileTotals(ctx.earnings, asins, "market", ctx.marketplace);

  // Best live rate across the tagged products (and that campaign's end date).
  let liveRatePct: number | null = null;
  let rateEndsAt: string | null = null;
  for (const asin of asins) {
    const rate = ctx.ccRates.get(asin);
    if (rate && (liveRatePct === null || rate.ratePct > liveRatePct)) {
      liveRatePct = rate.ratePct;
      rateEndsAt = rate.endsAt;
    }
  }

  // Demand: max real bought-past-month, and the trend of the product with the
  // richest history. Price for the projection comes from the same pool.
  let boughtPastMonth: number | null = null;
  let priceCents: number | null = null;
  let currency: string | null = null;
  let trendSource: MarketProduct | null = null;
  for (const asin of asins) {
    const product = ctx.market.get(asin);
    if (!product) continue;
    if (product.boughtPastMonth !== null) {
      boughtPastMonth = Math.max(boughtPastMonth ?? 0, product.boughtPastMonth);
    }
    if (priceCents === null && product.priceCents !== null) {
      priceCents = product.priceCents;
      currency = product.currency;
    }
    if (!trendSource || product.trend.length > trendSource.trend.length) trendSource = product;
  }

  const top = earned[0];
  const topCurrency = top?.currency ?? currency ?? "USD";
  const epv = top ? epvPer1000(top.amount, video.views) : null;
  const projectedCents =
    earned.length === 0
      ? projectedEarningsCents({
          priceCents,
          ratePct: liveRatePct ?? ctx.defaultRatePct,
          views: video.views,
          conversionPct: ctx.conversionPct,
        })
      : null;

  return {
    contentId: video.contentId,
    title: video.title,
    status: video.status,
    views: video.views,
    asins,
    earned,
    epv,
    liveRatePct,
    rateEndsAt,
    boughtPastMonth,
    demand: demandTrend(trendSource?.trend),
    projectedCents,
    currency: topCurrency,
  };
}

// The primary earned amount (top currency) for ranking/sorting.
export function primaryEarnedAmount(vm: VideoMoney): number {
  return vm.earned[0]?.amount ?? 0;
}

// Median view count across videos that report views. Used as the "low views"
// threshold for the reshoot opportunity list.
export function medianViews(list: VideoMoney[]): number | null {
  const views = list
    .map((v) => v.views)
    .filter((v): v is number => v !== null && v >= 0)
    .sort((a, b) => a - b);
  if (views.length === 0) return null;
  const mid = Math.floor(views.length / 2);
  const hi = views[mid] ?? 0;
  if (views.length % 2) return hi;
  const lo = views[mid - 1] ?? hi;
  return Math.round((lo + hi) / 2);
}

// Top earners, by real earnings in the top currency, dropping zero-earners.
export function topEarners(list: VideoMoney[], n: number): VideoMoney[] {
  return [...list]
    .filter((v) => primaryEarnedAmount(v) > 0)
    .sort((a, b) => primaryEarnedAmount(b) - primaryEarnedAmount(a))
    .slice(0, n);
}

// Best EPV: which content actually converts per view, dropping unknowns.
export function bestEpv(list: VideoMoney[], n: number): VideoMoney[] {
  return [...list]
    .filter((v) => v.epv !== null)
    .sort((a, b) => (b.epv ?? 0) - (a.epv ?? 0))
    .slice(0, n);
}

// Reshoot opportunities: a product that pays well right now (live rate at or
// above the user's Campaign Radar floor) whose video is under-viewed (at or
// below the median). Re-pin or reshoot to catch the active campaign.
export function reshootPicks(list: VideoMoney[], minRatePct: number): VideoMoney[] {
  const median = medianViews(list);
  const threshold = median ?? Infinity;
  return [...list]
    .filter(
      (v) =>
        v.status !== "draft" &&
        v.liveRatePct !== null &&
        v.liveRatePct >= minRatePct &&
        v.views !== null &&
        v.views <= threshold,
    )
    .sort((a, b) => (b.liveRatePct ?? 0) - (a.liveRatePct ?? 0));
}

// Cooling / retire candidates: the tagged product's demand is falling, or its
// Creator Connections campaign has ended. Only videos that resolved to a product.
export function coolingPicks(list: VideoMoney[], nowMs: number): VideoMoney[] {
  return list.filter((v) => {
    if (v.asins.length === 0) return false;
    const campaignEnded = v.rateEndsAt !== null && Date.parse(v.rateEndsAt) < nowMs;
    return v.demand === "down" || campaignEnded;
  });
}

// Draft rows the creator has not finished/published.
export function drafts(list: VideoMoney[]): VideoMoney[] {
  return list.filter((v) => v.status === "draft");
}
