import { query } from "./selectors";

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
};

const ASIN_URL_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/;
const BOUGHT_RE = /([\d,.]+)\s*([Kk])?\+?\s*bought in past month/;

export function extractSignals(doc: Document, url: string): ProductSignals {
  return {
    asin: extractAsin(doc, url),
    marketplace: marketplaceFromUrl(url),
    title: cleanText(query(doc, "productTitle")?.textContent) ?? null,
    ...extractPrice(doc),
    inStock: extractInStock(doc),
    boughtPastMonth: extractBoughtPastMonth(doc),
    brand: cleanText(query(doc, "productByline")?.textContent) ?? null,
  };
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
  const text = cleanText(query(doc, "price")?.textContent) ?? "";
  const match = text.match(/([$€£])\s*([\d,]+)(?:\.(\d{2}))?/);
  if (!match || !match[2]) return { priceCents: null, currency: "USD" };
  const whole = parseInt(match[2].replace(/,/g, ""), 10);
  const cents = match[3] ? parseInt(match[3], 10) : 0;
  const currency = match[1] === "€" ? "EUR" : match[1] === "£" ? "GBP" : "USD";
  return { priceCents: whole * 100 + cents, currency };
}

function extractInStock(doc: Document): boolean {
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
