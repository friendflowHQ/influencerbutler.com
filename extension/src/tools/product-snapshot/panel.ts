import { addSection, chip, copyButton, el } from "../../ui/components";
import { t } from "../../i18n";
import { getRateCard, rateForCategory } from "../../rate-card/cache";
import type { ProductSignals } from "../../amazon/product-signals";

// The identity card at the top of the product panel: the ASINs a creator needs
// to copy, the category and bestseller rank at a glance, and the commission
// rate (or an honest "not set"). Mirrors the competitor's product card, in our
// branding.
export function renderProductSnapshot(signals: ProductSignals): void {
  if (!signals.asin) return;
  const section = addSection(t().snapshotTitle);

  const ids = el("div", "idrows");
  ids.append(idRow(t().snapshotProduct, signals.asin));
  if (signals.parentAsin && signals.parentAsin !== signals.asin) {
    ids.append(idRow(t().snapshotParent, signals.parentAsin));
  }
  section.append(ids);

  const meta = el("div", "counts");
  if (signals.category) meta.append(chip("", t().snapshotCategory(signals.category)));
  if (signals.bestsellerRank) {
    meta.append(
      chip("good", t().snapshotRank(signals.bestsellerRank.rank, signals.bestsellerRank.category)),
    );
  }
  if (meta.childElementCount > 0) section.append(meta);

  const commission = el("p", "note");
  section.append(commission);
  void fillCommission(commission, signals);
}

function idRow(label: string, value: string): HTMLElement {
  const row = el("div", "idrow");
  row.append(el("span", "idrow-label", label));
  row.append(el("span", "idrow-value", value));
  row.append(copyButton(value));
  return row;
}

// SiteStripe live rate first, then the Associates rate card by category, then
// an explicit "not set" so it never looks like a silent zero.
async function fillCommission(target: HTMLElement, signals: ProductSignals): Promise<void> {
  if (signals.commissionRatePct !== null) {
    target.textContent = t().snapshotCommissionLive(signals.commissionRatePct);
    return;
  }
  const card = await getRateCard();
  if (card) {
    const match = rateForCategory(card, signals.category);
    if (match) {
      target.textContent = match.isDefault
        ? t().snapshotCommissionDefault(match.ratePct)
        : t().snapshotCommissionCategory(match.ratePct, match.label);
      return;
    }
  }
  target.textContent = t().snapshotCommissionNotSet;
}
