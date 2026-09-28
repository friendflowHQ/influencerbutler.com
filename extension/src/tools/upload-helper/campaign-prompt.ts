import { membership, type CatalogueKind } from "../../catalogue/cache";
import type { LoadedFilter } from "../../catalogue/bloom";
import type { CampaignStatusRecord } from "../../shared/messages";

// Pure: which of the upload page's tagged products deserve a campaign prompt.
// Availability comes from the local membership filters (a Bloom hit: "some
// creator can join"), enrollment from the desktop app's accepted-history ledger
// when it is paired (absent ASIN = not enrolled). A product is listed when it
// is available or enrolled in either program; everything else is silent so the
// upload page does not fill with "no campaign" rows.

export type CampaignPrompt = {
  asin: string;
  cc: boolean;
  spcc: boolean;
  ccEnrolled: boolean;
  spccEnrolled: boolean;
};

export function campaignPromptsFor(
  asins: string[],
  loaded: Partial<Record<CatalogueKind, LoadedFilter>>,
  enrolled: CampaignStatusRecord[],
): CampaignPrompt[] {
  const byAsin = new Map<string, CampaignStatusRecord>();
  for (const rec of enrolled) {
    if (rec && typeof rec.asin === "string") byAsin.set(rec.asin.toUpperCase(), rec);
  }
  const seen = new Set<string>();
  const out: CampaignPrompt[] = [];
  for (const raw of asins) {
    const asin = String(raw ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) continue;
    seen.add(asin);
    const flags = membership(loaded, asin);
    const rec = byAsin.get(asin);
    const ccEnrolled = rec?.cc === true;
    const spccEnrolled = rec?.spcc === true;
    const cc = flags.cc || ccEnrolled;
    const spcc = flags.spcc || spccEnrolled;
    if (!cc && !spcc) continue;
    out.push({ asin, cc, spcc, ccEnrolled, spccEnrolled });
  }
  return out;
}
