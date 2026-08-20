import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import type { MarketBatchResult, MarketProduct, MarketResult } from "../shared/messages";

// The market endpoint caps a batch at 50 ASINs (EXT_MAX_BATCH server-side); keep
// the client in step so a big search page does not silently drop the tail.
const MARKET_BATCH_CAP = 50;

// Shared product catalogue ("internal Keepa") read. The content script cannot
// hold the license key or hit our origin directly, so it asks the worker, which
// GETs /api/extension/market with the Bearer token. Reading the pool is open to
// any signed-in user (contribution is the opt-in part, not consumption), so this
// does not check the contributeCatalogue setting.

const EMPTY: MarketResult = { ok: false, product: null };

export async function getMarket(asin: string, marketplace: string): Promise<MarketResult> {
  const state = await getState();
  const key = state.auth.licenseKey;
  if (!key) return EMPTY;

  const url = `${ENDPOINTS.market}?asins=${encodeURIComponent(asin)}&marketplace=${encodeURIComponent(marketplace)}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; migrationPending?: boolean; products?: MarketProduct[] }
      | null;
    if (data?.migrationPending) return { ok: false, migrationPending: true, product: null };
    if (!res.ok || !data || !data.ok || !Array.isArray(data.products)) return EMPTY;
    return { ok: true, product: data.products[0] ?? null };
  } catch {
    return EMPTY;
  }
}

const EMPTY_BATCH: MarketBatchResult = { ok: false, products: [] };

// Batched read for the search overlay: one GET over a whole page of ASINs.
// Mirrors getMarket (same Bearer token, same migrationPending handling) but
// keeps every returned product instead of just the first.
export async function getMarketBatch(
  asins: string[],
  marketplace: string,
): Promise<MarketBatchResult> {
  const state = await getState();
  const key = state.auth.licenseKey;
  if (!key) return EMPTY_BATCH;

  const unique = [...new Set(asins.map((a) => a.toUpperCase()))]
    .filter((a) => /^[A-Z0-9]{10}$/.test(a))
    .slice(0, MARKET_BATCH_CAP);
  if (unique.length === 0) return EMPTY_BATCH;

  const url = `${ENDPOINTS.market}?asins=${encodeURIComponent(unique.join(","))}&marketplace=${encodeURIComponent(marketplace)}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; migrationPending?: boolean; products?: MarketProduct[] }
      | null;
    if (data?.migrationPending) return { ok: false, migrationPending: true, products: [] };
    if (!res.ok || !data || !data.ok || !Array.isArray(data.products)) return EMPTY_BATCH;
    return { ok: true, products: data.products };
  } catch {
    return EMPTY_BATCH;
  }
}
