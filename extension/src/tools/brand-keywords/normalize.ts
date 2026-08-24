import type { OutreachMap, OutreachRecord } from "./types";

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

// Build the exact + loose lookup maps from the raw ledger records. Collapses to
// one record per brand keeping the most recently used keyword (max lastSentAt);
// a record's own `keywords` list already carries the full newest-first history
// for the tooltip, so it is preserved as-is.
export function buildMaps(records: OutreachRecord[]): OutreachMap {
  const exact = new Map<string, OutreachRecord>();
  for (const record of records) {
    if (!record || typeof record.brand !== "string" || !record.keyword) continue;
    const key = normalizeBrand(record.brand);
    if (!key) continue;
    const existing = exact.get(key);
    if (!existing || record.lastSentAt > existing.lastSentAt) {
      exact.set(key, record);
    }
  }
  const loose = new Map<string, OutreachRecord>();
  for (const [key, record] of exact) {
    const lk = looseKey(key);
    const existing = loose.get(lk);
    // On a loose-key collision keep the newer send, so the fallback stays
    // consistent with the exact map's latest-wins rule.
    if (!existing || record.lastSentAt > existing.lastSentAt) {
      loose.set(lk, record);
    }
  }
  return { exact, loose };
}

// Resolve the brand shown in the Messages widget to its outreach record, exact
// key first then the space-insensitive fallback. Returns null when the brand
// was never messaged with the tool (so the caller mounts no chip).
export function lookupKeyword(map: OutreachMap, displayName: string): OutreachRecord | null {
  const key = normalizeBrand(displayName);
  if (!key) return null;
  return map.exact.get(key) ?? map.loose.get(key.replace(/\s+/g, "")) ?? null;
}
