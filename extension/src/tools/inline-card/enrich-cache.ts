import type { EnrichResult } from "../../shared/messages";

// Per-ASIN cache of Creator API enrichment for the inline card, so browsing
// many products does not fire a PA-API call every page view. Kept in
// chrome.storage.local with a day TTL and a size bound.

const KEY = "ib-inline-enrich";
const TTL_MS = 12 * 60 * 60 * 1000;
// A "not configured yet" verdict must not stick: the moment the user connects
// the Creator API (their own creds or a backup lease) the panel should stop
// telling them to connect. So a not-configured result is cached only long enough
// to keep one page's inline card and global-reach panel from each firing their
// own request, then it re-checks the server. Real product data keeps the full
// TTL.
const NEGATIVE_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 200;

type Entry = { result: EnrichResult; ts: number };
type Cache = Record<string, Entry>;

async function readCache(): Promise<Cache> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as Cache) ?? {};
}

export async function getCachedEnrich(asin: string): Promise<EnrichResult | null> {
  const hit = (await readCache())[asin];
  if (!hit) return null;
  const ttl = hit.result.configured ? TTL_MS : NEGATIVE_TTL_MS;
  if (Date.now() - hit.ts < ttl) return hit.result;
  return null;
}

export async function setCachedEnrich(asin: string, result: EnrichResult): Promise<void> {
  // Never persist a failed request: a transient network/server error would
  // otherwise read as "Creator API not configured" and freeze the connect
  // prompt in place. Only definitive answers from the server are cached.
  if (!result.ok) return;
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

// Drop every cached enrich verdict. Called when the user connects or changes
// their Creator API setup (saves own credentials, enables/disables the backup
// lease) so the inline card and global-reach panel re-check the server on the
// next product view instead of showing a stale "connect" prompt.
export async function clearEnrichCache(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
