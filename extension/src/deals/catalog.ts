// The Deals Catalog model: the type tabs, filters and sorting on top of the
// harvested deals, plus a small local store so the catalog survives closing the
// page. Pure functions over a minimal CatalogItem, so they are unit-tested without
// the page. A deal can be Creator Connections (CC) and EPC (Amazon's SPCC "Earn on
// Clicks" forecast) at the same time.

export type CatalogTab = "all" | "cc" | "epc" | "promo";
export type CatalogSort = "newest" | "discount" | "commission" | "epc";

export type CatalogItem = {
  // Percent off when the aggregator printed one (the promo code's own "N% off");
  // null when unknown, which the discount filter treats as "does not qualify".
  discountPct: number | null;
  priceCents: number | null;
  // Best active Creator Connections campaign commission, when the ASIN has one.
  ccRatePct: number | null;
  // Amazon's forecast dollars-per-click for an SPCC campaign, when the ASIN has one.
  epc: number | null;
  hasPromo: boolean;
  // Original harvest order (0 = newest) so "newest" is stable.
  order: number;
};

export type CatalogFilters = {
  minDiscount: number;
  minCommission: number;
  minEpc: number;
  // Whole dollars; 0 means no cap.
  maxPrice: number;
  onlyPromo: boolean;
};

export const NO_FILTERS: CatalogFilters = {
  minDiscount: 0,
  minCommission: 0,
  minEpc: 0,
  maxPrice: 0,
  onlyPromo: false,
};

export function matchesTab(item: CatalogItem, tab: CatalogTab): boolean {
  switch (tab) {
    case "cc":
      return item.ccRatePct !== null;
    case "epc":
      return item.epc !== null;
    case "promo":
      return item.hasPromo;
    default:
      return true;
  }
}

export function matchesFilters(item: CatalogItem, f: CatalogFilters): boolean {
  if (f.minDiscount > 0 && (item.discountPct ?? -1) < f.minDiscount) return false;
  if (f.minCommission > 0 && (item.ccRatePct ?? -1) < f.minCommission) return false;
  if (f.minEpc > 0 && (item.epc ?? -1) < f.minEpc) return false;
  if (f.maxPrice > 0 && item.priceCents !== null && item.priceCents > f.maxPrice * 100) return false;
  if (f.onlyPromo && !item.hasPromo) return false;
  return true;
}

const SORT_KEY: Record<Exclude<CatalogSort, "newest">, (i: CatalogItem) => number> = {
  discount: (i) => i.discountPct ?? -1,
  commission: (i) => i.ccRatePct ?? -1,
  epc: (i) => i.epc ?? -1,
};

// Tab + filters + sort in one pass. Rows without the sorted value sink to the end;
// ties keep harvest order.
export function buildCatalogView<T>(
  rows: T[],
  get: (row: T) => CatalogItem,
  tab: CatalogTab,
  filters: CatalogFilters,
  sort: CatalogSort,
): T[] {
  const kept = rows.filter((r) => {
    const item = get(r);
    return matchesTab(item, tab) && matchesFilters(item, filters);
  });
  if (sort === "newest") return kept.sort((a, b) => get(a).order - get(b).order);
  const key = SORT_KEY[sort];
  return kept.sort((a, b) => key(get(b)) - key(get(a)) || get(a).order - get(b).order);
}

export function tabCounts<T>(rows: T[], get: (row: T) => CatalogItem): Record<CatalogTab, number> {
  const out: Record<CatalogTab, number> = { all: 0, cc: 0, epc: 0, promo: 0 };
  for (const r of rows) {
    const item = get(r);
    out.all += 1;
    if (matchesTab(item, "cc")) out.cc += 1;
    if (matchesTab(item, "epc")) out.epc += 1;
    if (matchesTab(item, "promo")) out.promo += 1;
  }
  return out;
}

// ---- Local store ------------------------------------------------------------

const STORE_KEY = "ib_deals_catalog";
export const CATALOG_CAP = 300;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type StoredRow<R> = { row: R; savedAt: number };

// Rows are stored as plain JSON (the caller strips UI-only fields). Reads/writes
// are try/catch'd: blocked storage just means the catalog starts empty.
export async function loadCatalog<R>(now: number = Date.now()): Promise<R[]> {
  try {
    const raw = (await chrome.storage.local.get(STORE_KEY))[STORE_KEY] as StoredRow<R>[] | undefined;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e) => e && typeof e.savedAt === "number" && now - e.savedAt < MAX_AGE_MS && e.row)
      .map((e) => e.row)
      .slice(0, CATALOG_CAP);
  } catch {
    return [];
  }
}

export async function saveCatalog<R>(rows: R[], now: number = Date.now()): Promise<void> {
  try {
    const stored: StoredRow<R>[] = rows.slice(0, CATALOG_CAP).map((row) => ({ row, savedAt: now }));
    await chrome.storage.local.set({ [STORE_KEY]: stored });
  } catch {
    // storage blocked: the catalog still works for this session
  }
}
