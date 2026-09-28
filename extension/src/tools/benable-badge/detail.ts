import { chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { formatMoney, formatConversion, blendedConversion } from "../earnings-overlay/model";
import { resolveCampaignStatus } from "../campaigns/status";
import { resolveOwnership } from "../ownership/resolve";
import { marketplaceFromUrl } from "../../amazon/product-signals";
import {
  sendToBackground,
  type CcRate,
  type SpccRate,
  type EarningsLookupResult,
  type MarketResult,
} from "../../shared/messages";

// The expanded panel under a Benable card's chip. Shows the campaign economics
// already in hand (CC rate / SPCC forecast), then fills in the richer per-ASIN
// signals as they resolve: personal enrollment + realized EPC and earnings /
// conversion (desktop bridge, paired only), ownership / already-posted (bridge,
// with an owned-only server fallback), and catalogue price / demand (signed-in
// license key). Every row self-gates, so an unpaired, signed-out viewer still
// sees the commission headline and nothing misleading.

export async function renderBenableDetail(
  container: HTMLElement,
  asin: string,
  cc: CcRate | null,
  spcc: SpccRate | null,
): Promise<void> {
  container.replaceChildren();

  const head = el("div", "benable-detail-head");
  head.append(el("span", "benable-detail-title", t().benableDetailHeading));
  const link = el("a", "benable-open") as HTMLAnchorElement;
  link.href = `https://www.amazon.com/dp/${asin}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = t().benableOpenAmazon;
  link.addEventListener("click", (event) => event.stopPropagation());
  head.append(link);
  container.append(head);

  // Campaign economics from the compact lookups already run for the chip.
  const camp = el("div", "counts");
  if (cc) {
    camp.append(chip("good", t().enrolledRate(cc.ratePct)));
    if (cc.endsAt) camp.append(chip("muted", t().benableEnds(formatDate(cc.endsAt))));
  } else if (spcc) {
    camp.append(chip("good", t().tileCampaignEpc(formatMoney(spcc.epc, "USD"))));
  } else {
    camp.append(chip("muted", t().benableNoCampaign));
  }
  container.append(camp);

  const loading = el("p", "progress", t().benableChecking);
  container.append(loading);

  const marketplace = marketplaceFromUrl(`https://www.amazon.com/dp/${asin}`);
  const [statuses, ownerships, earningsRes, marketRes] = await Promise.all([
    resolveCampaignStatus([asin]).catch(() => []),
    resolveOwnership([asin]).catch(() => []),
    sendToBackground<EarningsLookupResult>({ kind: "LOOKUP_EARNINGS", asins: [asin] }).catch(
      () => ({ ok: false, results: [] }) as EarningsLookupResult,
    ),
    sendToBackground<MarketResult>({ kind: "GET_MARKET", asin, marketplace }).catch(
      () => ({ ok: false, product: null }) as MarketResult,
    ),
  ]);
  loading.remove();

  const rows = el("div", "benable-rows");

  // Personal enrollment + accepted rate + realized EPC (desktop ledger).
  const status = statuses[0];
  if (status && (status.cc || status.spcc)) {
    const row = el("div", "counts");
    if (status.cc) row.append(chip("good", t().enrolledCc));
    if (status.spcc) row.append(chip("good", t().enrolledSpcc));
    if (status.ratePct !== null) row.append(chip("good", t().enrolledRate(status.ratePct)));
    if (status.epc !== null) row.append(chip("good", t().epc(`$${status.epc.toFixed(2)}`)));
    rows.append(row);
  }

  // Realized earnings + blended conversion across this product's campaigns.
  const earn = earningsRes.results?.[0];
  if (earn && earn.hasEarnings) {
    const row = el("div", "counts");
    const totals = earn.byCurrency.filter((c) => c.amount > 0);
    if (totals.length) {
      row.append(chip("good", t().benableEarned(totals.map((c) => formatMoney(c.amount, c.currency)).join(" · "))));
    }
    const conversion = blendedConversion(earn.campaigns ?? []);
    if (conversion !== null) row.append(chip("good", t().benableConversion(formatConversion(conversion))));
    if (row.childElementCount > 0) rows.append(row);
  }

  // Already own / already posted.
  const owner = ownerships[0];
  if (owner && (owner.owned || owner.posted?.available)) {
    const row = el("div", "counts");
    if (owner.owned) row.append(chip("warn", t().ownedTitle));
    if (owner.posted?.available) row.append(chip("warn", t().benablePosted));
    rows.append(row);
  }

  // Catalogue price + estimated monthly demand.
  const product = marketRes.product;
  if (product) {
    const row = el("div", "counts");
    if (product.priceCents !== null) {
      row.append(chip("price", t().benablePrice(formatMoney(product.priceCents / 100, product.currency || "USD"))));
    }
    if (product.estMonthlySales !== null) {
      row.append(chip("revenue", t().benableEstSales(product.estMonthlySales.toLocaleString())));
    }
    if (row.childElementCount > 0) rows.append(row);
  }

  if (rows.childElementCount === 0) {
    container.append(el("p", "note", t().benableNoExtra));
  } else {
    container.append(rows);
  }
}

// A campaign end date as a short local date, falling back to the raw string.
function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
