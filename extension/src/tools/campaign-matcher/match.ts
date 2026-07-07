import { membership, type CatalogueKind } from "../../catalogue/cache";
import type { LoadedFilter } from "../../catalogue/bloom";

// Pure matcher: given a list of products the creator owns or has tagged, and
// the locally-loaded CC/SPCC membership filters, return the ones that likely
// have an open campaign. A Bloom-filter hit proves eligibility, not that the
// campaign is unaccepted; the desktop app dedupes on accept. Prefers CC when a
// product is in both filters (the higher-value program).

export type CampaignInput = { asin: string; title: string | null };
export type CampaignMatch = { asin: string; kind: "cc" | "spcc"; title: string | null };

export function matchCampaigns(
  items: CampaignInput[],
  loaded: Partial<Record<CatalogueKind, LoadedFilter>>,
): CampaignMatch[] {
  const seen = new Set<string>();
  const matches: CampaignMatch[] = [];
  for (const item of items) {
    const asin = item.asin.toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) continue;
    seen.add(asin);
    const flags = membership(loaded, asin);
    if (flags.cc) matches.push({ asin, kind: "cc", title: item.title });
    else if (flags.spcc) matches.push({ asin, kind: "spcc", title: item.title });
  }
  return matches;
}
