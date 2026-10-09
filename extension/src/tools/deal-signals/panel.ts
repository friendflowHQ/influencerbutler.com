import { addSection, chip, el } from "../../ui/components";
import { getLocale, t } from "../../i18n";
import { formatMoney } from "../earnings-overlay/model";
import type { ProductSignals } from "../../amazon/product-signals";
import type { ProductPromo } from "../../amazon/promo";

// The "On sale" section of the product panel: when Amazon shows a strikethrough
// list price above the current price and/or a deal badge (Prime Big Deal Days /
// Lightning Deal / reduced), this reports the deal kind, the discount depth, and
// the list -> now prices. It also flags a promo available on the listing (a
// clippable coupon or a promo code), which is often the whole deal and is easy to
// miss in the buybox. Read straight off the live page (no network call).
// Returns null - so the caller adds nothing - when the product has neither.
const PROMO_STRINGS = {
  en: { title: "Promo available", coupon: "Coupon", code: "Promo code", promo: "Promo", off: (n: number) => `${n}% off`, offAmt: (m: string) => `${m} off` },
  es: { title: "Promoción disponible", coupon: "Cupón", code: "Código promocional", promo: "Promo", off: (n: number) => `${n}% de descuento`, offAmt: (m: string) => `${m} de descuento` },
  fr: { title: "Promo disponible", coupon: "Coupon", code: "Code promo", promo: "Promo", off: (n: number) => `${n}% de réduction`, offAmt: (m: string) => `${m} de réduction` },
} as const;

export function promoLabel(promo: ProductPromo, currency: string): string {
  const s = PROMO_STRINGS[getLocale() as keyof typeof PROMO_STRINGS] ?? PROMO_STRINGS.en;
  const kind = promo.kind === "code" ? s.code : promo.kind === "coupon" ? s.coupon : s.promo;
  const amount =
    promo.percent !== null ? s.off(promo.percent) : promo.cents !== null ? s.offAmt(formatMoney(promo.cents / 100, currency)) : "";
  return `${kind}${amount ? `: ${amount}` : ""}${promo.code ? ` (${promo.code})` : ""}`;
}

export function renderDealSignals(signals: ProductSignals): HTMLElement | null {
  const { priceCents, listPriceCents, dealKind, currency } = signals;
  const promo = signals.promo ?? null;
  const discounted = listPriceCents != null && priceCents != null && listPriceCents > priceCents;
  // A coupon-only badge is shown as the promo line below; the panel deal chips are
  // for an actual price cut or a named deal event.
  const named = dealKind === "primeday" || dealKind === "lightning" || dealKind === "reduced";
  if (!discounted && !named && !promo) return null;

  const section = addSection(discounted || named ? t().dealSignalsTitle : (PROMO_STRINGS[getLocale() as keyof typeof PROMO_STRINGS] ?? PROMO_STRINGS.en).title);

  if (discounted || named) {
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
  }

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

  if (promo) {
    const s = PROMO_STRINGS[getLocale() as keyof typeof PROMO_STRINGS] ?? PROMO_STRINGS.en;
    const row = el("div", "counts");
    row.append(chip("good", s.title));
    section.append(row, el("p", "note", promoLabel(promo, currency)));
  }

  return section;
}
