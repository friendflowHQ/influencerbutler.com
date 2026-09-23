// Amazon marketplace facts in one place: which country and currency a
// marketplace host belongs to, where its Creator Connections (associates) host
// lives, and a price parser that reads every Amazon storefront's money format.
//
// A "marketplace" here is the bare retail host the rest of the extension records
// (as produced by marketplaceFromUrl): "amazon.com", "amazon.co.uk", ... . Every
// helper falls back to the US marketplace (amazon.com / USD) for an unknown or
// missing value, so amazon.com behavior is exactly what it was before these
// helpers existed.
//
// Pure module (no chrome.*, no DOM): safe to import from the background worker,
// content scripts, and MAIN-world hooks alike.

export const DEFAULT_MARKETPLACE = "amazon.com";

type MarketplaceFacts = {
  // Country code, matching the keys used for integrations.global.perCountryTags.
  country: string;
  // ISO 4217 currency the storefront prices in.
  currency: string;
  // Whether the storefront writes decimals with a comma ("12,99 EUR").
  commaDecimal: boolean;
  // The Creator Connections host (the Associates Central host that serves
  // /p/connect/*), when the extension is allowed to open it. Only hosts listed
  // in static/manifest.json belong here; everything else uses the US host.
  ccHost: string | null;
  // The Associates Central host for this country (credentials, reports).
  associatesHost: string;
};

const MARKETPLACES: Record<string, MarketplaceFacts> = {
  "amazon.com": {
    country: "US",
    currency: "USD",
    commaDecimal: false,
    ccHost: "affiliate-program.amazon.com",
    associatesHost: "affiliate-program.amazon.com",
  },
  "amazon.ca": {
    country: "CA",
    currency: "CAD",
    commaDecimal: false,
    ccHost: "affiliate-program.amazon.ca",
    associatesHost: "associates.amazon.ca",
  },
  "amazon.co.uk": {
    country: "UK",
    currency: "GBP",
    commaDecimal: false,
    ccHost: "affiliate-program.amazon.co.uk",
    associatesHost: "affiliate-program.amazon.co.uk",
  },
  "amazon.com.mx": {
    country: "MX",
    currency: "MXN",
    commaDecimal: false,
    ccHost: null,
    associatesHost: "afiliados.amazon.com.mx",
  },
  "amazon.com.br": {
    country: "BR",
    currency: "BRL",
    commaDecimal: true,
    ccHost: null,
    associatesHost: "associados.amazon.com.br",
  },
  "amazon.de": {
    country: "DE",
    currency: "EUR",
    commaDecimal: true,
    ccHost: null,
    associatesHost: "partnernet.amazon.de",
  },
  "amazon.fr": {
    country: "FR",
    currency: "EUR",
    commaDecimal: true,
    ccHost: null,
    associatesHost: "partenaires.amazon.fr",
  },
  "amazon.it": {
    country: "IT",
    currency: "EUR",
    commaDecimal: true,
    ccHost: null,
    associatesHost: "programma-affiliazione.amazon.it",
  },
  "amazon.es": {
    country: "ES",
    currency: "EUR",
    commaDecimal: true,
    ccHost: null,
    associatesHost: "afiliados.amazon.es",
  },
  "amazon.nl": {
    country: "NL",
    currency: "EUR",
    commaDecimal: true,
    ccHost: null,
    associatesHost: "partnernet.amazon.nl",
  },
  "amazon.com.be": {
    country: "BE",
    currency: "EUR",
    commaDecimal: true,
    ccHost: null,
    associatesHost: "affiliate-program.amazon.com.be",
  },
  "amazon.ie": {
    country: "IE",
    currency: "EUR",
    commaDecimal: false,
    ccHost: null,
    associatesHost: "affiliate-program.amazon.ie",
  },
  "amazon.se": {
    country: "SE",
    currency: "SEK",
    commaDecimal: true,
    ccHost: null,
    associatesHost: "affiliate-program.amazon.se",
  },
  "amazon.pl": {
    country: "PL",
    currency: "PLN",
    commaDecimal: true,
    ccHost: null,
    associatesHost: "affiliate-program.amazon.pl",
  },
  "amazon.com.tr": {
    country: "TR",
    currency: "TRY",
    commaDecimal: true,
    ccHost: null,
    associatesHost: "gelirortakligi.amazon.com.tr",
  },
  "amazon.ae": {
    country: "AE",
    currency: "AED",
    commaDecimal: false,
    ccHost: null,
    associatesHost: "affiliate-program.amazon.ae",
  },
  "amazon.sa": {
    country: "SA",
    currency: "SAR",
    commaDecimal: false,
    ccHost: null,
    associatesHost: "affiliate-program.amazon.sa",
  },
  "amazon.eg": {
    country: "EG",
    currency: "EGP",
    commaDecimal: false,
    ccHost: null,
    associatesHost: "affiliate-program.amazon.eg",
  },
  "amazon.in": {
    country: "IN",
    currency: "INR",
    commaDecimal: false,
    ccHost: null,
    associatesHost: "affiliate-program.amazon.in",
  },
  "amazon.co.jp": {
    country: "JP",
    currency: "JPY",
    commaDecimal: false,
    ccHost: null,
    associatesHost: "affiliate.amazon.co.jp",
  },
  "amazon.com.au": {
    country: "AU",
    currency: "AUD",
    commaDecimal: false,
    ccHost: null,
    associatesHost: "affiliate.amazon.com.au",
  },
  "amazon.sg": {
    country: "SG",
    currency: "SGD",
    commaDecimal: false,
    ccHost: null,
    associatesHost: "affiliate-program.amazon.sg",
  },
};

const US = MARKETPLACES[DEFAULT_MARKETPLACE] as MarketplaceFacts;

/**
 * The bare Amazon marketplace for a host, URL, or marketplace string, or null
 * when it is not an Amazon storefront. Strips the scheme, path, "www.", and the
 * associates subdomain, so "https://affiliate-program.amazon.co.uk/p/connect"
 * and "www.amazon.co.uk" both read as "amazon.co.uk".
 */
export function amazonMarketplaceOf(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const host = raw.replace(/^[a-z]+:\/\//, "").split(/[/?#:]/)[0] ?? "";
  const match = host.match(/(?:^|\.)(amazon\.[a-z]{2,3}(?:\.[a-z]{2})?)$/);
  return match?.[1] ?? null;
}

/** Like amazonMarketplaceOf, but falls back to amazon.com. */
export function marketplaceOrDefault(value: string | null | undefined): string {
  return amazonMarketplaceOf(value) ?? DEFAULT_MARKETPLACE;
}

function factsFor(marketplace: string | null | undefined): MarketplaceFacts {
  const mp = amazonMarketplaceOf(marketplace);
  return (mp && MARKETPLACES[mp]) || US;
}

/** Whether the marketplace is one the extension has facts for. */
export function isKnownMarketplace(marketplace: string | null | undefined): boolean {
  const mp = amazonMarketplaceOf(marketplace);
  return !!mp && mp in MARKETPLACES;
}

/** ISO currency for a marketplace; USD when unknown. */
export function currencyForMarketplace(marketplace: string | null | undefined): string {
  return factsFor(marketplace).currency;
}

/** Country code (US, UK, CA, ...) for a marketplace; US when unknown. */
export function countryForMarketplace(marketplace: string | null | undefined): string {
  return factsFor(marketplace).country;
}

/** The retail marketplace for a country code (UK -> amazon.co.uk); amazon.com when unknown. */
export function marketplaceForCountry(country: string | null | undefined): string {
  const code = String(country ?? "").trim().toUpperCase();
  const normalized = code === "GB" ? "UK" : code;
  for (const [host, facts] of Object.entries(MARKETPLACES)) {
    if (facts.country === normalized) return host;
  }
  return DEFAULT_MARKETPLACE;
}

/**
 * The Creator Connections host for a marketplace. Only the hosts the manifest
 * grants (US, CA, UK) are returned; any other marketplace uses the US host.
 */
export function ccHostForMarketplace(marketplace: string | null | undefined): string {
  return factsFor(marketplace).ccHost ?? (US.ccHost as string);
}

/** The retail marketplace a Creator Connections page belongs to. */
export function marketplaceForCcHost(host: string | null | undefined): string {
  return marketplaceOrDefault(host);
}

/** The Associates Central host (credentials, reports) for a marketplace. */
export function associatesHostForMarketplace(marketplace: string | null | undefined): string {
  return factsFor(marketplace).associatesHost;
}

// ---- Money ------------------------------------------------------------------

// Currency markers written before the amount. Longest first so "CA$" wins over
// "$". A bare "$" is resolved against the marketplace (USD on amazon.com, CAD on
// amazon.ca, MXN on amazon.com.mx, AUD on amazon.com.au, SGD on amazon.sg).
const PREFIX_SYMBOLS: ReadonlyArray<[string, string | null]> = [
  ["CA$", "CAD"],
  ["AU$", "AUD"],
  ["MX$", "MXN"],
  ["US$", "USD"],
  ["R$", "BRL"],
  ["C$", "CAD"],
  ["A$", "AUD"],
  ["S$", "SGD"],
  ["$", null],
  ["€", "EUR"],
  ["£", "GBP"],
  ["¥", "JPY"],
  ["￥", "JPY"],
  ["₹", "INR"],
  ["AED", "AED"],
  ["SAR", "SAR"],
  ["EGP", "EGP"],
];
// Currency markers written after the amount ("12,99 €", "49,00 zł").
const SUFFIX_SYMBOLS: ReadonlyArray<[string, string]> = [
  ["€", "EUR"],
  ["zł", "PLN"],
  ["kr", "SEK"],
  ["TL", "TRY"],
  ["₺", "TRY"],
  ["£", "GBP"],
];

const escapeRe = (s: string): string => s.replace(/[$.*+?^()[\]{}|\\]/g, "\\$&");
// An amount: digit groups joined by thousands separators (comma, dot, space,
// no-break space, narrow no-break space), then an optional 1-2 digit fraction.
// Indian lakh grouping ("1,23,456.00") is allowed through 2-digit groups that
// are always followed by another comma, so a "12,99" fraction never reads as one.
const AMOUNT =
  "(\\d{1,3}(?:,\\d{2}(?=,))*(?:[.,\\u00a0\\u202f ]\\d{3})+|\\d+)(?:([.,])(\\d{1,2}))?(?!\\d)";
const PREFIX_RE = new RegExp(
  `(${PREFIX_SYMBOLS.map(([s]) => escapeRe(s)).join("|")})\\s*${AMOUNT}`,
);
const SUFFIX_RE = new RegExp(
  `${AMOUNT}\\s*(${SUFFIX_SYMBOLS.map(([s]) => escapeRe(s)).join("|")})(?![A-Za-z])`,
);

export type ParsedMoney = { priceCents: number; currency: string };

function amountCents(
  whole: string,
  sep: string | undefined,
  frac: string | undefined,
  commaDecimal: boolean,
): number {
  // A trailing ".NN" / ",NN" is the fraction. When the marketplace writes
  // decimals with the other separator AND the fraction is 1-2 digits, it is
  // still a fraction ("12,99" on amazon.de, "12.99" on amazon.com).
  let digits = whole.replace(/\D/g, "");
  let cents = 0;
  if (sep && frac) {
    const isDecimal = sep === "," ? commaDecimal || frac.length === 2 : true;
    if (isDecimal) {
      cents = frac.length === 1 ? parseInt(frac, 10) * 10 : parseInt(frac, 10);
    } else {
      digits += frac;
    }
  }
  return parseInt(digits || "0", 10) * 100 + cents;
}

/**
 * Parse the first price in `text`, in any Amazon storefront's format:
 * "$12.99", "£1,234.56", "12,99 €", "1.234,56 €", "R$ 49,90", "¥1,280",
 * "₹499.00", "CA$19.99". A bare "$" is labeled by `marketplace` (USD when
 * unknown). Returns null when no price is present.
 */
export function parseMoney(text: string, marketplace?: string | null): ParsedMoney | null {
  if (!text) return null;
  const facts = factsFor(marketplace);
  const prefix = PREFIX_RE.exec(text);
  const suffix = SUFFIX_RE.exec(text);
  const usePrefix = prefix && (!suffix || prefix.index <= suffix.index);
  if (usePrefix && prefix) {
    const symbol = prefix[1] ?? "$";
    const mapped = PREFIX_SYMBOLS.find(([s]) => s === symbol)?.[1] ?? null;
    const currency = mapped ?? (facts.currency !== "USD" && isDollarCurrency(facts.currency) ? facts.currency : "USD");
    // Comma-decimal only matters for the marketplace's own currency.
    const commaDecimal = currency === facts.currency ? facts.commaDecimal : currency === "BRL" || currency === "EUR";
    return { priceCents: amountCents(prefix[2] ?? "", prefix[3], prefix[4], commaDecimal), currency };
  }
  if (suffix) {
    const symbol = suffix[4] ?? "";
    const currency = SUFFIX_SYMBOLS.find(([s]) => s === symbol)?.[1] ?? facts.currency;
    // A trailing-symbol amount is written the continental way: comma decimals.
    return { priceCents: amountCents(suffix[1] ?? "", suffix[2], suffix[3], true), currency };
  }
  return null;
}

function isDollarCurrency(currency: string): boolean {
  return currency === "CAD" || currency === "MXN" || currency === "AUD" || currency === "SGD";
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
  MXN: "MX$",
  BRL: "R$",
  JPY: "¥",
  INR: "₹",
  SGD: "S$",
};

/** A short display symbol for a currency ("$", "£", "CA$"); "$" when unknown. */
export function currencySymbol(currency: string | null | undefined): string {
  const code = String(currency ?? "").toUpperCase();
  return CURRENCY_SYMBOLS[code] ?? (code && code !== "USD" ? `${code} ` : "$");
}

/**
 * Whole-unit money for display ("$1,234", "£1,234"), localized through Intl when
 * the runtime knows the currency, else the symbol plus a rounded amount.
 */
export function formatWholeMoney(cents: number, currency = "USD", locale = "en"): string {
  try {
    return new Intl.NumberFormat(locale || "en", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${currencySymbol(currency)}${Math.round(cents / 100)}`;
  }
}

/**
 * The creator's home marketplace, read from their per-country Associates tags
 * ({ US: "tag-20", UK: "tag-21" }). A US tag, or no tags at all, means
 * amazon.com (the US tag falls back to the storefront handle elsewhere); a
 * UK-only creator reads as amazon.co.uk.
 */
export function homeMarketplaceForTags(tags: Record<string, string> | null | undefined): string {
  const entries = Object.entries(tags ?? {}).filter(([, tag]) => String(tag ?? "").trim());
  if (entries.length === 0 || entries.some(([code]) => code.toUpperCase() === "US")) {
    return DEFAULT_MARKETPLACE;
  }
  return marketplaceForCountry(entries[0]?.[0]);
}

/** The Creator Hub video list ("Manage content") on a marketplace. */
export function creatorHubManageUrl(marketplace: string | null | undefined): string {
  return `https://www.${marketplaceOrDefault(marketplace)}/creatorhub/manage`;
}
