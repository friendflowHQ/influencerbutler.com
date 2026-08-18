import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import type { MarketProduct, MarketResult } from "../shared/messages";

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
