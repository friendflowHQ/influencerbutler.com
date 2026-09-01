import { retailerFromHost, type Retailer } from "../shared/retailer";

// Retailer-neutral page classes. The same overlay handles a class regardless of
// retailer (a "search" grid is a search grid on Amazon or Walmart); a few
// classes are Amazon-only (creator-upload/manage, campaign-grid, idea-list) and
// are simply never emitted for Walmart.
export type PageType =
  | "product"
  | "order-history"
  | "storefront"
  | "brand-store"
  | "creator-upload"
  | "creator-manage"
  | "campaign-grid"
  | "campaign-detail"
  | "search"
  | "discovery"
  | "deals"
  | "idea-list"
  | "other";

// The retailer for a URL, or null when it is neither Amazon nor Walmart (so a
// caller can skip a page the extension has no adapter for).
export function detectRetailerForUrl(url: string): Retailer | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  const bare = host.replace(/^www\./, "").toLowerCase();
  const isAmazon = bare === "amazon.com" || /(^|\.)amazon\.[a-z.]+$/.test(bare);
  const isWalmart = bare === "walmart.com" || bare.endsWith(".walmart.com");
  if (isWalmart) return "walmart";
  if (isAmazon) return "amazon";
  return null;
}

export function detectPageType(url: string): PageType {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "other";
  }
  return retailerFromHost(parsed.hostname) === "walmart"
    ? detectWalmartPageType(parsed)
    : detectAmazonPageType(parsed);
}

function detectAmazonPageType(parsed: URL): PageType {
  const path = parsed.pathname;
  if (/\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:[/?]|$)/.test(path)) return "product";
  if (path.startsWith("/gp/css/order-history") || path.startsWith("/your-orders")) {
    return "order-history";
  }
  // An Idea List detail page (/shop/<handle>/list/<LISTID>) before the
  // storefront match that would otherwise swallow it; legacy /ideas/ URLs
  // 404 as of 2026-08-18 but route here in case Amazon revives them.
  if (/^\/shop\/[^/]+\/list(?:\/|$)/.test(path) || path.startsWith("/ideas/")) {
    return "idea-list";
  }
  if (path.startsWith("/shop/")) return "storefront";
  // A brand's own storefront (the React store builder): /stores/<Brand>/page/<id>.
  // Distinct from "storefront", which is the creator's own /shop/ page.
  if (/^\/stores\/(?:.+\/)?page\//.test(path)) return "brand-store";
  // The Creator Hub "Edit Video" page, where products are tagged before submit.
  if (/^\/creatorhub\/video\//.test(path)) return "creator-upload";
  // The Creator Hub "Manage videos" list, where a creator reviews every video's
  // performance. Video Money badges each row with earnings, EPV, the live
  // commission rate, and demand. Distinct path from the /video/ edit page above.
  if (/^\/creatorhub\/manage(?:\/|$)/.test(path)) return "creator-manage";
  // A single campaign's detail page (singular /p/connect/request, distinct from
  // the plural /p/connect/requests grid), carrying ?adId=/?campaignId= and the
  // Products / requirements / Samples sections. The campaign-detail overlay reads
  // its products. MUST be tested before the /p/connect grid catch-all below,
  // which would otherwise swallow it. The trailing (?:\/|$) keeps "request" from
  // also matching "requests".
  if (parsed.host.startsWith("affiliate-program.") && /^\/p\/connect\/request(?:\/|$)/.test(path)) {
    return "campaign-detail";
  }
  // The Creator Connections campaign browse grid, where Campaign Radar highlights
  // campaigns. Verified 2026-07-10 on a live account: it lives on the associates
  // host (affiliate-program.amazon.*) under /p/connect/requests (and /p/connect/home
  // redirects there). Both the CC "Affiliate+ campaigns" (type=affiliate-plus) and
  // "Sponsored Products for Creators" (type=spcc) tabs share this path.
  if (parsed.host.startsWith("affiliate-program.") && /^\/p\/connect(\/|$)/.test(path)) {
    return "campaign-grid";
  }
  // Search results: the /s path with a keyword (k) or department (i) query.
  if (path === "/s" && (parsed.searchParams.has("k") || parsed.searchParams.has("i"))) {
    return "search";
  }
  // Discovery grids: Best Sellers (/gp/bestsellers or the pretty .../zgbs/...
  // slug), New Releases (/gp/new-releases), and Movers & Shakers
  // (/gp/movers-and-shakers). Trend Radar scores these. The pretty Best Sellers
  // URL has no /gp/ prefix, so match the /zgbs/ segment too.
  if (
    path.startsWith("/gp/bestsellers") ||
    path.startsWith("/gp/new-releases") ||
    path.startsWith("/gp/movers-and-shakers") ||
    /\/zgbs(?:\/|$)/.test(path)
  ) {
    return "discovery";
  }
  // Today's Deals grid (/deals and its filter tabs: Lightning Deals, Outlet,
  // Coupons, and the category filters all render this one React grid and keep
  // the /deals pathname). /coupons redirects into it (verified 2026-08-25:
  // /coupons -> /deals?bubble-id=deals-collection-coupons), but a direct visit
  // is matched here too in case the rewrite has not happened yet. The deals
  // overlay scores every tile like search, sourcing ASINs from the MAIN-world
  // deals hook since the grid carries none in the DOM. Distinct from a singular
  // /deal/<id> single-deal page, which is not matched here.
  if (path === "/deals" || path.startsWith("/deals/") || path.startsWith("/coupons")) {
    return "deals";
  }
  return "other";
}

// Walmart URL shapes mapped onto the neutral page classes so the Amazon overlays
// can be reused. Walmart has no analog for creator-upload/manage, campaign-grid,
// or idea-list, so those are never returned here.
function detectWalmartPageType(parsed: URL): PageType {
  const path = parsed.pathname;
  // Product: /ip/<slug>/<itemId> or /ip/<itemId>. The item id is the trailing
  // numeric segment.
  if (/^\/ip\/(?:[^/]+\/)?\d{3,15}(?:[/?]|$)/.test(path)) return "product";
  // Order history.
  if (path.startsWith("/orders")) return "order-history";
  // Search results: /search with a keyword query (Walmart uses ?q=).
  if (path === "/search" && parsed.searchParams.has("q")) return "search";
  // Deals / rollback hubs: /shop/deals redirects to /shop/savings ("Rollbacks &
  // more"), and both render the same searchResult item grid as search. Score
  // them with the search overlay so the per-tile rollback / clearance signals
  // surface. (Walmart /shop/ is a deals hub, unlike Amazon's creator /shop/.)
  if (path.startsWith("/shop/")) return "search";
  // Browse / category grids: /browse/... and /cp/... (category pages). Trend
  // Radar scores these like Amazon's best-seller grids.
  if (path.startsWith("/browse/") || path.startsWith("/cp/")) return "discovery";
  // Seller and brand pages: a grid of one seller's / brand's items, handled by
  // the store overlay like an Amazon brand store.
  if (path.startsWith("/seller/") || path.startsWith("/brand/")) return "brand-store";
  return "other";
}
