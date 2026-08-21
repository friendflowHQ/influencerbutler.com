import { addSection, el, chip } from "../../ui/components";
import { log } from "../../shared/log";
import {
  sendToBackground,
  type GenerateLinkResult,
  type MarketProduct,
  type MarketResult,
} from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";
import type { WalmartProduct } from "../../walmart/product-signals";
import { retailerModule } from "../../retailers/module";
import { resolveRatePct } from "../score/rate";
import { type StoredRateCard } from "../../rate-card/cache";
import { getState } from "../../storage/store";

// The Walmart PRODUCT-PAGE panel. Walmart search / browse / seller grids reuse
// the shared Amazon search overlay via the Walmart RetailerModule (see
// content/index.ts); this panel is the product-page counterpart, showing price,
// social proof, the rate-card commission, the pooled monthly-revenue estimate,
// and a Copy affiliate link button (Impact / Walmart Creator).

const WALMART_MARKETPLACE = "walmart.com";
const MODULE = retailerModule("walmart");

async function ratePctFor(category: string | null, card: StoredRateCard | null): Promise<number> {
  const settings = (await getState()).settings;
  return resolveRatePct({
    liveRatePct: null, // Walmart has no SiteStripe onsite rate
    category,
    card,
    defaultRatePct: MODULE.defaultRatePct(settings),
  });
}

function money(cents: number | null): string {
  if (cents == null) return "-";
  return `$${(cents / 100).toFixed(2)}`;
}

function compactMoney(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${Math.round(dollars)}`;
}

function commissionCents(priceCents: number | null, ratePct: number): number | null {
  if (priceCents == null) return null;
  return Math.round((priceCents * ratePct) / 100);
}

// estMonthlySales (units) * price = modeled monthly revenue for the product.
function revenueCents(market: MarketProduct | null, priceCents: number | null): number | null {
  if (!market || market.estMonthlySales == null || priceCents == null) return null;
  return Math.round(market.estMonthlySales * priceCents);
}

export function initWalmartProduct(signals: ProductSignals, product: WalmartProduct | null): void {
  const itemId = signals.asin;
  if (!itemId) return;
  const section = addSection("Walmart");
  const row = el("div", "wm-row");
  section.append(row);

  const status = el("span", "muted small");
  const btn = el("button", "btn wm-link-btn") as HTMLButtonElement;
  btn.type = "button";
  btn.textContent = "Copy Walmart affiliate link";
  btn.addEventListener("click", () => {
    btn.disabled = true;
    void sendToBackground<GenerateLinkResult>({
      kind: "GENERATE_AFFILIATE_LINK",
      asin: itemId,
      marketplace: WALMART_MARKETPLACE,
      url: location.href,
      retailer: "walmart",
    })
      .then((res) => {
        btn.disabled = false;
        if (!res.ok || !res.url) {
          status.textContent = "Could not build a link.";
          return;
        }
        void navigator.clipboard?.writeText(res.url).then(() => {
          status.textContent = res.notice ? "Copied (plain link)." : "Copied!";
        });
      })
      .catch(() => {
        btn.disabled = false;
        status.textContent = "Could not build a link.";
      });
  });
  section.append(btn, status);

  // Fill the chips async: rate card + pooled market data.
  void (async () => {
    const card = await MODULE.getRateCard();
    const ratePct = await ratePctFor(signals.category, card);
    const commission = commissionCents(signals.priceCents, ratePct);

    row.append(chip("price", money(signals.priceCents)));
    if (product?.averageRating != null && product?.numReviews != null) {
      row.append(chip("muted", `${product.averageRating.toFixed(1)}★ (${product.numReviews.toLocaleString()})`));
    }
    if (commission != null) row.append(chip("commission", `~${money(commission)} @ ${ratePct}%`));
    if (!signals.inStock) row.append(chip("warn", "Out of stock"));

    const market = await sendToBackground<MarketResult>({
      kind: "GET_MARKET",
      asin: itemId,
      marketplace: WALMART_MARKETPLACE,
      retailer: "walmart",
    }).catch(() => null);
    const revenue = revenueCents(market?.product ?? null, signals.priceCents);
    if (revenue != null) {
      const conf = market?.product?.estimateConfidence === "medium" ? "" : " (rough)";
      row.append(chip("revenue", `~${compactMoney(revenue)}/mo${conf}`));
    }
    log("walmart", `product overlay: ${itemId} @ ${ratePct}%`);
  })();
}
