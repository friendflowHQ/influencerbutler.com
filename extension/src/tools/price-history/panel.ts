import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { formatCents } from "../calculator/model";
import {
  sendToBackground,
  type MarketMonthlyBucket,
  type MarketResult,
  type PricePoint,
} from "../../shared/messages";
import type { DesktopHistoryResult } from "../../transport/hud-commands";
import type { ProductSignals } from "../../amazon/product-signals";
import { formatEstRevenue, formatEstUnits, resolveEstimate } from "../../amazon/bsr-revenue-estimator";
import {
  bucketByMonth,
  formatSeasonality,
  fromMonthly,
  type MonthlyBucket,
  type Seasonality,
} from "./seasonality";
import {
  classifyRankTrend,
  coveredBars,
  formatCompactUnits,
  monthlyUnits,
  ninetyDayAvg,
  peakBar,
  type RankTrend,
  type UnitsBar,
} from "./sales-histogram";

// Price history (and, when the desktop app is paired, sales-rank history) for
// the product being viewed. Prefers the desktop app's durable time-series over
// the extension's capped local store: the app keeps every point forever and can
// backfill deeper history, so the paired experience shows the full trend while
// the unpaired one stays the honest "since you started browsing" sparkline.
const SVG_NS = "http://www.w3.org/2000/svg";
const W = 200;
const H = 44;
const PAD = 5;
// The histogram needs at least this many of the trailing 12 months to carry
// data before it draws, so a stale series never shows a mostly-empty chart.
const HISTOGRAM_MIN_COVERED = 6;
// Rank-vs-90-day-average deadband: a current within this fraction of the average
// reads as "steady" rather than rising or slipping.
const RANK_TREND_DEADBAND = 0.1;

// One generic sparkline sample: epoch ms + display value in the series' own
// unit (cents for price, rank for BSR).
type Sample = { at: number; value: number };

export function renderPriceHistory(signals: ProductSignals): void {
  if (!signals.asin) return;
  const section = addSection(t().priceHistoryTitle);
  section.style.display = "none"; // reveal only once we have a trend to show
  void fill(section, signals);
}

async function fill(section: HTMLElement, signals: ProductSignals): Promise<void> {
  const asin = signals.asin;
  if (!asin) {
    section.remove();
    return;
  }

  // Ask all three sources in parallel. Desktop (durable, deepest) and local
  // (capped, per-install) cover the personal history; the shared catalogue adds
  // pooled community history plus the estimated-sales figure, and each silently
  // no-ops when unavailable (app not paired, signed out, or migration pending).
  const [desktop, local, market] = await Promise.all([
    sendToBackground<DesktopHistoryResult>({ kind: "GET_DESKTOP_HISTORY", asin }).catch(
      () => null,
    ),
    sendToBackground<PricePoint[]>({
      kind: "GET_PRICE_HISTORY",
      asin,
      marketplace: signals.marketplace,
    }).catch(() => null),
    // seasonality: the product page (and only the product page) also asks for
    // the pooled monthly rank buckets behind the seasonality chip.
    sendToBackground<MarketResult>({
      kind: "GET_MARKET",
      asin,
      marketplace: signals.marketplace,
      seasonality: true,
    }).catch(() => null),
  ]);

  const desktopPoints = desktop && desktop.ok && Array.isArray(desktop.points) ? desktop.points : [];
  const pool = market && market.ok ? market.product : null;
  const poolTrend = pool && Array.isArray(pool.trend) ? pool.trend : [];

  // Price series: desktop first (price is in currency units → cents), local
  // fallback. Two points minimum before we draw anything.
  const desktopPrice: Sample[] = desktopPoints
    .filter((p) => p.price !== null && Number.isFinite(p.price))
    .map((p) => ({ at: Date.parse(p.capturedAt), value: Math.round((p.price as number) * 100) }))
    .filter((s) => Number.isFinite(s.at))
    .sort((a, b) => a.at - b.at);
  const localPrice: Sample[] = (Array.isArray(local) ? local : []).map((p) => ({
    at: p.at,
    value: p.cents,
  }));
  // Pooled community price series from the shared catalogue, used as a fallback
  // when the personal stores are thin so a product the user just opened can
  // still show a trend the community has already built.
  const poolPrice: Sample[] = poolTrend
    .filter((p) => p.priceCents !== null && Number.isFinite(p.priceCents))
    .map((p) => ({ at: Date.parse(p.capturedAt), value: p.priceCents as number }))
    .filter((s) => Number.isFinite(s.at))
    .sort((a, b) => a.at - b.at);
  const fromDesktop = desktopPrice.length >= 2;
  const price =
    fromDesktop ? desktopPrice : localPrice.length >= 2 ? localPrice : poolPrice;

  // Sales-rank series: desktop first, then the pooled catalogue. Lower rank =
  // better, so the sparkline is drawn inverted.
  const desktopRank: Sample[] = desktopPoints
    .filter((p) => p.bsr !== null && Number.isFinite(p.bsr))
    .map((p) => ({ at: Date.parse(p.capturedAt), value: p.bsr as number }))
    .filter((s) => Number.isFinite(s.at))
    .sort((a, b) => a.at - b.at);
  const poolRank: Sample[] = poolTrend
    .filter((p) => p.bsrRank !== null && Number.isFinite(p.bsrRank))
    .map((p) => ({ at: Date.parse(p.capturedAt), value: p.bsrRank as number }))
    .filter((s) => Number.isFinite(s.at))
    .sort((a, b) => a.at - b.at);
  const rank = desktopRank.length >= 2 ? desktopRank : poolRank;

  const hasPrice = price.length >= 2;
  const hasRank = rank.length >= 2;
  // Estimated monthly units + revenue, unified across the pooled catalogue and a
  // local BSR estimate: prefer the pool's calibrated units, fall back to the
  // on-page BSR + price so the figures show even off the pool.
  const est = resolveEstimate({
    serverUnits: pool?.estMonthlySales ?? null,
    salesRank: signals.bestsellerRank?.rank ?? pool?.bsrRank ?? null,
    priceCents: signals.priceCents ?? pool?.priceCents ?? null,
    category: signals.category ?? signals.bestsellerRank?.category ?? pool?.bsrCategory ?? null,
    boughtPastMonth: signals.boughtPastMonth ?? pool?.boughtPastMonth ?? null,
  });
  // The estimate and the real demand figure are worth showing even for a product
  // with no trend yet, so the panel opens when any of the signals exists.
  const hasPoolEstimate = pool != null && pool.estMonthlySales != null;
  const hasEstimate = est.units != null;
  const hasBought = pool != null && pool.boughtPastMonth != null;
  if (!hasPrice && !hasRank && !hasEstimate && !hasBought) {
    section.remove();
    return;
  }
  // The pooled catalogue supplied at least one signal not present in the personal
  // stores: note the source so the number's provenance is clear.
  const usingPool =
    (!fromDesktop && localPrice.length < 2 && poolPrice.length >= 2) ||
    (desktopRank.length < 2 && poolRank.length >= 2) ||
    hasPoolEstimate ||
    hasBought;

  // Seasonality chip and the 12-month sales histogram share one source of
  // monthly rank buckets, picked in depth order (desktop history, pooled monthly
  // buckets, pooled trend) and only from a source that clears the coverage floor.
  const { season, buckets: monthlyBuckets } = resolveSeasonalityWithBuckets(
    desktopRank,
    pool?.monthly,
    poolRank,
    Date.now(),
  );

  if (hasPrice) {
    const currency = signals.currency || "USD";
    const values = price.map((s) => s.value);
    const min = Math.min(...values);
    const current = values[values.length - 1] ?? min;

    section.append(sparkline(price, { markIndex: values.indexOf(min) }));

    const summary = el("div", "counts");
    summary.append(chip("", t().priceHistoryNow(formatCents(current, currency))));
    summary.append(chip("good", t().priceHistoryLow(formatCents(min, currency))));
    if (current <= min) summary.append(chip("good", t().priceHistoryLowest));
    section.append(summary);
  }

  if (hasRank) {
    const heading = el("p", "note", t().bsrHistoryTitle);
    heading.style.marginTop = "8px";
    heading.style.fontWeight = "600";
    section.append(heading);

    const values = rank.map((s) => s.value);
    const best = Math.min(...values);
    const current = values[values.length - 1] ?? best;
    section.append(sparkline(rank, { invert: true, markIndex: values.indexOf(best) }));

    const summary = el("div", "counts");
    summary.append(chip("", t().bsrHistoryNow(current.toLocaleString())));
    summary.append(chip("good", t().bsrHistoryBest(best.toLocaleString())));
    // Rank now vs its trailing 90-day average, with a one-word verdict (lower
    // rank = better, so "rising" means the number went down). Only when the
    // series actually reaches into the last 90 days.
    const avg90 = ninetyDayAvg(rank, Date.now());
    if (avg90 !== null) {
      summary.append(chip("", t().bsrHistoryAvg90(avg90.toLocaleString())));
      const trend = classifyRankTrend(current, avg90, RANK_TREND_DEADBAND);
      summary.append(chip(rankTrendVariant(trend), rankTrendLabel(trend)));
    }
    // Seasonality chip ("Peaks in Nov-Dec" / "Steady all year"), same source
    // order as the sparkline: desktop history (deepest), then the pooled monthly
    // buckets, then the pooled trend (rarely deep enough). Never rendered below
    // the 10-month coverage floor: the helpers return null instead.
    const seasonText = season ? formatSeasonality(season, t()) : null;
    if (season && seasonText) {
      const seasonChip = chip(season.label === "peaks" ? "good" : "", seasonText);
      seasonChip.title = t().seasonWindowTip(season.monthsCovered);
      summary.append(seasonChip);
    }
    section.append(summary);
  }

  // Estimated monthly units + revenue, plus Amazon's own "bought in past month"
  // figure. The estimate is labeled honestly as an estimate; the pooled units
  // figure is tagged modeled (or calibrated once its category curve was fit from
  // real co-captured data). A local-only estimate is always modeled from rank.
  if (hasEstimate || hasBought) {
    const heading = el("p", "note", t().salesEstTitle);
    heading.style.marginTop = "8px";
    heading.style.fontWeight = "600";
    section.append(heading);

    const summary = el("div", "counts");
    const unitsChip = chip("", `${t().estUnitsLabel}: ${formatEstUnits(est.units)}`);
    unitsChip.title = t().estUnitsTip;
    summary.append(unitsChip);
    const revenueChip = chip("", `${t().estRevenueLabel}: ${formatEstRevenue(est.revenueDollars)}`);
    revenueChip.title = t().estRevenueTip;
    summary.append(revenueChip);
    const calibrated = hasPoolEstimate && (pool as NonNullable<typeof pool>).estimateCalibrated;
    summary.append(chip(calibrated ? "good" : "", calibrated ? t().salesEstCalibrated : t().salesEstModeled));
    if (hasBought) {
      summary.append(
        chip("good", t().boughtPastMonthChip((pool as NonNullable<typeof pool>).boughtPastMonth!.toLocaleString())),
      );
    }
    section.append(summary);
  }

  // 12-month sales histogram (modeled units per month) with a peak callout,
  // built from the same monthly buckets as the seasonality chip. Gated on the
  // seasonality coverage floor plus enough recent months with data that the bars
  // are not misleading; below that it renders nothing rather than a partial chart.
  if (season) {
    const bars = monthlyUnits(monthlyBuckets, Date.now(), {
      category: signals.category ?? signals.bestsellerRank?.category ?? pool?.bsrCategory ?? null,
    });
    if (coveredBars(bars) >= HISTOGRAM_MIN_COVERED) {
      const heading = el("p", "note", t().salesHistogramTitle);
      heading.style.marginTop = "8px";
      heading.style.fontWeight = "600";
      section.append(heading);

      const peak = peakBar(bars);
      section.append(histogram(bars, peak?.month ?? null));

      if (peak && peak.units != null) {
        const summary = el("div", "counts");
        const monthLabel = t().monthAbbr[peak.monthIndex] ?? String(peak.monthIndex + 1);
        summary.append(chip("good", t().salesPeak(formatCompactUnits(peak.units), monthLabel)));
        section.append(summary);
      }
    }
  }

  const noteText = fromDesktop
    ? t().priceHistoryDesktopNote
    : usingPool
      ? t().marketPoolNote
      : t().priceHistoryNote;
  section.append(el("p", "note", noteText));
  section.style.display = "";
}

// First monthly-bucket source that clears the seasonality coverage floor, in
// depth order, returned together with the buckets that produced it so the sales
// histogram draws from exactly the same data as the seasonality chip.
function resolveSeasonalityWithBuckets(
  desktopRank: Sample[],
  poolMonthly: MarketMonthlyBucket[] | undefined,
  poolRank: Sample[],
  now: number,
): { season: Seasonality | null; buckets: MonthlyBucket[] } {
  const toBuckets = (samples: Sample[]) =>
    bucketByMonth(samples.map((s) => ({ at: s.at, rank: s.value })));
  const candidates: MonthlyBucket[][] = [];
  if (desktopRank.length > 0) candidates.push(toBuckets(desktopRank));
  if (Array.isArray(poolMonthly) && poolMonthly.length > 0) candidates.push(poolMonthly);
  if (poolRank.length > 0) candidates.push(toBuckets(poolRank));
  for (const buckets of candidates) {
    const season = fromMonthly(buckets, now);
    if (season) return { season, buckets };
  }
  return { season: null, buckets: [] };
}

// Chip variant for a rank trend: green when improving, red when slipping.
function rankTrendVariant(trend: RankTrend): string {
  return trend === "rising" ? "good" : trend === "slipping" ? "bad" : "";
}

// Localized label for a rank trend ("Rank rising" / "Rank slipping" / "Rank steady").
function rankTrendLabel(trend: RankTrend): string {
  return trend === "rising"
    ? t().bsrTrendRising
    : trend === "slipping"
      ? t().bsrTrendSlipping
      : t().bsrTrendSteady;
}

// A 12-month sales-volume histogram: one bar per month, height proportional to
// modeled units, months without coverage drawn as an empty baseline tick. The
// peak month's bar is green so the eye lands on it, matching the callout chip.
function histogram(bars: UnitsBar[], peakMonth: string | null): SVGSVGElement {
  const units = bars.map((b) => b.units ?? 0);
  const max = Math.max(1, ...units);
  const n = bars.length || 1;
  const gap = 2;
  const bw = (W - 2 * PAD - gap * (n - 1)) / n;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "price-spark");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(H));
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t().salesHistogramTitle);
  svg.style.display = "block";
  svg.style.marginTop = "4px";

  bars.forEach((bar, i) => {
    const x = PAD + i * (bw + gap);
    const value = bar.units ?? 0;
    const h = bar.units == null ? 1 : Math.max(1, (value / max) * (H - 2 * PAD));
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", x.toFixed(1));
    rect.setAttribute("y", (H - PAD - h).toFixed(1));
    rect.setAttribute("width", Math.max(0.5, bw).toFixed(1));
    rect.setAttribute("height", h.toFixed(1));
    const isPeak = peakMonth != null && bar.month === peakMonth;
    rect.setAttribute("fill", bar.units == null ? "#e5e7eb" : isPeak ? "#16a34a" : "#d97706");
    svg.append(rect);
  });
  return svg;
}

// Build a sparkline as an inline SVG. Even x-spacing by index keeps it simple
// and readable. `invert` flips the y-axis for series where lower is better
// (sales rank), so an improving product still draws as a rising line. The
// marked point (lowest price / best rank) is dotted green, the most recent
// point amber, so the eye lands on both.
function sparkline(samples: Sample[], opts: { invert?: boolean; markIndex?: number } = {}): SVGSVGElement {
  const values = samples.map((s) => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const n = samples.length;
  const x = (i: number): number => PAD + (n === 1 ? 0 : (i / (n - 1)) * (W - 2 * PAD));
  const y = (v: number): number => {
    const norm = (v - min) / range;
    const up = opts.invert ? norm : 1 - norm;
    return PAD + up * (H - 2 * PAD);
  };

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "price-spark");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(H));
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t().priceHistoryTitle);
  svg.style.display = "block";
  svg.style.marginTop = "4px";

  const line = document.createElementNS(SVG_NS, "polyline");
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "#d97706");
  line.setAttribute("stroke-width", "1.5");
  line.setAttribute("stroke-linejoin", "round");
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute(
    "points",
    samples.map((s, i) => `${x(i).toFixed(1)},${y(s.value).toFixed(1)}`).join(" "),
  );
  svg.append(line);

  if (typeof opts.markIndex === "number" && opts.markIndex >= 0) {
    const v = values[opts.markIndex];
    if (v !== undefined) svg.append(dot(x(opts.markIndex), y(v), "#16a34a"));
  }
  const last = values[n - 1];
  if (last !== undefined) svg.append(dot(x(n - 1), y(last), "#d97706"));
  return svg;
}

function dot(cx: number, cy: number, color: string): SVGCircleElement {
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("cx", cx.toFixed(1));
  c.setAttribute("cy", cy.toFixed(1));
  c.setAttribute("r", "2.5");
  c.setAttribute("fill", color);
  return c;
}
