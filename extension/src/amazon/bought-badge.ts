// Reads Amazon's "X bought in past month" social-proof badge into a numeric
// floor. Two entry points share one normalization:
//   parseBoughtCount    - for text taken from the DEDICATED social-proofing
//                         container, where the badge is essentially the only
//                         content. Reads the count structurally (locale-neutral)
//                         from the "N+" / "NK+" shape Amazon renders in every
//                         Latin-script marketplace, with a per-locale phrase
//                         fallback for the rest.
//   parseBoughtFromBody - for a whole-page (or whole-tile) text fallback when
//                         the container is absent. REQUIRES a known phrase so a
//                         random page number is never mistaken for the badge.
//
// Normalization (shared): thousands/decimal separators are locale-varied, a
// K/M-style multiplier may follow the number, the result is FLOORED, and it is
// capped at 1,000,000 to match the desktop price/rank store contract. An absent
// badge yields null.

// The desktop bridge banks boughtPastMonth into a durable time-series; cap the
// value so a mis-parse can never write an absurd figure. Matches the desktop
// product_scan contract.
export const BOUGHT_CAP = 1_000_000;

// Number, then an optional multiplier suffix. Text is whitespace-normalized
// before matching (NBSP grouping such as French "1 000" collapses to a plain
// space), so the number class needs only the plain space; the lazy quantifier
// keeps it from spanning far in a full-body scan. Group 1 = number.
const NUM = "([\\d][\\d., ]*?)";
// K/M are near-universal on Amazon badges. The localized long forms are
// best-effort: a wrong one simply fails to match (never yields a wrong number).
// UNVERIFIED - confirm on a live page/fixture: de "Tsd."/"Mio.", es/pt "mil",
// ja "万" (man = 10,000). Group 2 = multiplier.
const MULT = "(万|Tsd\\.?|Mio\\.?|mil|[KkMm])?";

// Multiplier token -> factor. Each pattern is anchored, so order is irrelevant.
const MULTIPLIERS: Array<{ re: RegExp; factor: number }> = [
  { re: /^mio\.?$/i, factor: 1_000_000 }, // UNVERIFIED (de)
  { re: /^tsd\.?$/i, factor: 1_000 }, //     UNVERIFIED (de)
  { re: /^mil$/i, factor: 1_000 }, //        UNVERIFIED (es/pt)
  { re: /^万$/, factor: 10_000 }, //      UNVERIFIED (ja)
  { re: /^k$/i, factor: 1_000 },
  { re: /^m$/i, factor: 1_000_000 },
];

// The locale-neutral count shape: a number, an optional multiplier, then the
// "+" (Latin markets) or the Japanese "以上" (ijou = "or more"). Because
// it does not depend on the surrounding words, it works on any marketplace that
// renders the "N+" form, which is the common case. Used ONLY on the dedicated
// container's text, never a full-body scan.
const PLUS_FORM_RE = new RegExp(`${NUM}\\s*${MULT}\\s*(?:\\+|以上)`, "i");

// Per-language phrase matchers. Each captures group 1 = number, group 2 =
// optional multiplier, immediately before the localized "bought in past month"
// wording. English is verified (US/UK/CA/AU/IN/SG share the exact phrase). The
// non-English entries are UNVERIFIED best-effort: confirm each against a saved
// live fixture (see __fixtures__/bought/) before claiming that marketplace.
const EN = new RegExp(`${NUM}\\s*${MULT}\\+?\\s*bought in past month`, "i");
const DE = new RegExp(`${NUM}\\s*${MULT}\\+?\\s*mal im letzten monat gekauft`, "i"); // UNVERIFIED
const FR = new RegExp(`${NUM}\\s*${MULT}\\+?\\s*achet[eé]s?\\s+au cours du mois dernier`, "i"); // UNVERIFIED
const ES = new RegExp(`${NUM}\\s*${MULT}\\+?\\s*comprados?\\s+en el [uú]ltimo mes`, "i"); // UNVERIFIED
const IT = new RegExp(`${NUM}\\s*${MULT}\\+?\\s*acquistati nell'ultimo mese`, "i"); // UNVERIFIED
const BR = new RegExp(`${NUM}\\s*${MULT}\\+?\\s*comprados?\\s+no [uú]ltimo m[eê]s`, "i"); // UNVERIFIED
// Japanese renders the count with a counter (点/個) then "以上" (ijou = "or
// more"), e.g. "500点以上". Anchored tightly on that counter+以上 structure so
// an unrelated number (e.g. the "1" in "1か月" = "1 month") can never match:
// a wrong guess yields null, never a wrong number. UNVERIFIED - confirm the
// real phrasing against a live fixture. Group 2 = optional 万/K/M multiplier.
const JP = new RegExp(`${NUM}\\s*(万|[KkMm])?\\s*[点個]\\s*以上`, "i"); // UNVERIFIED

// Host -> ordered phrase list (localized first, English as a shared fallback
// since Amazon sometimes serves English UI to signed-out sessions).
const HOST_PHRASES: Record<string, RegExp[]> = {
  "amazon.de": [DE, EN],
  "amazon.fr": [FR, EN],
  "amazon.es": [ES, EN],
  "amazon.it": [IT, EN],
  "amazon.com.mx": [ES, EN], // es-MX shares the Spanish phrasing (UNVERIFIED)
  "amazon.com.br": [BR, EN],
  "amazon.co.jp": [JP, EN],
};

// Every phrase, for a container/body scan when the host is unknown. The
// container is dedicated to the badge, so trying all phrases is safe there.
const ALL_PHRASES: RegExp[] = [EN, DE, FR, ES, IT, BR, JP];

function phrasesForHost(host: string | null): RegExp[] {
  if (!host) return ALL_PHRASES;
  const bare = host.replace(/^www\./, "").toLowerCase();
  return HOST_PHRASES[bare] ?? [EN];
}

// Read the count straight from the dedicated social-proofing container's text.
export function parseBoughtCount(text: string): number | null {
  const clean = normalizeWhitespace(text);
  if (!clean) return null;
  // Tier 1: the locale-neutral "N+" / "NK+" shape.
  const plus = clean.match(PLUS_FORM_RE);
  if (plus && plus[1]) {
    const value = normalizeCount(plus[1], plus[2] ?? null);
    if (value !== null) return value;
  }
  // Tier 2: a known localized phrase (exact counts with no "+", or markets that
  // omit the Latin "+"). Host unknown here, so try every phrase.
  return parseBoughtFromBody(clean, null);
}

// Read the count from a larger blob (full page body or a search tile). A phrase
// is required so an unrelated number is never taken for the badge.
export function parseBoughtFromBody(text: string, host: string | null): number | null {
  const clean = normalizeWhitespace(text);
  if (!clean) return null;
  for (const phrase of phrasesForHost(host)) {
    const match = clean.match(phrase);
    if (match && match[1]) {
      const value = normalizeCount(match[1], match[2] ?? null);
      if (value !== null) return value;
    }
  }
  return null;
}

function multiplierFactor(token: string | null): number {
  if (!token) return 1;
  const trimmed = token.trim();
  for (const { re, factor } of MULTIPLIERS) {
    if (re.test(trimmed)) return factor;
  }
  return 1;
}

function normalizeCount(numText: string, multiplierToken: string | null): number | null {
  const factor = multiplierFactor(multiplierToken);
  if (factor !== 1) {
    // With a multiplier the separator is a decimal mark ("1.5K", "1,5 Tsd.").
    const base = parseFloat(numText.replace(/\s/g, "").replace(",", "."));
    if (Number.isNaN(base)) return null;
    return finalize(base * factor);
  }
  // Without a multiplier, separators are thousands groups ("1,000", "1.000",
  // "1 000"): keep the digits only.
  const digits = numText.replace(/[^\d]/g, "");
  if (!digits) return null;
  return finalize(parseInt(digits, 10));
}

function finalize(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.min(BOUGHT_CAP, Math.floor(value));
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
