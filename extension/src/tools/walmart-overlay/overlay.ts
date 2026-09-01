import { addSection, el, chip } from "../../ui/components";
import { log } from "../../shared/log";
import {
  sendToBackground,
  type GenerateLinkResult,
  type IntegrationsView,
  type MarketProduct,
  type MarketResult,
} from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";
import type { WalmartProduct } from "../../walmart/product-signals";
import { retailerModule } from "../../retailers/module";
import { resolveRatePct } from "../score/rate";
import { type StoredRateCard } from "../../rate-card/cache";
import { getState } from "../../storage/store";
import { renderHudActions } from "../hud-actions/panel";
import { computeButlerScore } from "../score/model";
import { renderScore } from "../score/badge";
import { evaluateApproved } from "../butler-approved/criteria";
import { renderSeal } from "../butler-approved/seal";
import { renderCalculator } from "../calculator/panel";

// The Walmart PRODUCT-PAGE panel. Walmart search / browse / seller grids reuse
// the shared Amazon search overlay via the Walmart RetailerModule (see
// content/index.ts); this panel is the product-page counterpart, showing price,
// social proof, the rate-card commission, the pooled monthly-revenue estimate,
// and a Copy affiliate link button (Walmart Creator / Mavely).

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
  btn.textContent = "Copy Walmart link";
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
          status.textContent =
            res.notice === "signInRequired"
              ? "Copied plain link. Sign in to your Walmart link provider to get tracked links."
              : res.notice
                ? "Copied (plain link)."
                : "Copied!";
        });
      })
      .catch(() => {
        btn.disabled = false;
        status.textContent = "Could not build a link.";
      });
  });
  section.append(btn, status);

  // Whether the creator has connected a Walmart link provider. When not, the
  // button still copies a working /ip/ link, but we say the link is not yet
  // commission-tracked and offer a one-click path to set one up (Walmart
  // Creator at creator.walmart.com has no follower minimum; Mavely works too).
  void sendToBackground<IntegrationsView>({ kind: "GET_INTEGRATIONS" })
    .then((view) => {
      const providerId = view.global.walmartLinkProvider;
      const configured = Boolean(providerId && view.providers.find((p) => p.id === providerId)?.configured);
      if (configured) {
        btn.textContent = "Copy Walmart affiliate link";
        return;
      }
      const setup = el("button", "link-inline") as HTMLButtonElement;
      setup.type = "button";
      setup.textContent = "Set up Walmart affiliate links";
      setup.addEventListener("click", () => void sendToBackground({ kind: "OPEN_OPTIONS" }));
      const note = el("div", "muted small");
      note.append(document.createTextNode("Links are not commission-tracked yet. "), setup);
      section.append(note);
    })
    .catch(() => {
      // Integrations unavailable: leave the neutral "Copy Walmart link" label.
    });

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

    // Butler Score: the same 0-100 opportunity read as Amazon product pages,
    // reusing the shared model. Walmart has no Creator Connections and no
    // "bought past month", so campaign membership is absent and the review
    // count stands in as the demand proxy (the model caps that at 0.7).
    const settings = (await getState()).settings;
    const scoreInputs = {
      priceCents: signals.priceCents,
      commissionRatePct: ratePct,
      influencerVideos: null,
      boughtPastMonth: null,
      reviewCount: product?.numReviews ?? null,
      inStock: signals.inStock,
      membership: { cc: false, spcc: false },
    };
    renderScore(computeButlerScore(scoreInputs, settings));

    // Butler Approved seal: the pass/fail companion to the score, same signals.
    // Walmart has no video carousel, so the video-count criteria read "unknown".
    renderSeal(evaluateApproved(signals, null, settings.approved));

    // Break-even Calculator: reuses the Amazon panel but seeded with the Walmart
    // rate we already resolved, so it does not fall back to the Amazon rate card.
    renderCalculator(signals, null, settings, ratePct);

    // "Send to your butler app": push this Walmart product into the desktop
    // Deals Influencer Butler over the local bridge (or upsell when the app is
    // closed). Rendered last so it sits below the Butler Score. Limited to the
    // Deals push for now: the other send-to-app actions have Amazon-only desktop
    // handlers.
    renderHudActions(signals, { onlyDeals: true });
  })();
}
