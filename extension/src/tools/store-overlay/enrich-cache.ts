import type { DpStaticSignals } from "../../amazon/dp-static";

// Per-ASIN cache of the store overlay's static product-page signals, so
// revisiting a brand store (or seeing the same product on several store tabs)
// does not refetch its detail page. chrome.storage.local with a day TTL and a
// size bound, keyed `marketplace:asin` (same shape as the inline-card cache).

const KEY = "ib-store-enrich";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

type Entry = { signals: DpStaticSignals; ts: number };
type Cache = Record<string, Entry>;

async function readCache(): Promise<Cache> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as Cache) ?? {};
}

export async function getCachedDpBatch(keys: string[]): Promise<Map<string, DpStaticSignals>> {
  const cache = await readCache();
  const out = new Map<string, DpStaticSignals>();
  for (const key of keys) {
    const hit = cache[key];
    if (hit && Date.now() - hit.ts < TTL_MS) out.set(key, hit.signals);
  }
  return out;
}

export async function setCachedDp(key: string, signals: DpStaticSignals): Promise<void> {
  const cache = await readCache();
  cache[key] = { signals, ts: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > MAX_ENTRIES) {
    const oldest = keys
      .sort((a, b) => (cache[a]?.ts ?? 0) - (cache[b]?.ts ?? 0))
      .slice(0, keys.length - MAX_ENTRIES);
    for (const k of oldest) delete cache[k];
  }
  await chrome.storage.local.set({ [KEY]: cache });
}
