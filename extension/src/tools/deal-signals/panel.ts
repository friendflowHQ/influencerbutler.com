import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { formatMoney } from "../earnings-overlay/model";
import type { ProductSignals } from "../../amazon/product-signals";

// The "On sale" section of the product panel: when Amazon shows a strikethrough
// list price above the current price and/or a deal badge (Prime Big Deal Days /
// Lightning Deal / reduced), this reports the deal kind, the discount depth, and
// the list -> now prices. Read straight off the live page (no network call).
// Returns null - so the caller adds nothing - when the product is not on a deal.
export function renderDealSignals(signals: ProductSignals): HTMLElement | null {
  const { priceCents, listPriceCents, dealKind, currency } = signals;
  const discounted = listPriceCents != null && priceCents != null && listPriceCents > priceCents;
  // A coupon-only signal is left to the buybox's own coupon control; the panel
  // deal section is for an actual price cut or a named deal event.
  const named = dealKind === "primeday" || dealKind === "lightning" || dealKind === "reduced";
  if (!discounted && !named) return null;

  const section = addSection(t().dealSignalsTitle);

  const chips = el("div", "counts");
  const label =
    dealKind === "primeday"
      ? t().tileDealPrimeDay
      : dealKind === "lightning"
        ? t().tileDealLightning
        : t().tileDeal;
  chips.append(chip("good", label));
  if (discounted) {
    const pct = Math.round((1 - priceCents! / listPriceCents!) * 100);
    if (pct > 0) chips.append(chip("good", `-${pct}%`));
  }
  section.append(chips);

  if (discounted) {
    section.append(
      el(
        "p",
        "note",
        t().dealSignalsWasNow(
          formatMoney(listPriceCents! / 100, currency),
          formatMoney(priceCents! / 100, currency),
        ),
      ),
    );
  }

  return section;
}
