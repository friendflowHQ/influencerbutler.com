import { bloomHas, decodeBits, fillRatio, type LoadedFilter } from "./bloom";

// A healthy 1%-error filter is about half full; past this it is unusable.
const SATURATED_FILL = 0.9;

// Cached campaign-membership filters, kept in a dedicated chrome.storage.local
// key (separate from the main extension state so it stays self-contained).
// The background refreshes them daily; content scripts read and query locally.

export type CatalogueKind = "cc" | "spcc" | "deals";

type StoredFilter = {
  version: string;
  m: number;
  k: number;
  bitsBase64: string;
  fetchedAt: number;
};

type CatalogueCache = Partial<Record<CatalogueKind, StoredFilter>>;

const KEY = "ib-catalogue";

export async function getCache(): Promise<CatalogueCache> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as CatalogueCache) ?? {};
}

export async function setFilter(kind: CatalogueKind, filter: StoredFilter): Promise<void> {
  const cache = await getCache();
  cache[kind] = filter;
  await chrome.storage.local.set({ [KEY]: cache });
}

export function versionOf(cache: CatalogueCache, kind: CatalogueKind): string | null {
  return cache[kind]?.version ?? null;
}

// Content-script side: check the current product's ASIN against both filters.
// Bits are decoded once per call; callers checking many ASINs should decode
// via loadFilters() and reuse.
export function loadFilters(cache: CatalogueCache): Partial<Record<CatalogueKind, LoadedFilter>> {
  const out: Partial<Record<CatalogueKind, LoadedFilter>> = {};
  for (const kind of ["cc", "spcc", "deals"] as const) {
    const f = cache[kind];
    if (!f) continue;
    const filter = { m: f.m, k: f.k, bits: decodeBits(f.bitsBase64) };
    // A saturated filter says "in a campaign" for every ASIN, which paints a
    // bare Campaign chip on every tile. Treat it as absent so callers fall back
    // to the per-ASIN rate lookups (the rate tables are the real truth).
    if (fillRatio(filter) > SATURATED_FILL) continue;
    out[kind] = filter;
  }
  return out;
}

export function membership(
  loaded: Partial<Record<CatalogueKind, LoadedFilter>>,
  asin: string,
): Record<CatalogueKind, boolean> {
  return {
    cc: loaded.cc ? bloomHas(loaded.cc, asin) : false,
    spcc: loaded.spcc ? bloomHas(loaded.spcc, asin) : false,
    deals: loaded.deals ? bloomHas(loaded.deals, asin) : false,
  };
}
