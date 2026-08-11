export type PageType =
  | "product"
  | "order-history"
  | "storefront"
  | "brand-store"
  | "creator-upload"
  | "campaign-grid"
  | "search"
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
  if (path.startsWith("/shop/")) return "storefront";
  // A brand's own storefront (the React store builder): /stores/<Brand>/page/<id>.
  // Distinct from "storefront", which is the creator's own /shop/ page.
  if (/^\/stores\/(?:.+\/)?page\//.test(path)) return "brand-store";
  // The Creator Hub "Edit Video" page, where products are tagged before submit.
  if (/^\/creatorhub\/video\//.test(path)) return "creator-upload";
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
  return "other";
}
