// Per-(ASIN, market) availability cache in chrome.storage.local, so scrolling
// the campaign grid (an SPA that re-renders constantly) does not re-probe the
// same product pages. Entries expire after 48h: availability churns daily in
// both directions, so shorter re-pays the fetches every visit while longer
// risks a stale "unavailable" hiding a restocked product. "unknown" results
// (bot block, regex miss, missing permission) are never cached so they retry
// on the next visit.

import type { Availability } from "../../background/market-availability";

const KEY_PREFIX = "ibAvail:";
const TTL_MS = 48 * 60 * 60 * 1000;
// Prune ceiling so the map cannot grow without bound (a heavy scroller sees a
// few hundred campaigns; 5k entries is years of headroom at ~4 markets each).
const MAX_ENTRIES = 5000;

type CacheEntry = { status: Availability; checkedAt: number };
type CacheMap = Record<string, CacheEntry>;

const cacheKey = (asin: string, market: string): string =>
  `${KEY_PREFIX}${asin.toUpperCase()}:${market.toUpperCase()}`;

async function readAll(): Promise<CacheMap> {
  const all = await chrome.storage.local.get(null);
  const out: CacheMap = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(KEY_PREFIX)) out[k] = v as CacheEntry;
  }
  return out;
}

/** Fresh cached statuses for (asin, market) pairs; missing/expired keys are absent. */
export async function getCachedAvailability(
  asins: string[],
  markets: string[],
): Promise<Record<string, Record<string, Availability>>> {
  const keys = asins.flatMap((a) => markets.map((m) => cacheKey(a, m)));
  if (keys.length === 0) return {};
  const found = await chrome.storage.local.get(keys);
  const now = Date.now();
  const out: Record<string, Record<string, Availability>> = {};
  for (const asin of asins) {
    for (const market of markets) {
      const entry = found[cacheKey(asin, market)] as CacheEntry | undefined;
      if (!entry || typeof entry.checkedAt !== "number") continue;
      if (now - entry.checkedAt > TTL_MS) continue;
      (out[asin.toUpperCase()] ??= {})[market.toUpperCase()] = entry.status;
    }
  }
  return out;
}

/** Store resolved statuses. "unknown" is skipped so it retries next visit. */
export async function putCachedAvailability(
  asin: string,
  statuses: Record<string, Availability>,
): Promise<void> {
  const now = Date.now();
  const writes: CacheMap = {};
  for (const [market, status] of Object.entries(statuses)) {
    if (status !== "available" && status !== "unavailable") continue;
    writes[cacheKey(asin, market)] = { status, checkedAt: now };
  }
  if (Object.keys(writes).length === 0) return;
  await chrome.storage.local.set(writes);
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
