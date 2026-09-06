import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import type { EnrichResult } from "../shared/messages";

// Creator API enrichment for the storefront checkup. The content script cannot
// hold the license key or hit our origin directly, so it sends a batch of ASINs
// here and the worker POSTs /api/extension/enrich with the Bearer token. The
// OAuth token mint and the encrypted secret stay entirely server-side.

const NOT_CONFIGURED: EnrichResult = { ok: false, configured: false, items: [] };

export async function enrichProducts(
  asins: string[],
  marketplaces?: string[],
): Promise<EnrichResult> {
  const state = await getState();
  const key = state.auth.licenseKey;
  if (!key) return { ...NOT_CONFIGURED, error: "Sign in to use the Creator API." };
  if (asins.length === 0) return { ok: true, configured: true, items: [] };

  try {
    const res = await fetch(ENDPOINTS.enrich, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ asins, marketplaces }),
    });
    const data = (await res.json().catch(() => null)) as
      | (EnrichResult & { migrationPending?: boolean })
      | null;
    // The Creator API tables may not be migrated in yet; treat that like
    // not-configured so the scan still completes on scrape data.
    if (data?.migrationPending) return { ...NOT_CONFIGURED, error: "Creator API is being set up." };
    if (!res.ok || !data || !data.ok) {
      return { ...NOT_CONFIGURED, error: `Could not reach the Creator API (HTTP ${res.status}).` };
    }
    return {
      ok: true,
      configured: Boolean(data.configured),
      items: Array.isArray(data.items) ? data.items : [],
    };
  } catch {
    return { ...NOT_CONFIGURED, error: "Network error reaching the Creator API." };
  }
}
