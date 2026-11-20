import type { ProductRef } from "../../transport/hud-commands";

// Pure model for the search-page shortlist: the products a creator collects while
// scanning results, to act on together (add to a list, copy links, send to the
// app). No DOM or chrome APIs, so the rules are unit-testable.

// One bulk action touches at most this many products (matches the accept-all cap),
// so a click can never fan out into dozens of requests.
export const SHORTLIST_MAX = 10;

export type ShortlistItem = {
  asin: string;
  marketplace: string;
  title: string | null;
  imageUrl: string | null;
  priceCents: number | null;
  currency: string | null;
  href: string | null;
  retailer?: "amazon" | "walmart" | "target";
};

export type ToggleResult = { items: ShortlistItem[]; added: boolean; full: boolean };

// Add the item when absent (unless the list is full), remove it when present.
export function toggleItem(items: readonly ShortlistItem[], item: ShortlistItem, max = SHORTLIST_MAX): ToggleResult {
  const key = (i: ShortlistItem): string => `${i.marketplace}:${i.asin}`;
  if (items.some((i) => key(i) === key(item))) {
    return { items: items.filter((i) => key(i) !== key(item)), added: false, full: false };
  }
  if (items.length >= max) return { items: [...items], added: false, full: true };
  return { items: [...items, item], added: true, full: false };
}

export function toProductRefs(items: readonly ShortlistItem[]): ProductRef[] {
  return items.map((i) => ({
    asin: i.asin,
    marketplace: i.marketplace,
    title: i.title?.slice(0, 200),
    priceCents: i.priceCents,
    ...(i.currency ? { currency: i.currency } : {}),
    imageUrl: i.imageUrl ?? undefined,
    commissionRatePct: null,
    url: i.href ?? undefined,
  }));
}

// Storage: survives SPA navigation within the tab, never leaves it.
export function serializeItems(items: readonly ShortlistItem[]): string {
  return JSON.stringify(items);
}

export function deserializeItems(raw: string | null, max = SHORTLIST_MAX): ShortlistItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ShortlistItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.asin !== "string" || typeof e.marketplace !== "string") continue;
      out.push({
        asin: e.asin,
        marketplace: e.marketplace,
        title: typeof e.title === "string" ? e.title : null,
        imageUrl: typeof e.imageUrl === "string" ? e.imageUrl : null,
        priceCents: typeof e.priceCents === "number" && Number.isFinite(e.priceCents) ? e.priceCents : null,
        currency: typeof e.currency === "string" ? e.currency : null,
        href: typeof e.href === "string" ? e.href : null,
        retailer: e.retailer === "walmart" || e.retailer === "target" || e.retailer === "amazon" ? e.retailer : undefined,
      });
      if (out.length >= max) break;
    }
    return out;
  } catch {
    return [];
  }
}
