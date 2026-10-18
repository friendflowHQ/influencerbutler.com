import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { log } from "../../shared/log";
import {
  sendToBackground,
  type GenerateLinkResult,
  type IntegrationsView,
  type MarketProduct,
  type MarketResult,
} from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";
import type { TargetProduct } from "../../target/redsky";
import { TARGET_MARKETPLACE } from "../../target/redsky";
import { retailerModule } from "../../retailers/module";
import { resolveRatePct } from "../score/rate";
import { type StoredRateCard } from "../../rate-card/cache";
import { getState } from "../../storage/store";
import { computeButlerScore } from "../score/model";
import { renderScore } from "../score/badge";
import { evaluateApproved } from "../butler-approved/criteria";
import { renderSeal } from "../butler-approved/seal";
import { renderCalculator } from "../calculator/panel";
import { renderCrossRetailer } from "../cross-retailer/panel";
import { formatCents } from "../cross-retailer/model";

// The Target PRODUCT-PAGE panel, the counterpart of the Walmart panel: price and
// social proof, the estimated commission from Target's rate card, the pooled
// monthly-revenue estimate, Butler Score / Approved / break-even calculator, a
// Copy Target link button (Mavely when connected, else a plain /p/ link), and
// the "Also on Walmart" card. Target grids reuse the shared search overlay via
// the Target RetailerModule (see content/index.ts).
//
// Not here: the "Send to app" deals push. The desktop deal receiver only knows
// Amazon ASINs and Walmart item ids, so the push stays off for Target until the
// app accepts TCINs.

const MODULE = retailerModule("target");

export type TargetOverlayOptions = {
  // The "Also on Walmart" card (tool flag + remote kill switch, resolved by the caller).
  crossRetailer: boolean;
};

async function ratePctFor(category: string | null, card: StoredRateCard | null): Promise<number> {
  const settings = (await getState()).settings;
  return resolveRatePct({
    liveRatePct: null, // Target has no SiteStripe onsite rate
    category,
    card,
    defaultRatePct: MODULE.defaultRatePct(settings),
  });
}

function compactMoney(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${Math.round(dollars)}`;
}

// estMonthlySales (units) * price = modeled monthly revenue for the product.
function revenueCents(market: MarketProduct | null, priceCents: number | null): number | null {
  if (!market || market.estMonthlySales == null || priceCents == null) return null;
  return Math.round(market.estMonthlySales * priceCents);
}

// Copy text to the clipboard, tolerating a lapsed user gesture. Resolves true
// when the text was copied.
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through to the selection-based copy
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function initTargetProduct(
  signals: ProductSignals,
  product: TargetProduct | null,
  opts: TargetOverlayOptions,
): void {
  const tcin = signals.asin;
  if (!tcin) return;

  const section = addSection("Target");
  const row = el("div", "wm-row");
  section.append(row);

  // Added right after the Target section, before the async score / calculator
  // sections, so it sits near the top of the panel and does not jump later.
  if (opts.crossRetailer) {
    renderCrossRetailer({
      retailer: "target",
      id: tcin,
      upc: product?.upc ?? null,
      title: product?.title ?? signals.title,
      brand: product?.brand ?? signals.brand,
      priceCents: product?.priceCents ?? signals.priceCents,
    });
  }

  const status = el("span", "muted small");
  const btn = el("button", "btn wm-link-btn") as HTMLButtonElement;
  btn.type = "button";
  btn.textContent = "Copy Target link";
  // The label to restore after a click; flips to "Copy Target affiliate link"
  // once a link provider is connected (see the GET_INTEGRATIONS check below).
  let idleLabel = btn.textContent;
  btn.addEventListener("click", () => {
    btn.disabled = true;
    // A tracked link is minted from the creator's signed-in Mavely session, which
    // can take a few seconds; say so instead of leaving a dead-looking button.
    btn.textContent = "Creating link...";
    status.textContent = "";
    void sendToBackground<GenerateLinkResult>({
      kind: "GENERATE_AFFILIATE_LINK",
      asin: tcin,
      marketplace: TARGET_MARKETPLACE,
      url: location.href,
      retailer: "target",
    })
      .then(async (res) => {
        btn.disabled = false;
        btn.textContent = idleLabel;
        if (!res.ok || !res.url) {
          status.textContent = "Could not build a link.";
          return;
        }
        // The mint can outlast the click's user activation, which makes the
        // async clipboard API reject; fall back to a selection copy, and show
        // the link itself if both fail so the creator is never left empty-handed.
        const copied = await copyText(res.url);
        status.textContent = !copied
          ? res.url
          : res.notice === "signInRequired"
            ? "Copied plain link. Sign in to your link provider to get tracked links."
            : res.notice
              ? "Copied (plain link)."
              : "Copied!";
      })
      .catch(() => {
        btn.disabled = false;
        btn.textContent = idleLabel;
        status.textContent = "Could not build a link.";
      });
  });
  section.append(btn, status);

  // Whether the creator has connected a Target link provider. When not, the
  // button still copies a working /p/ link, but we say it is not yet
  // commission-tracked and offer a one-click path to set one up.
  void sendToBackground<IntegrationsView>({ kind: "GET_INTEGRATIONS" })
    .then((view) => {
      const providerId = view.global.targetLinkProvider;
      const configured = Boolean(providerId && view.providers.find((p) => p.id === providerId)?.configured);
      if (configured) {
        idleLabel = "Copy Target affiliate link";
        if (!btn.disabled) btn.textContent = idleLabel;
        return;
      }
      const setup = el("button", "link-inline") as HTMLButtonElement;
      setup.type = "button";
      setup.textContent = "Set up Target affiliate links";
      setup.addEventListener(
        "click",
        () => void sendToBackground({ kind: "OPEN_OPTIONS", section: "sec-cat-walmartLink" }),
      );
      const note = el("div", "muted small");
      note.append(document.createTextNode("Links are not commission-tracked yet. "), setup);
      section.append(note);
    })
    .catch(() => {
      // Integrations unavailable: leave the neutral "Copy Target link" label.
    });

  // Fill the chips async: rate card + pooled market data.
  void (async () => {
    const card = await MODULE.getRateCard();
    const ratePct = await ratePctFor(signals.category, card);
    const price = product?.priceCents ?? signals.priceCents;
    const commission = price == null ? null : Math.round((price * ratePct) / 100);

    if (price != null) row.append(chip("price", formatCents(price)));
    if (product?.averageRating != null && product.numReviews != null) {
      row.append(chip("muted", `${product.averageRating.toFixed(1)}★ (${product.numReviews.toLocaleString()})`));
    }
    // The rate comes from an estimated schedule, so the chip says so.
    if (commission != null) row.append(chip("commission", `~${formatCents(commission)} @ ~${ratePct}%`));
    if (product?.inStock === false) row.append(chip("warn", t().crossOutOfStock));

    const market = await sendToBackground<MarketResult>({
      kind: "GET_MARKET",
      asin: tcin,
      marketplace: TARGET_MARKETPLACE,
      retailer: "target",
    }).catch(() => null);
    const revenue = revenueCents(market?.product ?? null, price);
    if (revenue != null) {
      const conf = market?.product?.estimateConfidence === "medium" ? "" : " (rough)";
      row.append(chip("revenue", `~${compactMoney(revenue)}/mo${conf}`));
    }
    log("target", `product overlay: ${tcin} upc=${product?.upc ?? "none"} @ ${ratePct}%`);

    // Butler Score: the same 0-100 opportunity read as Amazon/Walmart product
    // pages. Target has no Creator Connections and no "bought past month", so
    // campaign membership is absent and the review count stands in as the
    // demand proxy.
    const settings = (await getState()).settings;
    renderScore(
      computeButlerScore(
        {
          priceCents: price,
          commissionRatePct: ratePct,
          influencerVideos: null,
          boughtPastMonth: null,
          reviewCount: product?.numReviews ?? null,
          inStock: product?.inStock !== false,
          membership: { cc: false, spcc: false },
        },
        settings,
      ),
    );

    // Butler Approved seal: the pass/fail companion to the score, same signals.
    // Target has no video carousel, so the video-count criteria read "unknown".
    renderSeal(evaluateApproved(signals, null, settings.approved));

    // Break-even Calculator, seeded with the Target rate we already resolved so
    // it does not fall back to the Amazon rate card.
    renderCalculator(signals, null, settings, ratePct);
  })();
}
