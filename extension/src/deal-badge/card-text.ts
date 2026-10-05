// Reads the deal facts an aggregator card prints in its visible text:
//   "40% off Code: 3R139Z4Y + 10% Coupon / 12.49-13.49(Reg.24.99-26.99)"
//
// Pure and DOM-free so it unit-tests with plain strings. The desktop does the
// math (it treats the card price as the final after-code price), so this only
// reports what the card says and never combines percents. A field is omitted
// entirely when the card does not carry it: no nulls, no zeros.

export type CardDealFacts = {
  promoCode?: string;
  promoPercentOff?: number;
  couponPercentOff?: number;
  couponAmountOff?: number;
  couponClip?: boolean;
  originalPrice?: number;
  cardText?: string;
};

export const CARD_TEXT_MAX = 600;

const CODE_LINE_RE = /Code:[^\n]*/i;
const CODE_PCT_RE = /(\d{1,3})\s*%\s*off\s*Code:/i;
const CODE_TOKEN_RE = /^\s*([A-Za-z0-9]{4,20})\b/;
// "(Reg.24.99)" and "(Reg.24.99-26.99)": the first number is the low end.
const REG_RE = /\(\s*Reg\.?\s*\$?\s*(\d+(?:\.\d+)?)/i;

function positive(n: number): number | undefined {
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function parseCardText(raw: string): CardDealFacts {
  const text = String(raw || "").trim();
  const out: CardDealFacts = {};
  if (!text) return out;

  const codeLine = text.match(CODE_LINE_RE)?.[0];
  if (codeLine) {
    // Piece 0 is the promo code itself; every later piece is a "+ extra".
    const pieces = codeLine.replace(/^Code:/i, "").split("+");
    const token = pieces[0]?.match(CODE_TOKEN_RE)?.[1];
    if (token) out.promoCode = token;

    for (const piece of pieces.slice(1)) {
      // A piece that mentions "code" is another promo code, never the coupon.
      if (/\bcode\b/i.test(piece) || !/coupon|clip/i.test(piece)) continue;
      // Stop at the price that can trail on the same line ("/ 12.49(Reg...)").
      const head = piece.split(/[\/\n(]/)[0] ?? "";
      const pct = head.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
      const amt = head.match(/\$\s*(\d+(?:\.\d+)?)/);
      out.couponClip = true;
      if (pct) {
        const v = positive(Number(pct[1]));
        if (v !== undefined && v <= 100) out.couponPercentOff = v;
      } else if (amt) {
        const v = positive(Number(amt[1]));
        if (v !== undefined) out.couponAmountOff = v;
      }
      break;
    }
  }

  const pctM = text.match(CODE_PCT_RE);
  if (pctM) {
    const v = positive(Number(pctM[1]));
    if (v !== undefined && v <= 100) out.promoPercentOff = v;
  }

  // A coupon mentioned somewhere other than the code line still counts.
  if (!out.couponClip && /\bcoupon\b/i.test(text)) out.couponClip = true;

  const regM = text.match(REG_RE);
  if (regM) {
    const v = positive(Number(regM[1]));
    if (v !== undefined) out.originalPrice = v;
  }

  return out;
}

// The facts plus the raw text the desktop re-parses as a fallback. cardText is
// included whenever the card has any text, even when nothing else parsed.
export function cardDealFacts(rawText: string): CardDealFacts {
  const facts = parseCardText(rawText);
  const trimmed = String(rawText || "").trim();
  if (trimmed) facts.cardText = trimmed.slice(0, CARD_TEXT_MAX);
  return facts;
}
