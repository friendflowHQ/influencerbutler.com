// Cached Amazon Associates commission-rate schedule, kept in a dedicated
// chrome.storage.local key. The background refreshes it daily; content scripts
// read it and look a product's category up locally (zero server cost).

export type RateCardRow = { label: string; tokens: string[]; ratePct: number };

export type StoredRateCard = {
  marketplace: string;
  version: string;
  defaultRatePct: number | null;
  rows: RateCardRow[];
  fetchedAt: number;
};

const KEY = "ib-rate-card";
// Walmart's commission schedule lives in its own key so the two retailers'
// cards never overwrite each other. Same StoredRateCard shape, same daily
// refresh, same rateForCategory matcher.
const WALMART_KEY = "ib-walmart-rate-card";

export async function getRateCard(): Promise<StoredRateCard | null> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as StoredRateCard) ?? null;
}

export async function setRateCard(card: StoredRateCard): Promise<void> {
  await chrome.storage.local.set({ [KEY]: card });
}

export async function getWalmartRateCard(): Promise<StoredRateCard | null> {
  const raw = await chrome.storage.local.get(WALMART_KEY);
  return (raw[WALMART_KEY] as StoredRateCard) ?? null;
}

export async function setWalmartRateCard(card: StoredRateCard): Promise<void> {
  await chrome.storage.local.set({ [WALMART_KEY]: card });
}

export type RateMatch = { ratePct: number; label: string; isDefault: boolean };

// Map a product's category text to a commission rate. Token-matches the
// category against each row (Amazon lists broad parent categories; product
// pages show narrow leaf ones, so a substring match either way is right), then
// falls back to the catch-all default rate. Returns null when nothing matches
// and there is no default.
// Whole-word containment (plural tolerant): "chair" must not match the "hair"
// token, nor "carpet" the "pet" token, which a raw substring test would.
export function containsWord(haystack: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}(?:e?s)?($|[^a-z0-9])`, "i").test(haystack);
}

export function rateForCategory(card: StoredRateCard, category: string | null): RateMatch | null {
  const needle = (category ?? "").trim().toLowerCase();
  if (needle) {
    for (const row of card.rows) {
      for (const token of row.tokens) {
        if (token && (token === needle || containsWord(token, needle) || containsWord(needle, token))) {
          return { ratePct: row.ratePct, label: row.label, isDefault: false };
        }
      }
    }
  }
  if (card.defaultRatePct !== null) {
    return { ratePct: card.defaultRatePct, label: "", isDefault: true };
  }
  return null;
}
