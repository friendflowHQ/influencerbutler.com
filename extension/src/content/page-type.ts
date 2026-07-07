export type PageType =
  | "product"
  | "order-history"
  | "storefront"
  | "creator-upload"
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
  // The Creator Hub "Edit Video" page, where products are tagged before submit.
  if (/^\/creatorhub\/video\//.test(path)) return "creator-upload";
  // Search results: the /s path with a keyword (k) or department (i) query.
  if (path === "/s" && (parsed.searchParams.has("k") || parsed.searchParams.has("i"))) {
    return "search";
  }
  return "other";
}
