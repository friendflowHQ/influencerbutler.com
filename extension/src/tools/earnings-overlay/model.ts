import type { AsinEarnings } from "../../transport/hud-commands";

// Pure earnings math shared by the storefront tile badges, the detail popup, and
// the product panel: money formatting, marketplace scoping, tile summing, and
// aggregation across the several ASINs a Curations card can tag. Kept free of
// DOM so it is unit-testable on its own.

export type CurrencyTotal = { currency: string; amount: number; count: number };
export type StoreRow = NonNullable<AsinEarnings["byStore"]>[number];
export type YearRow = NonNullable<AsinEarnings["byYear"]>[number];
export type MonthRow = NonNullable<AsinEarnings["byMonth"]>[number];
export type CampaignRow = NonNullable<AsinEarnings["campaigns"]>[number];

// "market" scopes to the marketplace the creator is viewing (the storefront's
// own market); "all" is the ASIN's worldwide total, matching Cha-Ching.
export type EarningsScope = "market" | "all";

// Whole-currency-unit money format, matching the product panel: a symbol for the
// common creator currencies, ISO code otherwise, always two decimals.
export function formatMoney(amount: number, currency: string): string {
  const symbol =
    currency === "GBP"
      ? "£"
      : currency === "EUR"
        ? "€"
        : currency === "USD" || currency === "CAD" || currency === "AUD"
          ? "$"
          : "";
  const value = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return symbol ? `${symbol}${value}` : `${value} ${currency}`;
}

// Whether this record carries any of the rich buckets a newer desktop build
// sends. When false the UI shows only the flat total (no "View breakdown").
export function hasBreakdown(e: AsinEarnings): boolean {
  return Boolean(
    (e.byStore && e.byStore.length) ||
      (e.byYear && e.byYear.length) ||
      (e.byMonth && e.byMonth.length) ||
      (e.campaigns && e.campaigns.length),
  );
}

// Currency totals for one ASIN under a scope. In "market" scope, when we have a
// marketplace and a byStore split, sum only that marketplace's stores; otherwise
// fall back to the flat byCurrency total (the ASIN's worldwide figure).
export function scopedCurrencyTotals(
  e: AsinEarnings,
  scope: EarningsScope,
  marketplace: string | null,
): CurrencyTotal[] {
  if (scope === "market" && marketplace && e.byStore && e.byStore.length) {
    const byCur = new Map<string, CurrencyTotal>();
    for (const store of e.byStore) {
      if (store.marketplace !== marketplace) continue;
      const cur = byCur.get(store.currency) ?? { currency: store.currency, amount: 0, count: 0 };
      cur.amount += store.amount;
      cur.count += store.orders;
      byCur.set(store.currency, cur);
    }
    return [...byCur.values()];
  }
  return e.byCurrency.map((c) => ({ ...c }));
}

function mergeCurrencyTotals(target: Map<string, CurrencyTotal>, add: CurrencyTotal[]): void {
  for (const c of add) {
    const cur = target.get(c.currency) ?? { currency: c.currency, amount: 0, count: 0 };
    cur.amount += c.amount;
    cur.count += c.count;
    target.set(c.currency, cur);
  }
}

// Sum a Curations card's earnings across the products it tags, under a scope.
// Only ASINs the creator has actually earned on contribute; zero rows drop out
// so an untouched card gets no badge.
export function tileTotals(
  earningsByAsin: Map<string, AsinEarnings>,
  asins: string[],
  scope: EarningsScope,
  marketplace: string | null,
): CurrencyTotal[] {
  const byCur = new Map<string, CurrencyTotal>();
  for (const asin of asins) {
    const e = earningsByAsin.get(asin.toUpperCase());
    if (!e || !e.hasEarnings) continue;
    mergeCurrencyTotals(byCur, scopedCurrencyTotals(e, scope, marketplace));
  }
  return [...byCur.values()]
    .filter((c) => c.amount > 0 || c.count > 0)
    .sort((a, b) => b.amount - a.amount);
}

export type AggregatedEarnings = {
  byCurrency: CurrencyTotal[];
  byStore: StoreRow[];
  byYear: YearRow[];
  byMonth: MonthRow[];
  campaigns: CampaignRow[];
};

// Merge the buckets of one or more ASINs into a single breakdown for the detail
// popup. For a single-product card this is just that ASIN's data, re-sorted; for
// a multi-product card the stores/years/months/campaigns are combined by key.
export function aggregateEarnings(list: AsinEarnings[]): AggregatedEarnings {
  const cur = new Map<string, CurrencyTotal>();
  const stores = new Map<string, StoreRow>();
  const years = new Map<string, YearRow>();
  const months = new Map<string, MonthRow>();
  const campaigns = new Map<string, CampaignRow>();

  for (const e of list) {
    mergeCurrencyTotals(cur, e.byCurrency);
    for (const s of e.byStore ?? []) {
      const key = `${s.trackingId}|${s.placement}|${s.marketplace}|${s.currency}`;
      const row = stores.get(key) ?? { ...s, amount: 0, units: 0, orders: 0 };
      row.amount += s.amount;
      row.units += s.units;
      row.orders += s.orders;
      stores.set(key, row);
    }
    for (const y of e.byYear ?? []) {
      const key = `${y.year}|${y.currency}`;
      const row = years.get(key) ?? { ...y, amount: 0, units: 0, orders: 0 };
      row.amount += y.amount;
      row.units += y.units;
      row.orders += y.orders;
      years.set(key, row);
    }
    for (const m of e.byMonth ?? []) {
      const key = `${m.month}|${m.currency}`;
      const row = months.get(key) ?? { ...m, amount: 0 };
      row.amount += m.amount;
      months.set(key, row);
    }
    for (const c of e.campaigns ?? []) {
      const key = `${c.name}|${c.currency}`;
      const row = campaigns.get(key) ?? { ...c, clicks: null, orders: null, amount: 0 };
      row.amount += c.amount;
      row.clicks = addNullable(row.clicks, c.clicks);
      row.orders = addNullable(row.orders, c.orders);
      if (row.ratePct == null) row.ratePct = c.ratePct;
      campaigns.set(key, row);
    }
  }

  return {
    byCurrency: [...cur.values()].sort((a, b) => b.amount - a.amount),
    byStore: [...stores.values()].sort((a, b) => b.amount - a.amount),
    byYear: [...years.values()].sort((a, b) => b.year - a.year),
    byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    campaigns: [...campaigns.values()].sort((a, b) => b.amount - a.amount),
  };
}

function addNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}
