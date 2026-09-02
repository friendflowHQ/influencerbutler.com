import { query, queryMatchingText } from "./selectors";
import { parseBoughtCount, parseBoughtFromBody } from "./bought-badge";

// Reads the non-video signals off a product page: identity, price,
// availability, social proof. Accepts any Document so fetched pages from the
// order-history and storefront scans go through the same code.

export type ProductSignals = {
  asin: string | null;
  marketplace: string;
  title: string | null;
  priceCents: number | null;
  currency: string;
  inStock: boolean;
  boughtPastMonth: number | null;
  brand: string | null;
  // Read from the SiteStripe bar when the user is a logged-in creator; null
  // otherwise. Lets the calculator use the real onsite rate instead of a guess.
  commissionRatePct: number | null;
  // Narrowest breadcrumb category, used to look up the Associates rate card
  // when SiteStripe is not present. Null when there are no breadcrumbs.
  category: string | null;
  // The variation parent ASIN (from the twister JSON), when this listing is a
  // child variation; null for standalone products.
  parentAsin: string | null;
  // Every child (sibling) ASIN of this listing's variation family, from the
  // twister JSON. Empty for a standalone product. Used by "Add all variations".
  variationAsins: string[];
  // The most specific "#N in <category>" bestseller rank, when present.
  bestsellerRank: { rank: number; category: string } | null;
  imageUrl: string | null;
};

// A product ASIN out of a /dp/ or /gp/product/ url. Exported so the link cleaner
// can rebuild a canonical product url from an arbitrary pasted link.
export const ASIN_URL_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/;
const COMMISSION_RE = /commission\s*rate[:\s]*([\d.]+)\s*%/i;
const PRICE_RE = /([$€£])\s*([\d,]+)(?:\.(\d{2}))?/;

export function extractSignals(doc: Document, url: string): ProductSignals {
  return {
    asin: extractAsin(doc, url),
    marketplace: marketplaceFromUrl(url),
    title: cleanText(query(doc, "productTitle")?.textContent) ?? null,
    ...extractPrice(doc),
    inStock: extractInStock(doc),
    boughtPastMonth: extractBoughtPastMonth(doc, marketplaceFromUrl(url)),
    brand: cleanText(query(doc, "productByline")?.textContent) ?? null,
    commissionRatePct: extractCommissionRate(doc),
    category: extractCategory(doc),
    parentAsin: extractParentAsin(doc),
    variationAsins: extractVariationAsins(doc),
    bestsellerRank: extractBestsellerRank(doc),
    imageUrl: extractImage(doc),
  };
}

const PARENT_ASIN_RE = /"parentAsin"\s*:\s*"([A-Z0-9]{10})"/;

// Pure matcher (exported for tests): pull the parent ASIN out of a text blob.
export function matchParentAsin(text: string): string | null {
  if (!text.includes("parentAsin")) return null;
  return text.match(PARENT_ASIN_RE)?.[1] ?? null;
}

export function extractParentAsin(doc: Document): string | null {
  // The parent ASIN lives in the twister/variation JSON inside a state script.
  for (const script of Array.from(doc.querySelectorAll("script"))) {
    const text = script.textContent;
    if (!text || !text.includes("parentAsin")) continue;
    const found = matchParentAsin(text);
    if (found) return found;
  }
  return null;
}

// The twister keys its per-variation display data by child ASIN:
// "dimensionValuesDisplayData":{ "B0ABC12345":[...], "B0XYZ98765":[...] }.
// Collect those ASIN keys to enumerate a listing's sibling variations.
const VARIATION_BLOCK_KEY = '"dimensionValuesDisplayData"';
const ASIN_KEY_RE = /"([A-Z0-9]{10})"\s*:/g;

// Pure parser (exported for tests): every child ASIN in the twister block.
export function parseVariationAsins(text: string): string[] {
  const at = text.indexOf(VARIATION_BLOCK_KEY);
  if (at < 0) return [];
  const braceStart = text.indexOf("{", at + VARIATION_BLOCK_KEY.length);
  if (braceStart < 0) return [];
  // Walk to the matching close brace (bounded so a malformed blob cannot spin).
  let depth = 0;
  let end = -1;
  const limit = Math.min(text.length, braceStart + 200_000);
  for (let i = braceStart; i < limit; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return [];
  const block = text.slice(braceStart, end + 1);
  const asins = new Set<string>();
  ASIN_KEY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ASIN_KEY_RE.exec(block)) !== null) {
    if (match[1]) asins.add(match[1]);
  }
  return [...asins];
}

export function extractVariationAsins(doc: Document): string[] {
  for (const script of Array.from(doc.querySelectorAll("script"))) {
    const text = script.textContent;
    if (!text || !text.includes(VARIATION_BLOCK_KEY)) continue;
    const asins = parseVariationAsins(text);
    if (asins.length > 0) return asins;
  }
  return [];
}

// Best Sellers Rank reads like "#1,234 in Beauty (See Top 100 in Beauty) #5 in
// Wrinkle & Anti-Aging Devices Customer Reviews: ...". The narrowest
// subcategory (smallest rank number) is the most useful, so collect every
// "#N in Category" and keep the smallest. The category is whatever follows
// "in " up to the next real boundary: a parenthetical, another rank, a colon,
// or Amazon's trailing "Customer Reviews" / script text.
const RANK_HEAD_RE = /#([\d,]+)\s+in\s+/g;
const RANK_CATEGORY_END_RE = /\s*(?:[(#:•›»]|Customer\b|See Top\b|var\b|function\b|\{)/i;

// Pure parser (exported for tests): the smallest "#N in Category" in a blob.
export function parseBestsellerRank(source: string): { rank: number; category: string } | null {
  RANK_HEAD_RE.lastIndex = 0;
  let best: { rank: number; category: string } | null = null;
  let match: RegExpExecArray | null;
  while ((match = RANK_HEAD_RE.exec(source)) !== null) {
    const rank = parseInt((match[1] ?? "").replace(/,/g, ""), 10);
    if (!Number.isFinite(rank)) continue;
    const tail = source.slice(RANK_HEAD_RE.lastIndex);
    const end = tail.search(RANK_CATEGORY_END_RE);
    const category = (end >= 0 ? tail.slice(0, end) : tail).trim().slice(0, 60);
    if (!category) continue;
    if (!best || rank < best.rank) best = { rank, category };
  }
  return best;
}

export function extractBestsellerRank(doc: Document): { rank: number; category: string } | null {
  const source = cleanText(query(doc, "bestsellerRank")?.textContent) ?? "";
  return source ? parseBestsellerRank(source) : null;
}

export function extractCategory(doc: Document): string | null {
  // The last breadcrumb is the most specific category (e.g. "Above-Ground
  // Pools"), which is what we token-match against the rate card.
  const crumbs = query(doc, "breadcrumbs");
  if (!crumbs) return null;
  const links = Array.from(crumbs.querySelectorAll("a"));
  const last = links[links.length - 1]?.textContent;
  return cleanText(last) ?? null;
}

export function extractCommissionRate(doc: Document): number | null {
  // Prefer the SiteStripe bar element; fall back to the specific "Commission
  // rate: N%" string anywhere in the top of the page, since the bar's exact
  // markup varies. The phrase only appears when SiteStripe is active.
  const bar = query(doc, "siteStripeCommission");
  const scope = bar?.closest("#amzn-ss-wrap, [id^='amzn-ss']") ?? bar;
  const barText = cleanText(scope?.textContent) ?? "";
  const value = matchCommission(barText) ?? matchCommission(cleanText(doc.body?.textContent?.slice(0, 8000)) ?? "");
  return value;
}

function matchCommission(text: string): number | null {
  const match = text.match(COMMISSION_RE);
  if (!match || !match[1]) return null;
  const value = parseFloat(match[1]);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function extractImage(doc: Document): string | null {
  const img = query<HTMLImageElement>(doc, "mainImage");
  const src = img?.getAttribute("src") ?? img?.getAttribute("data-old-hires") ?? "";
  return src.startsWith("http") ? src : null;
}

export function extractAsin(doc: Document, url: string): string | null {
  const fromUrl = url.match(ASIN_URL_RE);
  if (fromUrl && fromUrl[1]) return fromUrl[1];
  const input = query<HTMLInputElement>(doc, "asinInput");
  const value = input?.value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{10}$/.test(value) ? value : null;
}

export function marketplaceFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || "amazon.com";
  } catch {
    return "amazon.com";
  }
}

function extractPrice(doc: Document): { priceCents: number | null; currency: string } {
  // Take the first price-bearing element across all selectors: Amazon's
  // buybox often has an empty decoy price container (holding only a <style>
  // block) that matches before the real price element.
  const text = queryMatchingText(doc, "price", (t) => PRICE_RE.test(t)) ?? "";
  const match = text.match(PRICE_RE);
  if (!match || !match[2]) return { priceCents: null, currency: "USD" };
  const whole = parseInt(match[2].replace(/,/g, ""), 10);
  const cents = match[3] ? parseInt(match[3], 10) : 0;
  const currency = match[1] === "€" ? "EUR" : match[1] === "£" ? "GBP" : "USD";
  return { priceCents: whole * 100 + cents, currency };
}

export function extractInStock(doc: Document): boolean {
  const availability = cleanText(query(doc, "availability")?.textContent)?.toLowerCase() ?? "";
  if (availability.includes("unavailable")) return false;
  if (availability.includes("in stock")) return true;
  return query(doc, "addToCart") !== null;
}

// Reads Amazon's "X bought in past month" social-proof badge. The dedicated
// social-proofing container is parsed structurally (locale-neutral: the count
// is read from the "N+"/"NK+" shape or a localized phrase), so it works on any
// marketplace. When that container is absent, a whole-body scan falls back to a
// known phrase for `host` (English by default), which never grabs a stray page
// number. Returns a floored count capped at 1,000,000, or null when absent.
export function extractBoughtPastMonth(doc: Document, host?: string): number | null {
  const container = cleanText(query(doc, "boughtPastMonth")?.textContent);
  if (container) {
    const fromContainer = parseBoughtCount(container);
    if (fromContainer !== null) return fromContainer;
  }
  const body = cleanText(doc.body?.textContent?.slice(0, 200000)) ?? "";
  return parseBoughtFromBody(body, host ?? null);
}

function cleanText(text: string | null | undefined): string | undefined {
  const cleaned = text?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : undefined;
}
