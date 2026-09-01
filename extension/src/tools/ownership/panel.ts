import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import type { ProductSignals } from "../../amazon/product-signals";
import type { OwnershipRecord } from "../../shared/messages";
import { formatMoney } from "../earnings-overlay/model";
import { prettyPlatform } from "./format";
import { resolveOwnership } from "./resolve";

// A live "you already own this / you already posted this" badge on the product
// page, read from the desktop Orders Butler (order history) + content-coverage
// (Storefront / Daily Deals / YouTube) over the local bridge. Nothing any
// competitor shows. Self-gating: the lookup returns instantly for anyone who has
// not paired the app, and the section is only revealed when the creator actually
// owns or already posted this product, so it never renders an empty box.
export function renderOwnership(signals: ProductSignals): void {
  if (!signals.asin) return;
  // Reserve the slot synchronously but keep it hidden until the async lookup
  // confirms there is something to show (no empty-box flicker, no reflow).
  const section = addSection(t().ownedTitle);
  section.style.display = "none";
  void fill(section, signals);
}

async function fill(section: HTMLElement, signals: ProductSignals): Promise<void> {
  const asin = signals.asin;
  if (!asin) {
    section.remove();
    return;
  }
  const asins = [asin, ...(signals.variationAsins ?? [])];
  let records: OwnershipRecord[];
  try {
    records = await resolveOwnership(asins);
  } catch {
    section.remove();
    return;
  }
  const want = asin.toUpperCase();
  // Prefer the exact ASIN; otherwise any owned/posted variation of it.
  const rec =
    records.find((r) => r.asin.toUpperCase() === want) ??
    records.find((r) => r.owned || r.posted.available);
  if (!rec || (!rec.owned && !rec.posted.available)) {
    section.remove();
    return;
  }

  // Owned: the "you own this" chip plus, when the desktop sent it, the year and
  // price paid (an older snapshot row may carry neither).
  if (rec.owned) {
    section.append(chipRow(chip("good", t().ownedGridOwned)));
    const bits: string[] = [];
    if (rec.order?.year) bits.push(t().ownedBought(rec.order.year));
    if (rec.order?.paidPrice) {
      bits.push(t().ownedPaid(formatMoney(rec.order.paidPrice, rec.order.currency || "USD")));
    }
    section.append(el("p", "note", bits.length ? bits.join(" · ") : t().ownedNote));
  }

  // Already posted: the "already posted" chip plus where it was shared.
  if (rec.posted.available) {
    section.append(chipRow(chip("warn", t().ownedPostedChip)));
    const platforms = rec.posted.platforms.map(prettyPlatform).filter(Boolean).join(", ");
    if (platforms) section.append(el("p", "note", t().ownedPostedSummary(platforms)));
  }

  section.style.display = "";
}

function chipRow(...children: HTMLElement[]): HTMLElement {
  const row = el("div", "counts");
  row.append(...children);
  return row;
}
