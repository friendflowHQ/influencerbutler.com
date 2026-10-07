import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { askBackground, sendToBackground } from "../../shared/messages";
import {
  canLookUp,
  formatCents,
  normalizeResult,
  otherRetailer,
  priceDelta,
  retailerLabel,
  type CrossMatch,
  type CrossResult,
  type CrossSource,
} from "./model";

// The "Also on Walmart / Also on Target" card of the product panel. Shown on a
// Target or Walmart product page; asks the worker whether the same product (by
// UPC) is sold by the other retailer and, when it is, links to it. The card is
// added immediately with a "Checking..." line so the panel does not jump when
// the answer lands, and a lookup that cannot complete says so plainly instead of
// claiming the product is not sold there.

// A lookup can involve two network round trips from the worker, so give it more
// room than the default background timeout.
const LOOKUP_TIMEOUT_MS = 20_000;

function openButton(label: string, url: string): HTMLButtonElement {
  const btn = el("button", "btn small") as HTMLButtonElement;
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", () => void sendToBackground<void>({ kind: "OPEN_URL", url }));
  return btn;
}

function priceLine(src: CrossSource, match: CrossMatch): HTMLElement | null {
  const delta = priceDelta(src.priceCents, match.priceCents);
  if (!delta) return null;
  const store = retailerLabel(match.retailer);
  const text =
    delta.direction === "same"
      ? t().crossSamePrice
      : delta.direction === "cheaper"
        ? t().crossCheaper(formatCents(delta.cents), store)
        : t().crossPricier(formatCents(delta.cents), store);
  return el("p", "note", text);
}

function paint(body: HTMLElement, src: CrossSource, result: CrossResult): void {
  body.replaceChildren();
  const store = retailerLabel(otherRetailer(src.retailer));

  if (result.status === "found") {
    const { match } = result;
    const chips = el("div", "wm-row");
    if (match.priceCents != null) chips.append(chip("price", formatCents(match.priceCents)));
    if (match.inStock === true) chips.append(chip("good", t().crossInStock));
    if (match.inStock === false) chips.append(chip("warn", t().crossOutOfStock));
    if (match.matchType === "similar") chips.append(chip("warn", t().crossPossible));
    body.append(chips);
    if (match.title) body.append(el("p", "note", match.title));
    const delta = priceLine(src, match);
    if (delta) body.append(delta);
    body.append(openButton(t().crossOpen(store), match.url));
    return;
  }

  if (result.status === "none") {
    body.append(el("p", "note", t().crossNotFound(store)));
    return;
  }

  // Unchecked: say so, and still give the user a one-click way to look.
  body.append(el("p", "note", t().crossUnchecked(store)));
  if (result.searchUrl) body.append(openButton(t().crossSearch(store), result.searchUrl));
}

// Adds the card and fills it asynchronously. A page with nothing to match on (no
// barcode and no usable title) adds nothing at all.
export function renderCrossRetailer(src: CrossSource): void {
  if (!canLookUp(src)) return;
  const section = addSection(t().crossTitle(retailerLabel(otherRetailer(src.retailer))));
  const body = el("div", "cross-body");
  body.setAttribute("aria-live", "polite");
  body.append(el("p", "note", t().crossChecking));
  section.append(body);

  void askBackground<unknown>({ kind: "LOOKUP_CROSS_RETAILER", source: src }, LOOKUP_TIMEOUT_MS).then(
    (raw) => paint(body, src, normalizeResult(raw, src)),
  );
}
