import type { BrandEnrichmentRecord, BrandMap, EnrichmentMap, OutreachMap, OutreachRecord } from "./types";

// Fold a brand display name (from either the desktop ledger or the Amazon
// Messages widget) to a stable key so the two sides join even when Amazon
// renders a trademark symbol, smart quotes, or extra spacing the ledger did
// not. NFKC first (so full-width / ligature forms collapse), lowercase, then
// strip everything that is not a letter or number to single spaces.
export function normalizeBrand(name: string): string {
  return name
    // Strip trademark/copyright marks first: NFKC would otherwise expand "™"
    // into the letters "tm" and fuse them onto the brand ("Ghostek™" -> "ghostektm").
    .replace(/[™®℠©]/g, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Space-insensitive variant of the key, so "K KAMERIO" and "KKAMERIO" collide.
function looseKey(normalized: string): string {
  return normalized.replace(/\s+/g, "");
}

// Build the exact + loose brand-keyed lookup maps from a set of records. `key`
// extracts the brand display name; `valid` drops records with nothing to show;
// `recency` breaks ties on a collision (keep the higher value). Generic so both
// the outreach ledger and the inbound enrichment set share one matcher.
export function buildBrandMap<T>(
  records: T[],
  key: (record: T) => string | null | undefined,
  valid: (record: T) => boolean,
  recency: (record: T) => number,
): BrandMap<T> {
  const exact = new Map<string, T>();
  for (const record of records) {
    if (!record || !valid(record)) continue;
    const name = key(record);
    if (typeof name !== "string") continue;
    const normalized = normalizeBrand(name);
    if (!normalized) continue;
    const existing = exact.get(normalized);
    if (!existing || recency(record) > recency(existing)) {
      exact.set(normalized, record);
    }
  }
  const loose = new Map<string, T>();
  for (const [normalized, record] of exact) {
    const lk = looseKey(normalized);
    const existing = loose.get(lk);
    if (!existing || recency(record) > recency(existing)) {
      loose.set(lk, record);
    }
  }
  return { exact, loose };
}

// Resolve the brand shown in the Messages widget to a record in `map`, exact key
// first then the space-insensitive fallback. Returns null when no record
// matches, so the caller mounts no chip.
export function lookupBrand<T>(map: BrandMap<T>, displayName: string): T | null {
  const key = normalizeBrand(displayName);
  if (!key) return null;
  return map.exact.get(key) ?? map.loose.get(key.replace(/\s+/g, "")) ?? null;
}

// Build the outreach map: collapse to one record per brand keeping the most
// recently used keyword (max lastSentAt); a record's own `keywords` list already
// carries the full newest-first history for the tooltip, so it is preserved.
export function buildMaps(records: OutreachRecord[]): OutreachMap {
  return buildBrandMap(
    records,
    (r) => r.brand,
    (r) => Boolean(r.keyword),
    (r) => r.lastSentAt,
  );
}

// Resolve the brand shown in the Messages widget to its outreach record. Returns
// null when the brand was never messaged with the tool.
export function lookupKeyword(map: OutreachMap, displayName: string): OutreachRecord | null {
  return lookupBrand(map, displayName);
}

// Build the inbound-brand enrichment map. The desktop returns one record per
// brand already, so there is rarely a collision; on one, keep the higher rate.
// A record with neither a rate nor a cadence carries no chip, so it is dropped.
export function buildEnrichmentMap(records: BrandEnrichmentRecord[]): EnrichmentMap {
  return buildBrandMap(
    records,
    (r) => r.brand,
    (r) => hasEnrichmentSignal(r),
    (r) => r.bestRatePct ?? 0,
  );
}

// A record is worth a chip only when it carries a rate or a cadence.
export function hasEnrichmentSignal(record: BrandEnrichmentRecord): boolean {
  return (
    (typeof record.bestRatePct === "number" && record.bestRatePct > 0) ||
    Boolean(record.cadence)
  );
}
