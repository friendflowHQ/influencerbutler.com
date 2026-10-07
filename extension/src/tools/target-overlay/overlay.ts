import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { log } from "../../shared/log";
import type { ProductSignals } from "../../amazon/product-signals";
import type { TargetProduct } from "../../target/redsky";
import { renderCrossRetailer } from "../cross-retailer/panel";
import { formatCents } from "../cross-retailer/model";

// The Target PRODUCT-PAGE panel. Target support is deliberately small: price and
// social proof, plus the "Also on Walmart" card. There is no commission rate
// card, pooled market data or affiliate link routing for Target, so none of the
// money tools (score, calculator, seal) are mounted here.

export type TargetOverlayOptions = {
  // The "Also on Walmart" card (tool flag + remote kill switch, resolved by the caller).
  crossRetailer: boolean;
};

export function initTargetProduct(
  signals: ProductSignals,
  product: TargetProduct | null,
  opts: TargetOverlayOptions,
): void {
  const tcin = signals.asin;
  if (!tcin) return;

  const section = addSection("Target");
  const row = el("div", "wm-row");
  if (product?.priceCents != null) row.append(chip("price", formatCents(product.priceCents)));
  if (product?.averageRating != null && product.numReviews != null) {
    row.append(chip("muted", `${product.averageRating.toFixed(1)}★ (${product.numReviews.toLocaleString()})`));
  }
  if (product?.inStock === false) row.append(chip("warn", t().crossOutOfStock));
  section.append(row);

  if (opts.crossRetailer) {
    renderCrossRetailer({
      retailer: "target",
      id: tcin,
      upc: product?.upc ?? null,
      title: product?.title ?? null,
      brand: product?.brand ?? null,
      priceCents: product?.priceCents ?? null,
    });
  }
  log("target", `product overlay: ${tcin} upc=${product?.upc ?? "none"}`);
}
