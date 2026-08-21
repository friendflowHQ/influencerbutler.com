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
};

const REGISTRY: Record<Retailer, RetailerModule> = {
  amazon: amazonModule,
  walmart: walmartModule,
};

export function retailerModule(retailer: Retailer): RetailerModule {
  return REGISTRY[retailer];
}
