import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { sendToBackground, type EarningsLookupResult } from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";

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
  void fill(section, signals.asin);
}

async function fill(section: HTMLElement, asin: string): Promise<void> {
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

  const amounts = el("div", "counts");
  for (const c of earnings.byCurrency) {
    if (c.amount <= 0 && c.count <= 0) continue;
    amounts.append(chip("good", t().earningsAmount(formatMoney(c.amount, c.currency), c.count)));
  }
  if (amounts.childElementCount === 0) {
    section.remove();
    return;
  }
  section.append(amounts);
  section.append(el("p", "note", t().earningsNote));
  section.style.display = "";
}

// Amounts arrive in whole currency units (not cents). Keep it simple: a symbol
// for the common creator currencies, ISO code otherwise, always two decimals.
function formatMoney(amount: number, currency: string): string {
  const symbol =
    currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency === "USD" || currency === "CAD" || currency === "AUD" ? "$" : "";
  const value = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${value}` : `${value} ${currency}`;
}
