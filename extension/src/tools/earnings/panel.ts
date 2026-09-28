import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { sendToBackground, type EarningsLookupResult } from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";
import {
  formatConversion,
  formatMoney,
  hasBreakdown,
  rankCampaignsByConversion,
  scopedCurrencyTotals,
} from "../earnings-overlay/model";
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

  // Conversion readout: your realized orders-per-click on this product, from the
  // same ledger, one figure per campaign you ran it in. Headline the
  // best-converting campaign; when you ran several here, a muted sub-note points
  // to the full ranked list in the breakdown. This is the product-page
  // conversion reporting a competitor was still trying to work out how to show,
  // and the "which of several campaigns" problem is a non-issue for us because
  // the ledger already splits by campaign. Absent for products with no clicks.
  const ranked = rankCampaignsByConversion(earnings.campaigns ?? []);
  const best = ranked.find((c) => c.conversion !== null);
  if (best && best.conversion !== null) {
    const convRow = el("div", "counts");
    convRow.append(
      chip("good", t().earningsConversion(formatConversion(best.conversion), best.name)),
    );
    section.append(convRow);
    const withData = ranked.filter((c) => c.conversion !== null).length;
    if (withData > 1) section.append(el("p", "note", t().earningsConversionMore(withData)));
  }

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
