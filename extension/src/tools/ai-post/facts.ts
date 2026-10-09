import type { ProductSignals } from "../../amazon/product-signals";
import { dealDiscountPct } from "../../amazon/deal-kind";

// The product facts the AI Post is allowed to use, built from what the panel
// already read off the page. Deliberately NO prices: Amazon's policy is
// percent-only, and the server drops any price token for Amazon anyway.

export type AiPostFacts = {
  title: string | null;
  store: string;
  brand: string | null;
  percentOff: number | null;
  couponPercentOff: number | null;
  promoPercentOff: number | null;
  promoCode: string | null;
  promoText: string | null;
  event: string | null;
};

const EVENT_LABEL: Record<string, string> = {
  primeday: "Prime Deal",
  lightning: "Lightning Deal",
};

// "Visit the Acme Store" / "Brand: Acme" bylines -> "Acme".
export function cleanBrand(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^(?:visit the|brand:)\s*/i, "")
    .replace(/\s*store$/i, "")
    .trim();
  return cleaned && cleaned.length <= 60 ? cleaned : null;
}

export function buildAiPostFacts(signals: ProductSignals, store = "Amazon"): AiPostFacts {
  const promo = signals.promo ?? null;
  // A flat-dollar coupon becomes a percent of the current price, so the post can
  // say "extra 5% off" without ever quoting an amount.
  let promoPct = promo?.percent ?? null;
  if (promoPct === null && promo?.cents && signals.priceCents && signals.priceCents > 0) {
    const derived = Math.round((promo.cents / signals.priceCents) * 100);
    promoPct = derived > 0 && derived < 100 ? derived : null;
  }
  return {
    title: signals.title,
    store,
    brand: cleanBrand(signals.brand),
    percentOff: dealDiscountPct(signals.priceCents, signals.listPriceCents),
    couponPercentOff: promo && promo.kind !== "code" ? promoPct : null,
    promoPercentOff: promo?.kind === "code" ? promoPct : null,
    promoCode: promo?.code ?? null,
    promoText: promo?.text ?? null,
    event: signals.dealKind ? (EVENT_LABEL[signals.dealKind] ?? null) : null,
  };
}
