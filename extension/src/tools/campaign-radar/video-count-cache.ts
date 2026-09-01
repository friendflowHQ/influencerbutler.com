// Per-(ASIN, marketplace) cache of a product's total creator-video count in
// chrome.storage.local, so scrolling the campaign grid (an SPA that re-renders
// constantly) and reopening the same detail page do not re-fetch the same
// product pages. Sibling of availability-cache.ts and follows the same rules.
// Entries expire after 48h: video counts drift slowly, so a shorter TTL would
// re-pay the fetch every visit for little gain. A null result (bot block, no
// count marker, missing permission) is never cached so it retries next visit; a
// real 0 (a product with no videos yet) IS cached, since that is a useful signal.

const KEY_PREFIX = "ibVideoCount:";
const TTL_MS = 48 * 60 * 60 * 1000;
// Prune ceiling so the map cannot grow without bound (a heavy scroller sees a
// few hundred campaigns; 5k entries is years of headroom at one per product).
const MAX_ENTRIES = 5000;

type CacheEntry = { count: number; checkedAt: number };
type CacheMap = Record<string, CacheEntry>;

const cacheKey = (asin: string, marketplace: string): string =>
  `${KEY_PREFIX}${asin.toUpperCase()}:${marketplace.toLowerCase()}`;

async function readAll(): Promise<CacheMap> {
  const all = await chrome.storage.local.get(null);
  const out: CacheMap = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(KEY_PREFIX)) out[k] = v as CacheEntry;
  }
  return out;
}

/** Fresh cached counts keyed by upper-cased ASIN; missing/expired keys are absent. */
export async function getCachedVideoCounts(
  asins: string[],
  marketplace: string,
): Promise<Record<string, number>> {
  const keys = asins.map((a) => cacheKey(a, marketplace));
  if (keys.length === 0) return {};
  const found = await chrome.storage.local.get(keys);
  const now = Date.now();
  const out: Record<string, number> = {};
  for (const asin of asins) {
    const entry = found[cacheKey(asin, marketplace)] as CacheEntry | undefined;
    if (!entry || typeof entry.checkedAt !== "number" || typeof entry.count !== "number") continue;
    if (now - entry.checkedAt > TTL_MS) continue;
    out[asin.toUpperCase()] = entry.count;
  }
  return out;
}

/** Store a resolved count (0 included). A null result is not passed here so it retries. */
export async function putCachedVideoCount(
  asin: string,
  marketplace: string,
  count: number,
): Promise<void> {
  await chrome.storage.local.set({
    [cacheKey(asin, marketplace)]: { count, checkedAt: Date.now() },
  });
  void pruneIfNeeded();
}

// Drop expired entries first; if still over the cap, drop oldest-first.
async function pruneIfNeeded(): Promise<void> {
  try {
    const all = await readAll();
    const keys = Object.keys(all);
    if (keys.length <= MAX_ENTRIES) return;
    const now = Date.now();
    const expired = keys.filter((k) => now - (all[k]?.checkedAt ?? 0) > TTL_MS);
    let toRemove = expired;
    if (keys.length - expired.length > MAX_ENTRIES) {
      const fresh = keys
        .filter((k) => !expired.includes(k))
        .sort((a, b) => (all[a]?.checkedAt ?? 0) - (all[b]?.checkedAt ?? 0));
      toRemove = [...expired, ...fresh.slice(0, keys.length - expired.length - MAX_ENTRIES)];
    }
    if (toRemove.length > 0) await chrome.storage.local.remove(toRemove);
  } catch {
    /* pruning is best-effort; a failed prune never blocks a lookup */
  }
}
