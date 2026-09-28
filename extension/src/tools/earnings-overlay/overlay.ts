import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import { parseStorefrontTiles, type StorefrontTile } from "../../amazon/storefront-tiles";
import { marketplaceFromUrl } from "../../amazon/product-signals";
import { sendToBackground, type EarningsLookupResult } from "../../shared/messages";
import type { AsinEarnings } from "../../transport/hud-commands";
import { formatMoney, tileTotals, type CurrencyTotal } from "./model";
import { renderEarningsDetail } from "./detail";

// Cha-Ching's headline feature, matched: a green "$ earned" badge on every
// storefront/Curations card that has paid the creator, opening a full by-store /
// year / month / campaign breakdown on click. Earnings come from the desktop
// ledger over the bridge, keyed by ASIN. Self-gating: the lookup returns instantly
// for anyone who has not paired the app, and cards with no earnings get no badge,
// so it stays invisible for everyone else.

// Marks a card as badged so an SPA rebuild does not double-badge it.
const DONE_ATTR = "data-ib-earn";
const HOST_CLASS = "earn-badge-host";

export async function initEarningsOverlay(): Promise<void> {
  // Tear down prior badges + markers so a storefront SPA rebuild re-badges the
  // current grid cleanly instead of stacking hosts.
  for (const host of Array.from(document.querySelectorAll(`.${HOST_CLASS}`))) host.remove();
  for (const marked of Array.from(document.querySelectorAll(`[${DONE_ATTR}]`))) {
    marked.removeAttribute(DONE_ATTR);
  }

  const marketplace = marketplaceFromUrl(location.href);
  const tiles = parseStorefrontTiles(document).filter((tile) => {
    if (tile.el.getAttribute(DONE_ATTR)) return false;
    tile.el.setAttribute(DONE_ATTR, "1");
    return true;
  });
  if (tiles.length === 0) return;

  const asins = [
    ...new Set(tiles.flatMap((tile) => tile.taggedAsins.map((a) => a.toUpperCase()))),
  ];
  let res: EarningsLookupResult;
  try {
    res = await sendToBackground<EarningsLookupResult>({ kind: "LOOKUP_EARNINGS", asins });
  } catch {
    return;
  }
  // paired:false means the app was never connected; stay silent (no badges).
  if (!res.ok || res.paired === false) return;
  const byAsin = new Map<string, AsinEarnings>();
  for (const e of res.results ?? []) byAsin.set(e.asin.toUpperCase(), e);
  if (byAsin.size === 0) return;

  for (const tile of tiles) {
    // Default to the marketplace the creator is viewing, so a foreign storefront
    // shows what it actually earned there rather than the ASIN's worldwide total.
    const totals = tileTotals(byAsin, tile.taggedAsins, "market", marketplace);
    if (totals.length === 0) continue;
    mountBadge(tile, totals, byAsin, marketplace);
  }
}

function mountBadge(
  tile: StorefrontTile,
  totals: CurrencyTotal[],
  byAsin: Map<string, AsinEarnings>,
  marketplace: string | null,
): void {
  const { host, root } = createInlineShadow(HOST_CLASS);
  const wrap = el("div", "tile-badge");
  const body = el("div", "tile-badge-body");

  const chip = el("button", "tile-chip good earn-badge-btn") as HTMLButtonElement;
  chip.type = "button";
  chip.textContent = totals.map((c) => formatMoney(c.amount, c.currency)).join(" · ");
  chip.title = t().earnBadgeTitle;
  chip.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const earnings = tile.taggedAsins
      .map((asin) => byAsin.get(asin.toUpperCase()))
      .filter((entry): entry is AsinEarnings => Boolean(entry));
    renderEarningsDetail({ title: null, earnings, marketplace });
  });

  body.append(chip);
  wrap.append(body);
  root.append(wrap);

  // Overlay the badge on the card's lower-left corner (like the competitor), so
  // it reads at a glance over the thumbnail without disturbing the grid layout.
  if (getComputedStyle(tile.el).position === "static") tile.el.style.position = "relative";
  host.style.position = "absolute";
  host.style.left = "6px";
  host.style.bottom = "6px";
  host.style.zIndex = "5";
  tile.el.append(host);
}
