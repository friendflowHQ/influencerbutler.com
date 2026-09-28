import { initSearchOverlay } from "../search-overlay/overlay";
import { retailerModule, type RetailerModule } from "../../retailers/module";
import { parseDealsTiles } from "../../amazon/deals-tiles";
import { query } from "../../amazon/selectors";
import type { Settings } from "../../storage/schema";

// Money-signal overlay for Today's Deals (amazon.com/deals*). The deals grid is
// just another product grid, so it reuses the entire full-parity search overlay
// (Butler Score + verdict + commission + pooled revenue/BSR + real CC rates +
// the sort/filter toolbar and per-tile menu) via a deals-specific
// RetailerModule. Only three things differ from Amazon search:
//   - tiles come from parseDealsTiles (the deals-hook feed joined to the cards),
//     because the deals DOM carries no data-asin;
//   - the toolbar mounts above the deals grid container;
//   - two capabilities are tuned for the React grid: sponsored-dupe hiding is
//     off (the deals grid has none, and its selector would not match anyway),
//     and sorting uses the "grouped" strategy so tiles are re-ordered within
//     their own container instead of being packed above an anchor (the deals
//     cards are nested, not flat siblings).
//
// The feed arrives asynchronously from the MAIN-world hook, so the content
// script re-runs this overlay when the ib-ext-deals-feed event lands (see
// src/content/index.ts); until then parseDealsTiles returns no tiles and the
// overlay is a clean no-op that rebuilds on the next run.

function dealsModule(): RetailerModule {
  const base = retailerModule("amazon");
  return {
    ...base,
    parseSearchTiles: (root, url) => parseDealsTiles(root, url),
    toolbarSlot: (tileEl) => query(document, "dealsGrid") ?? tileEl.parentElement,
    capabilities: {
      ...base.capabilities,
      hideStrayDupes: false,
      sortStrategy: "grouped",
    },
  };
}

export async function initDealsOverlay(settings: Settings): Promise<void> {
  await initSearchOverlay(settings, dealsModule());
}
