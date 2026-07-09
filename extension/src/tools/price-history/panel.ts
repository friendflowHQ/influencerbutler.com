import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { formatCents } from "../calculator/model";
import { sendToBackground, type PricePoint } from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";

// A small price-history sparkline plus an all-time-low flag, built from the
// prices the extension has seen locally as the creator browses (no Keepa, no
// server). Honest by design: it needs at least two observed prices before it
// draws anything, and it says the history is only "since you started".
const SVG_NS = "http://www.w3.org/2000/svg";
const W = 200;
const H = 44;
const PAD = 5;

export function renderPriceHistory(signals: ProductSignals): void {
  if (!signals.asin) return;
  const section = addSection(t().priceHistoryTitle);
  section.style.display = "none"; // reveal only once we have a trend to show
  void fill(section, signals);
}

async function fill(section: HTMLElement, signals: ProductSignals): Promise<void> {
  let points: PricePoint[];
  try {
    points = await sendToBackground<PricePoint[]>({
      kind: "GET_PRICE_HISTORY",
      asin: signals.asin,
      marketplace: signals.marketplace,
    });
  } catch {
    section.remove();
    return;
  }
  // One point is just the current price: no trend, so stay silent.
  if (!Array.isArray(points) || points.length < 2) {
    section.remove();
    return;
  }

  const currency = signals.currency || "USD";
  const cents = points.map((p) => p.cents);
  const min = Math.min(...cents);
  const current = points[points.length - 1]?.cents ?? cents[cents.length - 1] ?? min;

  section.append(sparkline(points, min));

  const summary = el("div", "counts");
  summary.append(chip("", t().priceHistoryNow(formatCents(current, currency))));
  summary.append(chip("good", t().priceHistoryLow(formatCents(min, currency))));
  if (current <= min) summary.append(chip("good", t().priceHistoryLowest));
  section.append(summary);

  section.append(el("p", "note", t().priceHistoryNote));
  section.style.display = "";
}

// Build the sparkline as an inline SVG. Even x-spacing by index keeps it simple
// and readable; y maps price into the box (higher price = higher line). The
// lowest and the most recent points are dotted so the eye lands on them.
function sparkline(points: PricePoint[], min: number): SVGSVGElement {
  const cents = points.map((p) => p.cents);
  const max = Math.max(...cents);
  const range = max - min || 1;
  const n = points.length;
  const x = (i: number): number => PAD + (n === 1 ? 0 : (i / (n - 1)) * (W - 2 * PAD));
  const y = (c: number): number => PAD + (1 - (c - min) / range) * (H - 2 * PAD);

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
    points.map((p, i) => `${x(i).toFixed(1)},${y(p.cents).toFixed(1)}`).join(" "),
  );
  svg.append(line);

  const lowIndex = cents.indexOf(min);
  svg.append(dot(x(lowIndex), y(min), "#16a34a")); // lowest
  svg.append(dot(x(n - 1), y(cents[n - 1] ?? min), "#d97706")); // most recent
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
