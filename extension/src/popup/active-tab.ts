// The web page the popup is "about". On desktop Chrome the popup floats over
// the page, so the active tab in the current window is that page. Android
// extension browsers (Lemur) can open the popup as its own tab instead, in
// which case the active tab is the popup itself; fall back to the most recently
// used web tab so the page-status and "Get my link" cards still find the page.

type TabLike = Pick<chrome.tabs.Tab, "id" | "url" | "lastAccessed">;

export async function activePageTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !isExtensionPage(tab.url)) return tab;
  try {
    const all = await chrome.tabs.query({});
    return pickLastWebTab(all, tab.id);
  } catch {
    return undefined;
  }
}

function isExtensionPage(url: string | undefined): boolean {
  return !!url && /^(chrome|moz)-extension:\/\//.test(url);
}

/** Most recently used http(s) tab, excluding the popup's own tab. Pure for tests. */
export function pickLastWebTab<T extends TabLike>(tabs: T[], excludeId?: number): T | undefined {
  let best: T | undefined;
  for (const tab of tabs) {
    if (tab.id === excludeId) continue;
    if (!tab.url || !/^https?:\/\//.test(tab.url)) continue;
    if (!best || (tab.lastAccessed ?? 0) > (best.lastAccessed ?? 0)) best = tab;
  }
  return best;
}
