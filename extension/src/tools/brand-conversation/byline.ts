// Brand names as Amazon's pages print them. A product page's byline reads "Visit
// the Ghostek Store" or "Brand: Ghostek" (and the Spanish / French equivalents);
// the conversation list names the bare brand. Pure so it is unit-tested.

const PATTERNS: RegExp[] = [
  /^visit the (.+?) store$/i,
  /^brand:\s*(.+)$/i,
  /^marca:\s*(.+)$/i,
  /^marque\s*:\s*(.+)$/i,
  /^visita la tienda de (.+)$/i,
  /^visiter la boutique (.+)$/i,
  /^besuche den (.+?)-store$/i,
];

export function cleanByline(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  for (const pattern of PATTERNS) {
    const m = pattern.exec(text);
    if (m?.[1]) {
      const brand = m[1].trim();
      return brand || null;
    }
  }
  return text.length <= 80 ? text : null;
}
