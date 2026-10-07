import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import { findTargetByUpc, targetProductUrl } from "../target/redsky";
import {
  cacheKey,
  cacheTtlMs,
  canLookUp,
  normalizeResult,
  searchUrlFor,
  otherRetailer,
  type CrossResult,
  type CrossSource,
} from "../tools/cross-retailer/model";

// "Also on Walmart / Also on Target" lookup. The content script cannot hold the
// license key or fetch the other retailer cross-origin, so it asks the worker.
//   - Target page -> Walmart: our server (Walmart Affiliate API, by UPC).
//   - Walmart page -> Target: Target's own search API from the browser (there is
//     no server-side Target API), riding the user's own Target session.
// Every failure path is "unchecked" (with a plain search link), never "none":
// a bot wall or an outage must not read as "this isn't sold there".

const CACHE_KEY = "ib-xr-cache";
const CACHE_MAX = 120;

type CacheEntry = { at: number; ttl: number; result: CrossResult };
type CacheMap = Record<string, CacheEntry>;

async function readCache(): Promise<CacheMap> {
  try {
    const got = await chrome.storage.local.get(CACHE_KEY);
    const map = got[CACHE_KEY];
    return map && typeof map === "object" ? (map as CacheMap) : {};
  } catch {
    return {};
  }
}

async function writeCache(key: string, result: CrossResult, now: number): Promise<void> {
  const ttl = cacheTtlMs(result);
  if (ttl <= 0) return;
  try {
    const map = await readCache();
    map[key] = { at: now, ttl, result };
    const keys = Object.keys(map);
    if (keys.length > CACHE_MAX) {
      keys
        .sort((a, b) => (map[a]?.at ?? 0) - (map[b]?.at ?? 0))
        .slice(0, keys.length - CACHE_MAX)
        .forEach((k) => delete map[k]);
    }
    await chrome.storage.local.set({ [CACHE_KEY]: map });
  } catch {
    // The cache is a convenience: a storage failure just means a fresh lookup next time.
  }
}

function unchecked(src: CrossSource): CrossResult {
  return { status: "unchecked", searchUrl: searchUrlFor(otherRetailer(src.retailer), src) };
}

// Target page -> the matching Walmart product, via our server.
async function walmartFromServer(src: CrossSource): Promise<CrossResult> {
  const key = (await getState()).auth.licenseKey;
  if (!key) return unchecked(src);
  try {
    const res = await fetch(ENDPOINTS.crossRetailer, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ upc: src.upc, title: src.title, brand: src.brand }),
    });
    const data = (await res.json().catch(() => null)) as
      | {
          ok?: boolean;
          configured?: boolean;
          checked?: boolean;
          match?: {
            itemId?: string;
            title?: string | null;
            priceCents?: number | null;
            inStock?: boolean | null;
            url?: string;
            imageUrl?: string | null;
            matchType?: "upc" | "similar";
          } | null;
        }
      | null;
    if (!res.ok || !data?.ok || data.configured === false || data.checked === false) {
      return unchecked(src);
    }
    if (!data.match) return { status: "none" };
    return normalizeResult(
      {
        status: "found",
        match: { ...data.match, id: data.match.itemId },
      },
      src,
    );
  } catch {
    return unchecked(src);
  }
}

// Walmart page -> the matching Target product, from the browser.
async function targetFromBrowser(src: CrossSource): Promise<CrossResult> {
  if (!src.upc) return unchecked(src);
  const found = await findTargetByUpc(src.upc);
  if (found.status !== "ok") return unchecked(src);
  if (!found.value || !found.value.product.tcin) return { status: "none" };
  const p = found.value.product;
  return normalizeResult(
    {
      status: "found",
      match: {
        id: p.tcin,
        title: p.title,
        priceCents: p.priceCents,
        inStock: p.inStock,
        url: targetProductUrl(p.tcin as string),
        imageUrl: p.imageUrl,
        matchType: found.value.matchType,
      },
    },
    src,
  );
}

export async function lookupCrossRetailer(src: CrossSource, now: number = Date.now()): Promise<CrossResult> {
  if (!canLookUp(src)) return unchecked(src);
  const key = cacheKey(src);
  const cached = (await readCache())[key];
  if (cached && now - cached.at < cached.ttl) return cached.result;

  const result = src.retailer === "target" ? await walmartFromServer(src) : await targetFromBrowser(src);
  await writeCache(key, result, now);
  return result;
}
