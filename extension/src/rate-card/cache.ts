// Cached Amazon Associates commission-rate schedule, kept in a dedicated
// chrome.storage.local key. The background refreshes it daily; content scripts
// read it and look a product's category up locally (zero server cost).

export type RateCardRow = { label: string; tokens: string[]; ratePct: number };

// One Subscribe & Save flat activation-bounty category. The server has
// already resolved whether this group's amount comes from a real scraped
// rate or the published fallback (see influencerbutler.com's src/lib/
// rate-card.ts), so the extension does no fallback logic of its own -- a
// token match against `tokens` directly returns `amountCents`.
export type SnsBountyRow = { tokens: string[]; amountCents: number };

export type StoredRateCard = {
  marketplace: string;
  version: string;
  defaultRatePct: number | null;
  rows: RateCardRow[];
  // Absent for a card fetched before this field existed, and always [] for
  // Walmart (no Subscribe & Save program there).
  snsBounty?: SnsBountyRow[];
  fetchedAt: number;
};

const KEY = "ib-rate-card";
// Walmart's commission schedule lives in its own key so the two retailers'
// cards never overwrite each other. Same StoredRateCard shape, same daily
// refresh, same rateForCategory matcher.
const WALMART_KEY = "ib-walmart-rate-card";
const TARGET_KEY = "ib-target-rate-card";

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

export async function getTargetRateCard(): Promise<StoredRateCard | null> {
  const raw = await chrome.storage.local.get(TARGET_KEY);
  return (raw[TARGET_KEY] as StoredRateCard) ?? null;
}

export async function setTargetRateCard(card: StoredRateCard): Promise<void> {
  await chrome.storage.local.set({ [TARGET_KEY]: card });
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

export type SnsBountyMatch = { amountCents: number };

// Looks up a product's possible flat Amazon Subscribe & Save activation
// bounty by category. Unlike rateForCategory, this takes a full breadcrumb
// PATH ("Beauty & Personal Care/Hair Care/Shampoos"), not just the narrowest
// leaf: a product's own leaf category text often carries no trace of the
// word "Beauty" at all ("Hair Shampoo"), so every breadcrumb segment gets a
// chance to match. No fallback math here -- the server already resolved each
// group's amount (see StoredRateCard.snsBounty's own doc comment). Returns
// null when there is no bounty data yet, or nothing in the path matches any
// of the (deliberately narrow) eligible-category token lists.
export function snsBountyForCategory(
  card: StoredRateCard,
  categoryPath: string | null,
): SnsBountyMatch | null {
  if (!card.snsBounty || !card.snsBounty.length) return null;
  const path = (categoryPath ?? "").trim();
  if (!path) return null;
  const segments = path
    .split("/")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const candidates = segments.length ? segments : [path.toLowerCase()];
  for (const segment of candidates) {
    for (const row of card.snsBounty) {
      for (const token of row.tokens) {
        if (token && (token === segment || containsWord(token, segment) || containsWord(segment, token))) {
          return { amountCents: row.amountCents };
        }
      }
    }
  }
  return null;
}
