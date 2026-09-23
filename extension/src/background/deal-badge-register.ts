import { getDealSources, hasOriginPermission } from "./deal-harvest";
import { getSettings } from "../storage/store";
import { log } from "../shared/log";
import { BUNDLED_DEAL_SITE_URLS } from "../shared/constants";

// Keeps the on-page "N deals found" badge (deal-badge/index.ts) registered as
// a DYNAMIC content script (chrome.scripting, MV3) on exactly the curated +
// saved deal-aggregator origins the user has already granted host permission
// for. The curated list is served from our API and the saved list is
// user-edited, so neither is known at package time: a static manifest.json
// content_scripts entry cannot express it, and chrome.scripting.
// registerContentScripts is the supported way to add matches at runtime for
// origins we hold permission for. Never runs on a site the user has not
// already granted (that grant only ever happens from a click in the deals
// page, same as a manual harvest).
const SCRIPT_ID = "deal-badge";

export async function syncDealBadgeContentScripts(): Promise<void> {
  if (!chrome.scripting?.registerContentScripts) return; // older Chrome: no-op

  const [settings, curated] = await Promise.all([getSettings(), getDealSources()]);
  const candidates = [
    ...new Set([...BUNDLED_DEAL_SITE_URLS, ...curated.map((s) => s.url), ...settings.dealSources]),
  ];
  const matches = await grantedOriginPatterns(candidates);

  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    if (matches.length === 0) {
      if (existing.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
      return;
    }
    const script: chrome.scripting.RegisteredContentScript = {
      id: SCRIPT_ID,
      js: ["deal-badge.js"],
      matches,
      runAt: "document_idle",
    };
    if (existing.length > 0) {
      await chrome.scripting.updateContentScripts([script]);
    } else {
      await chrome.scripting.registerContentScripts([script]);
    }
  } catch (error) {
    log("deal-badge", "content script sync failed", error);
  }
}

async function grantedOriginPatterns(urls: string[]): Promise<string[]> {
  const out = new Set<string>();
  for (const url of urls) {
    if (!(await hasOriginPermission(url))) continue;
    try {
      out.add(`${new URL(url).origin}/*`);
    } catch {
      // malformed URL: skip
    }
  }
  return [...out];
}
