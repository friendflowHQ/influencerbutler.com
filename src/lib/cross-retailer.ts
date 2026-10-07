/**
 * cross-retailer.ts - pure helpers behind /api/extension/cross-retailer, which
 * answers "is this Target product also on Walmart?" for the Chrome extension.
 *
 * The exact path is a UPC lookup (walmart-api lookupByUpc, which already
 * verifies the hit's own barcode). When Walmart has no barcode hit, a keyword
 * search is allowed to propose a "similar" item, but only when brand and every
 * number in the title (sizes, pack counts) agree, so a 12-pack never reads as
 * the 6-pack. Similar matches are always labeled as such by the client.
 */
import type { EnrichedItem } from "./enriched-item";

export type CrossRetailerMatch = {
  itemId: string;
  title: string | null;
  priceCents: number | null;
  inStock: boolean | null;
  // The plain product page, never Walmart's tracking url: that one carries the
  // platform publisher's attribution, not the user's.
  url: string;
  imageUrl: string | null;
  matchType: "upc" | "similar";
};

export function walmartProductUrl(itemId: string): string {
  return `https://www.walmart.com/ip/${itemId}`;
}

export function toMatch(item: EnrichedItem, matchType: "upc" | "similar"): CrossRetailerMatch | null {
  if (!item.itemId) return null;
  const avail = (item.availability ?? "").toLowerCase();
  return {
    itemId: item.itemId,
    title: item.title,
    priceCents: item.priceCents,
    inStock: avail ? !avail.startsWith("not") : null,
    url: walmartProductUrl(item.itemId),
    imageUrl: item.imageUrl,
    matchType,
  };
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "of", "a", "an", "in", "to", "by", "pack", "count", "ct",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

function numericTokens(toks: string[]): Set<string> {
  const out = new Set<string>();
  for (const t of toks) {
    const m = t.match(/^(\d+(?:\.\d+)?)/);
    if (m) out.add(m[1]);
  }
  return out;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export type SimilarQuery = { title: string; brand: string | null };

// The best "similar" candidate, or null. Deliberately strict: a wrong "also on
// Walmart" is worse than a missing one.
export function pickSimilar(items: EnrichedItem[], q: SimilarQuery): EnrichedItem | null {
  const srcTokens = tokens(q.title);
  if (srcTokens.length < 2) return null;
  const srcNums = numericTokens(srcTokens);
  const brand = (q.brand ?? "").trim().toLowerCase();
  let best: { item: EnrichedItem; score: number } | null = null;
  for (const item of items) {
    if (!item.found || !item.itemId || !item.title) continue;
    const candTokens = tokens(item.title);
    if (brand) {
      const candBrand = (item.brand ?? "").toLowerCase();
      if (!candBrand.includes(brand) && !item.title.toLowerCase().includes(brand)) continue;
    }
    if (!sameSet(srcNums, numericTokens(candTokens))) continue;
    const cand = new Set(candTokens);
    const shared = srcTokens.filter((t) => cand.has(t)).length;
    const score = shared / Math.max(srcTokens.length, candTokens.length);
    if (score >= 0.6 && (!best || score > best.score)) best = { item, score };
  }
  return best?.item ?? null;
}

// ---- Request coercion ---------------------------------------------------------

export type CrossRetailerRequest = {
  upc: string | null;
  title: string | null;
  brand: string | null;
};

export function parseRequest(body: unknown): CrossRetailerRequest {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const s = (v: unknown, max: number): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  const upcRaw = s(o.upc, 20);
  return {
    upc: upcRaw && /^\d{8,14}$/.test(upcRaw) ? upcRaw : null,
    title: s(o.title, 300),
    brand: s(o.brand, 80),
  };
}
