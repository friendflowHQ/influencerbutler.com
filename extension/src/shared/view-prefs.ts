import type { SortKey } from "../tools/search-overlay/toolbar";

// Remembered search-toolbar view (sort, filters, hidden badges), per retailer and
// page kind, so repeating the same workflow does not mean re-setting everything.
// Pure helpers plus a thin chrome.storage.local wrapper under its own key (no
// schema bump, like ib-review-ask).

export const VIEW_PREFS_KEY = "ib-view-prefs";

export const SORT_KEYS: readonly SortKey[] = ["score", "commission", "revenue", "price-asc", "price-desc", "relevance"];

export type ViewPrefs = {
  sort: SortKey;
  campaignOnly: boolean;
  minPriceCents: number | null;
  // Currency the minimum price was typed for; the price is ignored on a page
  // in another currency.
  currency: string | null;
  badgesHidden: boolean;
};

export function defaultPrefs(defaultSort: SortKey): ViewPrefs {
  return { sort: defaultSort, campaignOnly: false, minPriceCents: null, currency: null, badgesHidden: false };
}

// Never trust stored data: anything malformed falls back to the default value.
export function sanitizePrefs(raw: unknown, defaultSort: SortKey): ViewPrefs {
  const base = defaultPrefs(defaultSort);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const sort = SORT_KEYS.includes(r.sort as SortKey) ? (r.sort as SortKey) : base.sort;
  const price = typeof r.minPriceCents === "number" && Number.isFinite(r.minPriceCents) && r.minPriceCents > 0 ? Math.round(r.minPriceCents) : null;
  return {
    sort,
    campaignOnly: r.campaignOnly === true,
    minPriceCents: price,
    currency: price !== null && typeof r.currency === "string" ? r.currency : null,
    badgesHidden: r.badgesHidden === true,
  };
}

export function isDefaultPrefs(prefs: ViewPrefs, defaultSort: SortKey): boolean {
  return prefs.sort === defaultSort && !prefs.campaignOnly && prefs.minPriceCents === null && !prefs.badgesHidden;
}

// The saved minimum price only applies on a page in the same currency.
export function priceForCurrency(prefs: ViewPrefs, pageCurrency: string | null): number | null {
  if (prefs.minPriceCents === null) return null;
  if (prefs.currency && pageCurrency && prefs.currency !== pageCurrency) return null;
  return prefs.minPriceCents;
}

type PrefsMap = Record<string, unknown>;

async function readAll(): Promise<PrefsMap> {
  try {
    const got = await chrome.storage.local.get(VIEW_PREFS_KEY);
    const stored = got?.[VIEW_PREFS_KEY];
    return stored && typeof stored === "object" ? (stored as PrefsMap) : {};
  } catch {
    return {};
  }
}

export async function loadViewPrefs(key: string, defaultSort: SortKey): Promise<ViewPrefs> {
  return sanitizePrefs((await readAll())[key], defaultSort);
}

export async function saveViewPrefs(key: string, prefs: ViewPrefs, defaultSort: SortKey): Promise<void> {
  try {
    const all = await readAll();
    if (isDefaultPrefs(prefs, defaultSort)) delete all[key];
    else all[key] = prefs;
    await chrome.storage.local.set({ [VIEW_PREFS_KEY]: all });
  } catch {
    // storage unavailable: the view just is not remembered
  }
}
