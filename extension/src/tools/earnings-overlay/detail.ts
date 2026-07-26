import { el, collapsible } from "../../ui/components";
import { showModal } from "../../ui/modal";
import { t } from "../../i18n";
import type { AsinEarnings } from "../../transport/hud-commands";
import {
  aggregateEarnings,
  formatMoney,
  hasBreakdown,
  type AggregatedEarnings,
  type CurrencyTotal,
  type EarningsScope,
} from "./model";

type DetailInput = {
  // Product/card title for the modal heading.
  title?: string | null;
  // One entry per product the card tags (usually one on a product page).
  earnings: AsinEarnings[];
  // The marketplace the creator is viewing, so the popup can scope the headline
  // and store table to it. Null falls back to all-store totals.
  marketplace: string | null;
};

// The "Cha-Ching Sales" answer: a product's real earnings broken down by store,
// year, month, and Creator Connections campaign, from the desktop ledger. Opens
// in the shared modal host. Degrades to the flat total when the desktop build
// sends no breakdown buckets.
export function renderEarningsDetail(input: DetailInput): void {
  const withEarnings = input.earnings.filter((e) => e.hasEarnings);
  if (withEarnings.length === 0) return;
  const agg = aggregateEarnings(withEarnings);
  const canScope = Boolean(input.marketplace) && agg.byStore.length > 0;
  // Only default to market scope when this marketplace actually has store rows,
  // so a product opened where it never earned does not headline "$0.00".
  const marketHasStores =
    Boolean(input.marketplace) && agg.byStore.some((s) => s.marketplace === input.marketplace);
  const anyBreakdown = withEarnings.some(hasBreakdown);

  const container = el("div", "earn-detail");
  const sections = el("div", "earn-sections");
  let scope: EarningsScope = marketHasStores ? "market" : "all";

  const rebuild = (): void => {
    sections.replaceChildren();
    renderTotal(sections, agg, scope, input.marketplace);
    if (!anyBreakdown) {
      sections.append(el("p", "note", t().earnNoBreakdown));
      return;
    }
    renderStores(sections, agg, scope, input.marketplace);
    renderYears(sections, agg);
    renderMonths(sections, agg);
    renderCampaigns(sections, agg);
  };

  if (canScope) container.append(scopeToggle(() => scope, (next) => { scope = next; rebuild(); }));
  container.append(sections);
  rebuild();

  showModal({
    title: input.title ? input.title.slice(0, 90) : t().earnDetailTitle,
    body: [container],
    wide: true,
    closeLabel: t().earnClose,
  });
}

function scopeToggle(get: () => EarningsScope, set: (s: EarningsScope) => void): HTMLElement {
  const wrap = el("div", "earn-seg");
  const opts: Array<{ key: EarningsScope; label: string }> = [
    { key: "market", label: t().earnScopeThisMarket },
    { key: "all", label: t().earnScopeAllStores },
  ];
  const buttons = opts.map(({ key, label }) => {
    const btn = el("button", "earn-seg-btn", label) as HTMLButtonElement;
    btn.type = "button";
    btn.addEventListener("click", () => {
      set(key);
      for (const b of buttons) b.classList.toggle("on", b === btn);
    });
    return btn;
  });
  buttons[0]?.classList.toggle("on", get() === "market");
  buttons[1]?.classList.toggle("on", get() === "all");
  for (const b of buttons) wrap.append(b);
  return wrap;
}

// Headline: the scoped currency total(s). In market scope with store data, sum
// only the viewed marketplace's stores; otherwise the ASIN's worldwide total.
function renderTotal(
  parent: HTMLElement,
  agg: AggregatedEarnings,
  scope: EarningsScope,
  marketplace: string | null,
): void {
  const totals = headlineTotals(agg, scope, marketplace);
  const row = el("div", "earn-total");
  if (totals.length === 0) {
    row.append(el("span", "earn-total-amt", formatMoney(0, agg.byCurrency[0]?.currency ?? "USD")));
  }
  for (const c of totals) {
    row.append(el("span", "earn-total-amt", formatMoney(c.amount, c.currency)));
  }
  parent.append(row);
}

function headlineTotals(
  agg: AggregatedEarnings,
  scope: EarningsScope,
  marketplace: string | null,
): CurrencyTotal[] {
  if (scope === "market" && marketplace && agg.byStore.length) {
    const byCur = new Map<string, CurrencyTotal>();
    for (const s of agg.byStore) {
      if (s.marketplace !== marketplace) continue;
      const cur = byCur.get(s.currency) ?? { currency: s.currency, amount: 0, count: 0 };
      cur.amount += s.amount;
      cur.count += s.orders;
      byCur.set(s.currency, cur);
    }
    return [...byCur.values()].sort((a, b) => b.amount - a.amount);
  }
  return agg.byCurrency;
}

function renderStores(
  parent: HTMLElement,
  agg: AggregatedEarnings,
  scope: EarningsScope,
  marketplace: string | null,
): void {
  const rows =
    scope === "market" && marketplace
      ? agg.byStore.filter((s) => s.marketplace === marketplace)
      : agg.byStore;
  if (rows.length === 0) return;
  const body = collapsible(parent, t().earnByStore, { open: true });
  const table = el("div", "earn-table");
  for (const s of rows) {
    const line = el("div", "earn-row");
    const left = el("div", "earn-row-main");
    left.append(el("span", "earn-store-id", s.trackingId));
    left.append(
      el(
        "span",
        `tile-chip${s.placement === "onsite" ? " good" : ""}`,
        s.placement === "onsite" ? t().earnOnsite : t().earnOffsite,
      ),
    );
    left.append(el("span", "earn-muted", s.marketplace.replace(/^amazon\./, "")));
    const right = el("div", "earn-row-figs");
    right.append(el("span", "earn-amt", formatMoney(s.amount, s.currency)));
    right.append(el("span", "earn-muted", `${t().earnUnits(s.units)} · ${t().earnOrders(s.orders)}`));
    line.append(left, right);
    table.append(line);
  }
  body.append(table);
}

function renderYears(parent: HTMLElement, agg: AggregatedEarnings): void {
  if (agg.byYear.length === 0) return;
  const body = collapsible(parent, t().earnByYear, { open: true });
  const table = el("div", "earn-table");
  for (const y of agg.byYear) {
    const line = el("div", "earn-row");
    line.append(el("span", "earn-row-main", String(y.year)));
    const right = el("div", "earn-row-figs");
    right.append(el("span", "earn-amt", formatMoney(y.amount, y.currency)));
    right.append(el("span", "earn-muted", `${t().earnUnits(y.units)} · ${t().earnOrders(y.orders)}`));
    line.append(right);
    table.append(line);
  }
  body.append(table);
}

function renderMonths(parent: HTMLElement, agg: AggregatedEarnings): void {
  if (agg.byMonth.length === 0) return;
  const months = agg.byMonth.slice(-12);
  const max = Math.max(...months.map((m) => m.amount), 0.01);
  const body = collapsible(parent, t().earnByMonth, { open: false });
  const chart = el("div", "earn-bars");
  for (const m of months) {
    const col = el("div", "earn-bar-col");
    col.append(el("span", "earn-bar-val", formatMoney(m.amount, m.currency)));
    const bar = el("span", "earn-bar");
    bar.style.height = `${Math.max(4, Math.round((m.amount / max) * 70))}px`;
    col.append(bar);
    col.append(el("span", "earn-bar-label", monthLabel(m.month)));
    chart.append(col);
  }
  body.append(chart);
}

function renderCampaigns(parent: HTMLElement, agg: AggregatedEarnings): void {
  if (agg.campaigns.length === 0) return;
  const body = collapsible(parent, t().earnCampaigns, { open: false });
  const table = el("div", "earn-table");
  for (const c of agg.campaigns) {
    const line = el("div", "earn-row");
    const left = el("div", "earn-row-main");
    left.append(el("span", "earn-camp-name", c.name));
    const meta: string[] = [];
    if (c.ratePct != null) meta.push(t().earnRate(c.ratePct));
    if (c.clicks != null) meta.push(t().earnClicks(c.clicks));
    if (c.orders != null) meta.push(t().earnOrders(c.orders));
    if (meta.length) left.append(el("span", "earn-muted", meta.join(" · ")));
    const right = el("div", "earn-row-figs");
    right.append(el("span", "earn-amt", formatMoney(c.amount, c.currency)));
    line.append(left, right);
    table.append(line);
  }
  body.append(table);
}

// "YYYY-MM" -> a short localized label ("Jul 26"), falling back to the raw
// string if it does not parse.
function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  if (!year || !mon) return month;
  try {
    return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString(undefined, {
      month: "short",
      year: "2-digit",
    });
  } catch {
    return month;
  }
}
