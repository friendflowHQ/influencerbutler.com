import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { getCache, loadFilters, membership } from "../../catalogue/cache";
import type { ProductSignals } from "../../amazon/product-signals";

// Shows whether this product likely has a Creator Connections or Sponsored
// Products (SPCC) campaign, checked locally against the downloaded membership
// filter (zero server cost). A hit is a strong hint, not a guarantee (Bloom
// filters have a small false-positive rate); the app confirms on Accept.

export async function renderCampaigns(signals: ProductSignals): Promise<void> {
  if (!signals.asin) return;
  const cache = await getCache();
  const loaded = loadFilters(cache);
  // No filters downloaded yet: stay quiet rather than show a misleading "none".
  if (!loaded.cc && !loaded.spcc && !loaded.deals) return;

  const flags = membership(loaded, signals.asin);
  const section = addSection(t().campaigns);

  if (!flags.cc && !flags.spcc && !flags.deals) {
    section.append(el("p", "note", t().noCampaign));
    return;
  }

  const row = el("div", "counts");
  if (flags.cc) row.append(chip("good", t().ccAvailable));
  if (flags.spcc) row.append(chip("good", t().spccAvailable));
  if (flags.deals) row.append(chip("good", t().dealAvailable));
  section.append(row);

  // The accept note is only meaningful for CC/SPCC; the deal hand-off is the
  // "Push to Daily Deals" button in the Send-to-app section below.
  const note = el("p", "note");
  note.textContent = flags.cc || flags.spcc ? t().campaignAcceptNote : t().dealPushNote;
  section.append(note);
}
