import {
  sendToBackground,
  type OrderAsinsResult,
  type OwnershipLookupResult,
  type OwnershipRecord,
} from "../../shared/messages";

const EMPTY_POSTED = { available: false, count: 0, platforms: [], lastAt: null, items: [] } as const;

// Resolve ownership for a batch of ASINs. Prefers the desktop bridge (rich:
// owned + order detail + already-posted content). When the app has never been
// paired (paired === false), falls back to the server-backed order list so a
// signed-in user still sees owned-only, with no order detail or posted content.
// Returns only ASINs that carry a signal, so callers treat an absent ASIN as
// "nothing to show".
export async function resolveOwnership(asins: string[]): Promise<OwnershipRecord[]> {
  const want = Array.from(
    new Set((Array.isArray(asins) ? asins : []).map((a) => String(a || "").trim().toUpperCase()).filter(Boolean)),
  );
  if (want.length === 0) return [];
  let res: OwnershipLookupResult;
  try {
    res = await sendToBackground<OwnershipLookupResult>({ kind: "LOOKUP_OWNERSHIP", asins: want });
  } catch {
    return [];
  }
  // App installed but not running: fall back to the server-backed owned list.
  if (res.paired === false) return ownedOnlyFallback(want);
  if (!res.ok) return [];
  return Array.isArray(res.results) ? res.results : [];
}

// Server-backed owned-only fallback for users who have not paired the desktop
// app. Marks ownership from the synced order list; no order detail, no posted
// content (those live only on the desktop).
async function ownedOnlyFallback(want: string[]): Promise<OwnershipRecord[]> {
  let res: OrderAsinsResult;
  try {
    res = await sendToBackground<OrderAsinsResult>({ kind: "GET_ORDER_ASINS" });
  } catch {
    return [];
  }
  if (!res.ok || !Array.isArray(res.items)) return [];
  const owned = new Set(res.items.map((i) => String(i.asin || "").trim().toUpperCase()).filter(Boolean));
  const out: OwnershipRecord[] = [];
  for (const asin of want) {
    if (!owned.has(asin)) continue;
    out.push({ asin, owned: true, posted: { ...EMPTY_POSTED, platforms: [], items: [] }, reviewed: null });
  }
  return out;
}
