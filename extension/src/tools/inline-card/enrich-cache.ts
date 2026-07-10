import type { EnrichResult } from "../../shared/messages";

// Per-ASIN cache of Creator API enrichment for the inline card, so browsing
// many products does not fire a PA-API call every page view. Kept in
// chrome.storage.local with a day TTL and a size bound.

const KEY = "ib-inline-enrich";
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;

type Entry = { result: EnrichResult; ts: number };
type Cache = Record<string, Entry>;

async function readCache(): Promise<Cache> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as Cache) ?? {};
}

export async function getCachedEnrich(asin: string): Promise<EnrichResult | null> {
  const hit = (await readCache())[asin];
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.result;
  return null;
}

export async function setCachedEnrich(asin: string, result: EnrichResult): Promise<void> {
  const cache = await readCache();
  cache[asin] = { result, ts: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > MAX_ENTRIES) {
    const oldest = keys
      .sort((a, b) => (cache[a]?.ts ?? 0) - (cache[b]?.ts ?? 0))
      .slice(0, keys.length - MAX_ENTRIES);
    for (const k of oldest) delete cache[k];
  }
  await chrome.storage.local.set({ [KEY]: cache });
}
