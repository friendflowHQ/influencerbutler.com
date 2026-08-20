export type PageType =
  | "product"
  | "order-history"
  | "storefront"
  | "brand-store"
  | "creator-upload"
  | "creator-manage"
  | "campaign-grid"
  | "search"
  | "discovery"
  | "idea-list"
  | "other";

export function detectPageType(url: string): PageType {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "other";
  }
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
  return "other";
}
