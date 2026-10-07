import { log } from "../shared/log";
import { getState } from "../storage/store";
import type { MatchedAsinsResult, StorefrontIndexItem } from "../shared/messages";
import {
  buildStorefrontIndex,
  loadStorefrontIndex,
  matchedAsinSet,
  saveStorefrontIndex,
} from "../storefront/index-store";
import { getOrderAsins } from "./order-video-scan";

// The products Auto-accept's default scope ("matched products only") may accept:
// everything the creator features on their storefront plus everything in their
// synced order history. See storefront/index-store.ts.

export async function getMatchedAsins(): Promise<MatchedAsinsResult> {
  const index = await loadStorefrontIndex();
  let orderAsins: string[] = [];
  try {
    const orders = await getOrderAsins();
    if (orders.ok) orderAsins = orders.items.map((item) => item.asin);
  } catch (error) {
    // Orders are optional here: a signed-out / offline worker still matches on
    // the locally stored storefront.
    log("matched-asins", "order asins unavailable", error);
  }
  const storefrontCount = index ? Object.keys(index.byAsin).length : 0;
  const asins = Array.from(matchedAsinSet(index, orderAsins));
  return { asins, storefrontCount, orderCount: orderAsins.length };
}

// Rebuild the stored storefront index from a finished harvest. Two guards:
//  - only the creator's OWN storefront is indexed (the harvest handle must equal
//    the "My storefront handle" setting): the index feeds both the accept scope
//    and the content-link submit, and someone else's video must never be
//    submitted as the creator's content;
//  - a harvest that found no videos never overwrites a good index (an empty /
//    failed scan must not silently turn "matched products only" into "nothing
//    matches").
export async function saveStorefrontIndexFromHarvest(
  handle: string | null,
  items: StorefrontIndexItem[],
): Promise<void> {
  try {
    const own = (await getState()).settings.storefrontHandle?.trim().toLowerCase() ?? "";
    if (!own || !handle || handle.trim().toLowerCase() !== own) return;
    const index = buildStorefrontIndex(items, Date.now(), handle);
    if (Object.keys(index.byAsin).length === 0) return;
    await saveStorefrontIndex(index);
  } catch (error) {
    log("matched-asins", "could not save storefront index", error);
  }
}
