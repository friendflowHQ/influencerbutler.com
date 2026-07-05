export type PageType = "product" | "order-history" | "storefront" | "other";

export function detectPageType(url: string): PageType {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return "other";
  }
  if (/\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:[/?]|$)/.test(path)) return "product";
  if (path.startsWith("/gp/css/order-history") || path.startsWith("/your-orders")) {
    return "order-history";
  }
  if (path.startsWith("/shop/")) return "storefront";
  return "other";
}
