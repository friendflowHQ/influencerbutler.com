import { addSection, el, chip } from "../../ui/components";
import { createInlineShadow } from "../../ui/host";
import { log } from "../../shared/log";
import { sendToBackground, type GenerateLinkResult } from "../../shared/messages";
import { WALMART_COMMISSION_DEFAULTS } from "../../shared/constants";
import type { ProductSignals } from "../../amazon/product-signals";
import type { SearchTile } from "../../amazon/search-results";
import { parseSearchTiles } from "../../walmart/search-results";
import type { WalmartProduct } from "../../walmart/product-signals";

// A self-contained Walmart overlay for Phase 1: it reuses the neutral UI host,
// the affiliate link builder (Impact / Walmart Creator via the background), and
// the static Walmart commission defaults, WITHOUT depending on the Amazon-only
// stack (cc-rates, dp-static, video counts, earnings). The richer per-tile
// enrichment (pooled revenue estimate, real Impact rates) is a follow-up that
// threads a RetailerModule through the shared search overlay.

const WALMART_MARKETPLACE = "walmart.com";
const DONE_ATTR = "data-ib-wm";

// Keyword -> WALMART_COMMISSION_DEFAULTS key. Walmart's category strings ("Whole
// Milk", "Nail Care", "Baby Formula") are matched loosely against these so the
// commission estimate lands in the right band. Falls back to "default".
const CATEGORY_KEYWORDS: Array<{ key: string; tokens: string[] }> = [
  { key: "home", tokens: ["home", "kitchen", "furniture", "garden", "patio", "decor", "bedding"] },
  { key: "beauty", tokens: ["beauty", "makeup", "skcare", "skin", "nail", "cosmetic", "hair", "fragrance"] },
  { key: "baby", tokens: ["baby", "infant", "toddler", "diaper", "formula"] },
  { key: "toys", tokens: ["toy", "game", "lego", "doll", "puzzle"] },
  { key: "fashion", tokens: ["clothing", "apparel", "shoe", "dress", "shirt", "jean", "accessor", "jewelry", "watch"] },
  { key: "sports", tokens: ["sport", "outdoor", "fitness", "exercise", "bike", "camping"] },
  { key: "electronics", tokens: ["electronic", "tv", "laptop", "computer", "phone", "camera", "video game", "console", "headphone"] },
  { key: "grocery", tokens: ["grocery", "food", "milk", "dairy", "snack", "beverage", "coffee", "candy", "pantry"] },
];

function rateForCategory(category: string | null, title: string | null): number {
  const hay = `${category ?? ""} ${title ?? ""}`.toLowerCase();
  const byKey = (k: string) =>
    WALMART_COMMISSION_DEFAULTS.find((d) => d.key === k)?.ratePct ??
    WALMART_COMMISSION_DEFAULTS.find((d) => d.key === "default")?.ratePct ??
    1;
  for (const { key, tokens } of CATEGORY_KEYWORDS) {
    if (tokens.some((tok) => hay.includes(tok))) return byKey(key);
  }
  return byKey("default");
}

function money(cents: number | null): string {
  if (cents == null) return "-";
  return `$${(cents / 100).toFixed(2)}`;
}

function commissionCents(priceCents: number | null, ratePct: number): number | null {
  if (priceCents == null) return null;
  return Math.round((priceCents * ratePct) / 100);
}

// Product page: a compact "Walmart" section with price, social proof, the
// estimated commission, and a Copy affiliate link button (Impact / Walmart
// Creator, per the user's options choice).
export function initWalmartProduct(signals: ProductSignals, product: WalmartProduct | null): void {
  const itemId = signals.asin;
  if (!itemId) return;
  const section = addSection("Walmart");
  const ratePct = rateForCategory(signals.category, signals.title);
  const commission = commissionCents(signals.priceCents, ratePct);

  const row = el("div", "wm-row");
  row.append(chip("price", money(signals.priceCents)));
  if (product?.averageRating != null && product?.numReviews != null) {
    row.append(chip("muted", `${product.averageRating.toFixed(1)}★ (${product.numReviews.toLocaleString()})`));
  }
  if (commission != null) {
    row.append(chip("commission", `~${money(commission)} @ ${ratePct}%`));
  }
  if (!signals.inStock) row.append(chip("warn", "Out of stock"));
  section.append(row);

  const btn = el("button", "btn wm-link-btn") as HTMLButtonElement;
  btn.type = "button";
  btn.textContent = "Copy Walmart affiliate link";
  const status = el("span", "muted small");
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
  log("walmart", `product overlay: ${itemId} @ ${ratePct}%`);
}

// Search / browse / seller grids: badge each Walmart tile with an estimated
// commission chip. Reads the tiles from the page's __NEXT_DATA__ joined to the
// rendered [data-item-id] elements.
export function initWalmartSearch(root: ParentNode): void {
  const tiles = parseSearchTiles(root);
  let badged = 0;
  for (const tile of tiles) {
    if (tile.el.hasAttribute(DONE_ATTR)) continue;
    tile.el.setAttribute(DONE_ATTR, "1");
    badgeTile(tile);
    badged += 1;
  }
  log("walmart", `search overlay: badged ${badged}/${tiles.length} tiles`);
}

function badgeTile(tile: SearchTile): void {
  const ratePct = rateForCategory(null, tile.title);
  const commission = commissionCents(tile.priceCents, ratePct);
  if (commission == null) return;
  const { host, root } = createInlineShadow("wm-tile-badge");
  const wrap = el("div", "tile-badges");
  wrap.append(chip("commission", `~${money(commission)}`));
  if (tile.reviewCount != null && tile.reviewCount > 0) {
    wrap.append(chip("muted", `${tile.reviewCount.toLocaleString()} reviews`));
  }
  root.append(wrap);
  // Position relative so the badge host sits within the tile.
  if (getComputedStyle(tile.el).position === "static") tile.el.style.position = "relative";
  tile.el.append(host);
}
