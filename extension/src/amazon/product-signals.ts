import { query, queryMatchingText } from "./selectors";

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
  imageUrl: string | null;
};

const ASIN_URL_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/;
const BOUGHT_RE = /([\d,.]+)\s*([Kk])?\+?\s*bought in past month/;
const COMMISSION_RE = /commission\s*rate[:\s]*([\d.]+)\s*%/i;
const PRICE_RE = /([$€£])\s*([\d,]+)(?:\.(\d{2}))?/;

export function extractSignals(doc: Document, url: string): ProductSignals {
  return {
    asin: extractAsin(doc, url),
    marketplace: marketplaceFromUrl(url),
    title: cleanText(query(doc, "productTitle")?.textContent) ?? null,
    ...extractPrice(doc),
    inStock: extractInStock(doc),
    boughtPastMonth: extractBoughtPastMonth(doc),
    brand: cleanText(query(doc, "productByline")?.textContent) ?? null,
    commissionRatePct: extractCommissionRate(doc),
    category: extractCategory(doc),
    imageUrl: extractImage(doc),
  };
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

export function extractBoughtPastMonth(doc: Document): number | null {
  const container = query(doc, "boughtPastMonth");
  const text = cleanText(container?.textContent) ?? cleanText(doc.body?.textContent?.slice(0, 200000)) ?? "";
  const match = text.match(BOUGHT_RE);
  if (!match || !match[1]) return null;
  const base = parseFloat(match[1].replace(/,/g, ""));
  if (Number.isNaN(base)) return null;
  return Math.round(match[2] ? base * 1000 : base);
}

function cleanText(text: string | null | undefined): string | undefined {
  const cleaned = text?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : undefined;
}
