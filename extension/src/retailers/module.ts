import type { Retailer } from "../shared/retailer";
import { productIdValid } from "../shared/retailer";
import type { ProductSignals } from "../amazon/product-signals";
import type { SearchTile } from "../amazon/search-results";
import type { Settings } from "../storage/schema";
import { getRateCard, getWalmartRateCard, type StoredRateCard } from "../rate-card/cache";
import { canonicalProductUrl } from "../integrations/url";

import { extractSignals as extractAmazonSignals, marketplaceFromUrl } from "../amazon/product-signals";
import { parseSearchTiles as parseAmazonTiles } from "../amazon/search-results";
import {
  extractSignals as extractWalmartSignals,
  WALMART_MARKETPLACE,
} from "../walmart/product-signals";
import { parseSearchTiles as parseWalmartTiles } from "../walmart/search-results";

// The retailer abstraction the shared money layer resolves once per page. Both
// Amazon and Walmart implement it, so the overlays read signals, tiles, the
// commission rate card, and build canonical urls WITHOUT knowing which retailer
// they are on. This is the seam that lets the pooled revenue estimate and the
// real commission rate card reach Walmart, instead of a static band.
// Which Amazon-only data sources the shared search overlay may use for a
// retailer. Amazon has them all; Walmart has none (its overlay leans on the
// pooled market data + the rate card instead), so those fetches are skipped and
// the toolbar hides the controls that would do nothing.
export type RetailerCapabilities = {
  ccRates: boolean; // real Creator Connections campaign rates
  catalogueBloom: boolean; // CC/SPCC/deal membership bloom filters
  dpEnrich: boolean; // per-tile static /dp/ fetch (video slots, category, rank)
  videoScan: boolean; // background-tab influencer video count ("Scan")
  earnings: boolean; // desktop-ledger real earnings per product
  hideStrayDupes: boolean; // Amazon's late-injected sponsored duplicate tiles
  campaignFilter: boolean; // toolbar "campaign-eligible only" filter
  // How the toolbar's sort physically reorders tiles. "anchor" = Amazon's flat
  // sibling grid packed above an anchor; "grouped" = Walmart's nested multi-grid
  // layout, sorted within each grid so tiles are never reparented across grids.
  sortStrategy: "anchor" | "grouped";
};

export interface RetailerModule {
  retailer: Retailer;
  // The marketplace host to send with market / link requests for this url.
  marketplaceFor(url: string): string;
  extractSignals(doc: Document, url: string): ProductSignals;
  // Tiles on a search / browse / seller grid. `url` is accepted for parity even
  // though the Walmart parser reads the tile DOM directly.
  parseSearchTiles(root: ParentNode, url: string): SearchTile[];
  canonicalProductUrl(id: string, marketplace: string): string;
  productIdValid(id: string): boolean;
  // The cached commission-rate schedule for this retailer (Amazon Associates /
  // Walmart Impact), refreshed daily by the background. Null until first fetch.
  getRateCard(): Promise<StoredRateCard | null>;
  // The fallback rate (%) when neither a live rate nor a rate-card category
  // match applies.
  defaultRatePct(settings: Settings): number;
  capabilities: RetailerCapabilities;
  // The element the search toolbar mounts above (the results grid container).
  toolbarSlot(tileEl: HTMLElement): Element | null;
}

const amazonModule: RetailerModule = {
  retailer: "amazon",
  marketplaceFor: (url) => marketplaceFromUrl(url),
  extractSignals: (doc, url) => extractAmazonSignals(doc, url),
  parseSearchTiles: (root, url) => parseAmazonTiles(root, url),
  canonicalProductUrl: (id, marketplace) => canonicalProductUrl(id, marketplace, "", "amazon"),
  productIdValid: (id) => productIdValid("amazon", id),
  getRateCard: () => getRateCard(),
  // The user's saved onsite commission default.
  defaultRatePct: (settings) => settings.commissionRatePct,
  capabilities: {
    ccRates: true,
    catalogueBloom: true,
    dpEnrich: true,
    videoScan: true,
    earnings: true,
    hideStrayDupes: true,
    campaignFilter: true,
    sortStrategy: "anchor",
  },
  toolbarSlot: (tileEl) => tileEl.closest(".s-main-slot") ?? tileEl.parentElement,
};

const walmartModule: RetailerModule = {
  retailer: "walmart",
  marketplaceFor: () => WALMART_MARKETPLACE,
  extractSignals: (doc, url) => extractWalmartSignals(doc, url),
  parseSearchTiles: (root) => parseWalmartTiles(root),
  canonicalProductUrl: (id, marketplace) => canonicalProductUrl(id, marketplace, "", "walmart"),
  productIdValid: (id) => productIdValid("walmart", id),
  getRateCard: () => getWalmartRateCard(),
  // Walmart's schedule is category-based; the rate card's own default carries
  // the real catch-all, so this is only the last-resort floor.
  defaultRatePct: () => 1,
  // Walmart has no Creator Connections, no /dp/ video carousel, no desktop
  // ledger, and its search parser already dedupes, so every Amazon-only source
  // is off; the overlay uses the pooled market data + rate card instead.
  capabilities: {
    ccRates: false,
    catalogueBloom: false,
    dpEnrich: false,
    videoScan: false,
    earnings: false,
    hideStrayDupes: false,
    campaignFilter: false,
    sortStrategy: "grouped",
  },
  // tileEl is already the grid cell (see the Walmart parser's reorderCell), so
  // the toolbar mounts above that cell's grid.
  toolbarSlot: (tileEl) => tileEl.parentElement,
};

const REGISTRY: Record<Retailer, RetailerModule> = {
  amazon: amazonModule,
  walmart: walmartModule,
};

export function retailerModule(retailer: Retailer): RetailerModule {
  return REGISTRY[retailer];
}
