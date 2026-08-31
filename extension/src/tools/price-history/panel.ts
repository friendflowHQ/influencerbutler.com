import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { formatCents } from "../calculator/model";
import { sendToBackground, type MarketResult, type PricePoint } from "../../shared/messages";
import type { DesktopHistoryResult } from "../../transport/hud-commands";
import type { ProductSignals } from "../../amazon/product-signals";
import { formatEstRevenue, formatEstUnits, resolveEstimate } from "../../amazon/bsr-revenue-estimator";

// Price history (and, when the desktop app is paired, sales-rank history) for
// the product being viewed. Prefers the desktop app's durable time-series over
// the extension's capped local store: the app keeps every point forever and can
// backfill deeper history, so the paired experience shows the full trend while
// the unpaired one stays the honest "since you started browsing" sparkline.
const SVG_NS = "http://www.w3.org/2000/svg";
const W = 200;
const H = 44;
const PAD = 5;

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
    sendToBackground<MarketResult>({
      kind: "GET_MARKET",
      asin,
      marketplace: signals.marketplace,
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

  const noteText = fromDesktop
    ? t().priceHistoryDesktopNote
    : usingPool
      ? t().marketPoolNote
      : t().priceHistoryNote;
  section.append(el("p", "note", noteText));
  section.style.display = "";
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
