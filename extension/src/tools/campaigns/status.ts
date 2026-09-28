import {
  sendToBackground,
  type CampaignStatusResult,
  type CampaignStatusRecord,
} from "../../shared/messages";

// Resolve Creator Connections / SPCC enrollment for a batch of ASINs against the
// desktop app's accepted-history ledger (kept fresh by the app's hourly sync).
// Unlike ownership, there is no server-backed fallback: personal enrollment lives
// only on the desktop, so when the app has never been paired (paired === false) or
// is not running we return nothing and the panel keeps its "available" + Accept
// behavior. Returns only ASINs the creator is actually enrolled in, so callers
// treat an absent ASIN as "not enrolled".
export async function resolveCampaignStatus(asins: string[]): Promise<CampaignStatusRecord[]> {
  const want = Array.from(
    new Set((Array.isArray(asins) ? asins : []).map((a) => String(a || "").trim().toUpperCase()).filter(Boolean)),
  );
  if (want.length === 0) return [];
  let res: CampaignStatusResult;
  try {
    res = await sendToBackground<CampaignStatusResult>({ kind: "LOOKUP_CAMPAIGN_STATUS", asins: want });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  return Array.isArray(res.results) ? res.results : [];
}
