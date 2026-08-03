import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { sendToBackground, type EarningsLookupResult } from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";
import { formatMoney, hasBreakdown, scopedCurrencyTotals } from "../earnings-overlay/model";
import { renderEarningsDetail } from "../earnings-overlay/detail";

// Your real earnings on this exact product, pulled from the desktop app's Daily
// Commission Butler ledger over the local bridge. Nothing any competitor shows:
// "you have already earned $X here". Self-gating: the lookup returns instantly
// for anyone who has not paired the app, and the section is only revealed when
// there are real earnings to show, so it never renders an empty or zero box.
export function renderProductEarnings(signals: ProductSignals): void {
  if (!signals.asin) return;
  // Reserve the slot synchronously (right under the snapshot) but keep it hidden
  // until the async lookup confirms there is something to show, so there is no
  // empty-box flicker and no reflow of the sections below.
  const section = addSection(t().earningsTitle);
  section.style.display = "none";
  void fill(section, signals);
}

async function fill(section: HTMLElement, signals: ProductSignals): Promise<void> {
  const asin = signals.asin;
  if (!asin) {
    section.remove();
    return;
  }
  let res: EarningsLookupResult;
  try {
    res = await sendToBackground<EarningsLookupResult>({ kind: "LOOKUP_EARNINGS", asins: [asin] });
  } catch {
    section.remove();
    return;
  }
  const want = asin.toUpperCase();
  const earnings = res.results?.find((r) => r.asin.toUpperCase() === want);
  if (!res.ok || !earnings || !earnings.hasEarnings || earnings.byCurrency.length === 0) {
    section.remove();
    return;
  }

  // Scope the headline to the marketplace the creator is viewing when this ASIN
  // has store rows there, so a foreign product page shows what it earned in that
  // market rather than the ASIN's worldwide total (the cross-marketplace
  // confusion Cha-Ching's ASIN-only rollup causes). When the viewed market has no
  // store rows, fall back to the worldwide total instead of headlining $0.
  const marketHasStores =
    Boolean(signals.marketplace) &&
    (earnings.byStore?.some((s) => s.marketplace === signals.marketplace) ?? false);
  const totals = marketHasStores
    ? scopedCurrencyTotals(earnings, "market", signals.marketplace)
    : earnings.byCurrency;

  const amounts = el("div", "counts");
  for (const c of totals) {
    if (c.amount <= 0 && c.count <= 0) continue;
    amounts.append(chip("good", t().earningsAmount(formatMoney(c.amount, c.currency), c.count)));
  }
  if (amounts.childElementCount === 0) {
    section.remove();
    return;
  }
  section.append(amounts);
  section.append(el("p", "note", t().earningsNote));

  // When the desktop build sends the rich buckets, offer the full by-store /
  // year / month / campaign breakdown (the same popup the storefront badges
  // open). Older builds send only the flat total, so the button is hidden.
  if (hasBreakdown(earnings)) {
    const view = el("button", "earn-link", t().earnViewBreakdown) as HTMLButtonElement;
    view.type = "button";
    view.addEventListener("click", () => {
      renderEarningsDetail({
        title: signals.title,
        earnings: [earnings],
        marketplace: signals.marketplace,
      });
    });
    section.append(view);
  }

  section.style.display = "";
}
