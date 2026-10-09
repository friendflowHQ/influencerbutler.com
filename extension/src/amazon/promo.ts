import { queryAllTextsQuiet } from "./selectors";

// The promo available on a product page: a clippable coupon ("Save 15%", "Apply
// $2.00 coupon") or a promo-code line ("Extra 10% off with code SAVE10"). Shown
// as a "Promo available" indicator in the panel and fed to the AI Post as a fact.
// Read off the live page (no network call); null when the listing has none.

export type ProductPromo = {
  kind: "coupon" | "code" | "promo";
  // Whole-percent discount when the message states one, else null.
  percent: number | null;
  // Flat dollar-style discount in minor units when stated, else null.
  cents: number | null;
  code: string | null;
  // The message as Amazon shows it, trimmed for display.
  text: string;
};

const CODE_RE = /\b(?:promo(?:tion)?(?:al)?\s*code|coupon\s*code|code)\s*[:\-]?\s*([A-Z0-9]{4,20})\b/;
const PERCENT_RE = /(\d{1,2})\s*%/;
const AMOUNT_RE = /(?:[$€£]\s*(\d{1,4}(?:[.,]\d{2})?)|(\d{1,4}(?:[.,]\d{2})?)\s*[$€£])/;
const MAX_TEXT = 120;

// Classify one message. Pure (exported for tests). Returns null when the text
// states no discount at all (so a decoy "Terms" or "Shop items" node is ignored).
export function parsePromoText(raw: string): ProductPromo | null {
  const text = raw
    .replace(/\b(?:terms|shop items|see details|details)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
  if (!text) return null;

  const percent = PERCENT_RE.exec(text)?.[1];
  const amount = AMOUNT_RE.exec(text);
  const amountRaw = amount?.[1] ?? amount?.[2];
  const cents = amountRaw ? Math.round(parseFloat(amountRaw.replace(",", ".")) * 100) : null;
  const code = CODE_RE.exec(text)?.[1] ?? null;
  const hasDiscount = percent !== undefined || cents !== null || code !== null;
  if (!hasDiscount) return null;
  // "Save" / "off" / "coupon" / "code" must frame the number, so a stray "5%"
  // star-rating fragment is not read as a promo.
  if (!/save|off|coupon|code|promo/i.test(text)) return null;

  const pct = percent !== undefined ? parseInt(percent, 10) : null;
  return {
    kind: code ? "code" : /coupon/i.test(text) ? "coupon" : "promo",
    percent: pct !== null && pct > 0 && pct < 100 ? pct : null,
    cents: cents !== null && cents > 0 ? cents : null,
    code,
    text,
  };
}

// The best promo on the page: prefer one that names a code, then a coupon, then
// any other discount message. Null when the page shows none.
export function extractPromo(doc: Document): ProductPromo | null {
  const order = { code: 0, coupon: 1, promo: 2 } as const;
  let best: ProductPromo | null = null;
  for (const text of queryAllTextsQuiet(doc, "productPromo")) {
    const promo = parsePromoText(text);
    if (promo && (!best || order[promo.kind] < order[best.kind])) best = promo;
  }
  return best;
}
