import { addSection, el, chip } from "../../ui/components";
import { createInlineShadow } from "../../ui/host";
import { log } from "../../shared/log";
import {
  sendToBackground,
  type GenerateLinkResult,
  type MarketBatchResult,
  type MarketProduct,
  type MarketResult,
} from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";
import type { SearchTile } from "../../amazon/search-results";
import type { WalmartProduct } from "../../walmart/product-signals";
import { retailerModule } from "../../retailers/module";
import { resolveRatePct } from "../score/rate";
import { rateForCategory, type StoredRateCard } from "../../rate-card/cache";
import { getState } from "../../storage/store";

// The Walmart overlay. Phase 2: it drives its money signals through the shared
// RetailerModule + the retailer-aware data layer, so Walmart gets the SAME
// pooled monthly-revenue estimate (from the shared catalogue, review-velocity
// based) and the SAME rate-card-by-category commission the Amazon overlay uses,
// instead of a hardcoded band. Still self-contained on the render side (no
// Amazon-only cc-rates / dp-static / video stack).

const WALMART_MARKETPLACE = "walmart.com";
const DONE_ATTR = "data-ib-wm";
const MODULE = retailerModule("walmart");
// Match the Amazon search overlay: only enrich the first screenful of tiles per
// batch so a huge grid does not fan out an oversized market request.
const TILE_BATCH_CAP = 50;

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

// Product page: price, social proof, estimated commission, modeled monthly
// revenue (pooled catalogue), and a Copy affiliate link button.
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

// Search / browse / seller grids: badge each tile with estimated commission and,
// where the shared catalogue knows the item, a modeled monthly-revenue chip.
export function initWalmartSearch(root: ParentNode): void {
  const tiles = MODULE.parseSearchTiles(root, location.href).filter(
    (t) => !t.el.hasAttribute(DONE_ATTR),
  );
  for (const t of tiles) t.el.setAttribute(DONE_ATTR, "1");
  if (tiles.length === 0) return;

  void (async () => {
    const card = await MODULE.getRateCard();
    // Tiles carry no category, so they resolve to the card's default rate.
    const baseRate = card ? rateForCategory(card, null)?.ratePct ?? MODULE.defaultRatePct((await getState()).settings) : MODULE.defaultRatePct((await getState()).settings);

    // One pooled-market batch for the whole page.
    const ids = tiles.map((t) => t.asin).slice(0, TILE_BATCH_CAP);
    const market = await sendToBackground<MarketBatchResult>({
      kind: "GET_MARKET_BATCH",
      asins: ids,
      marketplace: WALMART_MARKETPLACE,
      retailer: "walmart",
    }).catch(() => null);
    const byId = new Map<string, MarketProduct>();
    for (const p of market?.products ?? []) byId.set(p.asin, p);

    let badged = 0;
    for (const tile of tiles) {
      badgeTile(tile, baseRate, byId.get(tile.asin) ?? null);
      badged += 1;
    }
    log("walmart", `search overlay: badged ${badged}/${tiles.length} tiles`);
  })();
}

function badgeTile(tile: SearchTile, ratePct: number, market: MarketProduct | null): void {
  const commission = commissionCents(tile.priceCents, ratePct);
  const revenue = revenueCents(market, tile.priceCents);
  if (commission == null && revenue == null && tile.reviewCount == null) return;
  const { host, root } = createInlineShadow("wm-tile-badge");
  const wrap = el("div", "tile-badges");
  if (commission != null) wrap.append(chip("commission", `~${money(commission)}`));
  if (revenue != null) wrap.append(chip("revenue", `~${compactMoney(revenue)}/mo`));
  if (tile.reviewCount != null && tile.reviewCount > 0) {
    wrap.append(chip("muted", `${tile.reviewCount.toLocaleString()} reviews`));
  }
  root.append(wrap);
  if (getComputedStyle(tile.el).position === "static") tile.el.style.position = "relative";
  tile.el.append(host);
}
