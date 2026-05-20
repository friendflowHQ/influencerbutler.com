// ISO 3166-1 alpha-2 country list for the affiliate apply form.
// Ordered with the affiliate program's largest expected markets pinned to the
// top, then alphabetical for the rest. Tax-form intake is handled by Lemon
// Squeezy — this column is for analytics + region-aware support only.

export type Country = {
  code: string; // ISO 3166-1 alpha-2
  name: string;
};

const TOP: Country[] = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
];

const REST: Country[] = [
  { code: "AE", name: "United Arab Emirates" },
  { code: "AR", name: "Argentina" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CH", name: "Switzerland" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "CZ", name: "Czechia" },
  { code: "DE", name: "Germany" },
  { code: "DK", name: "Denmark" },
  { code: "EG", name: "Egypt" },
  { code: "ES", name: "Spain" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GR", name: "Greece" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "ID", name: "Indonesia" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IN", name: "India" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "MX", name: "Mexico" },
  { code: "MY", name: "Malaysia" },
  { code: "NG", name: "Nigeria" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "NZ", name: "New Zealand" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SE", name: "Sweden" },
  { code: "SG", name: "Singapore" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Türkiye" },
  { code: "TW", name: "Taiwan" },
  { code: "UA", name: "Ukraine" },
  { code: "VN", name: "Vietnam" },
  { code: "ZA", name: "South Africa" },
];

export const COUNTRIES: Country[] = [...TOP, ...REST];

const CODE_TO_NAME = new Map(COUNTRIES.map((c) => [c.code, c.name]));

export function isValidCountryCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return CODE_TO_NAME.has(code.toUpperCase());
}

export function nameForCountryCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return CODE_TO_NAME.get(code.toUpperCase()) ?? null;
}
