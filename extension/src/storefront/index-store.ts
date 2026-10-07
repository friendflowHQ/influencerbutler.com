// The creator's own storefront as an ASIN -> content-link map, kept in local
// storage so the Auto-accept pass (which runs in a background tab with no
// storefront on screen) can answer two questions:
//   1. "Matched products only": is this campaign's product one the creator
//      already features (storefront) or has bought (orders)?
//   2. Content-link submit: which of the creator's own videos should be the link
//      for this ASIN?
// Written at the end of every storefront harvest (tools/storefront-check/
// harvest.ts); own storage key, no schema bump (like the accept ledger).

export const STOREFRONT_INDEX_KEY = "ib-storefront-index";
// A storefront with thousands of posts must not grow the storage entry without
// bound; the newest posts come first in the feed, so the cap drops the oldest.
export const STOREFRONT_INDEX_CAP = 6_000;

export type StorefrontIndexEntry = { url: string; title: string };

export type StorefrontIndex = {
  updatedAt: number;
  // The /shop/<handle> the map was built from (null when unknown).
  handle: string | null;
  byAsin: Record<string, StorefrontIndexEntry>;
};

// The slice of a harvested card the index needs (HarvestedItem satisfies it).
export type IndexableItem = {
  type: string;
  title: string;
  url: string;
  taggedAsins: string[];
};

const ASIN_RE = /^[A-Z0-9]{10}$/;

// Pure: one entry per ASIN from the creator's VIDEO posts (a video is the link
// Amazon accepts as content; photos / lists are not submitted). The feed is
// newest-first, so the first video that tags an ASIN wins. Only own-storefront
// URLs on an Amazon host are kept, so a stray off-site link can never be
// submitted as "my storefront link".
export function buildStorefrontIndex(
  items: IndexableItem[],
  now: number,
  handle: string | null,
): StorefrontIndex {
  const byAsin: Record<string, StorefrontIndexEntry> = {};
  let count = 0;
  for (const item of items) {
    if (item.type !== "video" || !isAmazonUrl(item.url)) continue;
    for (const raw of item.taggedAsins) {
      const asin = raw.trim().toUpperCase();
      if (!ASIN_RE.test(asin) || byAsin[asin]) continue;
      if (count >= STOREFRONT_INDEX_CAP) break;
      byAsin[asin] = { url: item.url, title: item.title.slice(0, 200) };
      count += 1;
    }
  }
  return { updatedAt: now, handle, byAsin };
}

function isAmazonUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)amazon\.[a-z.]+$/i.test(u.hostname);
  } catch {
    return false;
  }
}

// Pure: coerce an untrusted stored value into an index, or null when it is
// absent / malformed.
export function readStorefrontIndex(raw: unknown): StorefrontIndex | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.updatedAt !== "number" || !obj.byAsin || typeof obj.byAsin !== "object") {
    return null;
  }
  const byAsin: Record<string, StorefrontIndexEntry> = {};
  for (const [asin, value] of Object.entries(obj.byAsin as Record<string, unknown>)) {
    if (!ASIN_RE.test(asin) || !value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    if (typeof entry.url !== "string" || !isAmazonUrl(entry.url)) continue;
    byAsin[asin] = {
      url: entry.url,
      title: typeof entry.title === "string" ? entry.title : "",
    };
  }
  return {
    updatedAt: obj.updatedAt,
    handle: typeof obj.handle === "string" ? obj.handle : null,
    byAsin,
  };
}

// Pure: the "matched products" set, the storefront's ASINs plus the creator's
// order-history ASINs (upper-cased, valid ones only).
export function matchedAsinSet(
  index: StorefrontIndex | null,
  orderAsins: readonly string[],
): Set<string> {
  const set = new Set<string>(index ? Object.keys(index.byAsin) : []);
  for (const raw of orderAsins) {
    const asin = raw.trim().toUpperCase();
    if (ASIN_RE.test(asin)) set.add(asin);
  }
  return set;
}

export async function loadStorefrontIndex(): Promise<StorefrontIndex | null> {
  const raw = await chrome.storage.local.get(STOREFRONT_INDEX_KEY);
  return readStorefrontIndex(raw[STOREFRONT_INDEX_KEY]);
}

export async function saveStorefrontIndex(index: StorefrontIndex): Promise<void> {
  await chrome.storage.local.set({ [STOREFRONT_INDEX_KEY]: index });
}
