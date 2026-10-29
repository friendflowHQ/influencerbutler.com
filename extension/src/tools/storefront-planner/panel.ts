import { addSection, copyButton, el } from "../../ui/components";
import { t } from "../../i18n";
import { harvestStorefront } from "../storefront-check/harvest";
import { downloadCsv } from "../storefront-check/csv";
import { getCache, loadFilters, membership } from "../../catalogue/cache";
import {
  sendToBackground,
  type CcRate,
  type CcRatesResult,
  type SpccRate,
  type SpccRatesResult,
} from "../../shared/messages";
import { getFlags } from "../../flags/cache";
import { activeDealEvent, retailerOfMarketplace } from "../../deals/events";
import { marketplaceFromUrl } from "../../amazon/product-signals";
import { formatMoney } from "../earnings-overlay/model";
import { campaignEnd, formatEndDay } from "../idea-list/campaign-detail";
import { currencyForMarketplace } from "../storefront-money/model";
import { buildPlan, plannerCsv, type PlannerRow } from "./model";

// Campaign and Deal Planner (the storefront twin of Oink's seasonal planner):
// one scan of the creator's storefront, then every product they already feature
// that sits in a Creator Connections / SPCC campaign or on a deal, best first,
// with a CSV for planning a seasonal storefront (Black Friday, Prime Day).
// Tier 0 membership comes from the local catalogue; real rates come from the
// daily rate tables, batched.

const LIST_CAP = 40;
const LOOKUP_BATCH = 100;

let runPlan: (() => void) | null = null;

// Called by the storefront toolbar: open the scan from outside the HUD.
export function startStorefrontPlan(): void {
  runPlan?.();
}

export function initStorefrontPlanner(): void {
  const section = addSection(t().sfPlannerTitle);
  section.append(el("p", "note", t().sfPlannerNote));
  const button = el("button", "btn") as HTMLButtonElement;
  button.type = "button";
  button.textContent = t().sfPlannerRun;
  const status = el("p", "note", "");
  status.setAttribute("role", "status");
  const results = el("div", "");
  section.append(button, status, results);

  let busy = false;
  const run = (): void => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    status.textContent = t().sfPlannerScanning;
    results.replaceChildren();
    void plan(status, results)
      .catch(() => {
        status.textContent = t().sfPlannerNone;
      })
      .finally(() => {
        busy = false;
        button.disabled = false;
      });
  };
  button.addEventListener("click", run);
  runPlan = run;
}

async function lookup<T>(
  asins: string[],
  kind: "LOOKUP_CC_RATES" | "LOOKUP_SPCC_RATES",
): Promise<Record<string, T>> {
  const out: Record<string, T> = {};
  for (let i = 0; i < asins.length; i += LOOKUP_BATCH) {
    const res = await sendToBackground<CcRatesResult | SpccRatesResult>({
      kind,
      asins: asins.slice(i, i + LOOKUP_BATCH),
    }).catch(() => null);
    if (res?.ok) Object.assign(out, res.rates as Record<string, T>);
  }
  return out;
}

async function plan(status: HTMLElement, results: HTMLElement): Promise<void> {
  const marketplace = marketplaceFromUrl(location.href);
  const currency = currencyForMarketplace(marketplace);
  const loaded = loadFilters(await getCache());
  const harvest = await harvestStorefront((pages, items) => {
    status.textContent = `${t().sfPlannerScanning} ${items}`;
    void pages;
  });
  const videoAsins = harvest.items.filter((i) => i.type === "video").map((i) => i.taggedAsins);

  const ccFlagged = new Set<string>();
  const spccFlagged = new Set<string>();
  const dealFlagged = new Set<string>();
  for (const asins of videoAsins) {
    for (const raw of asins) {
      const asin = raw.toUpperCase();
      const flags = membership(loaded, asin);
      if (flags.cc) ccFlagged.add(asin);
      if (flags.spcc) spccFlagged.add(asin);
      if (flags.deals) dealFlagged.add(asin);
    }
  }
  const ccRates = await lookup<CcRate>([...ccFlagged], "LOOKUP_CC_RATES");
  const spccRates = await lookup<SpccRate>([...spccFlagged], "LOOKUP_SPCC_RATES");
  // Bloom filters have ~1% false positives and campaigns end: when the table is
  // serving data and has no row, drop the flag (same rule as the card chips).
  if (Object.keys(ccRates).length > 0) for (const a of [...ccFlagged]) if (!ccRates[a]) ccFlagged.delete(a);
  if (Object.keys(spccRates).length > 0) for (const a of [...spccFlagged]) if (!spccRates[a]) spccFlagged.delete(a);

  const { rows, scanned } = buildPlan({
    videoAsins,
    ccFlagged,
    spccFlagged,
    dealFlagged,
    ccRates,
    spccRates,
  });

  const remote = await getFlags().catch(() => null);
  const event = activeDealEvent(remote?.events, retailerOfMarketplace(marketplace));

  results.replaceChildren();
  if (rows.length === 0) {
    status.textContent = t().sfPlannerNone;
    return;
  }
  status.textContent = [
    t().sfPlannerSummary(rows.length, scanned),
    event ? t().sfPlannerEvent(event.id) : "",
  ]
    .filter(Boolean)
    .join(". ");

  const list = el("ol", "");
  for (const row of rows.slice(0, LIST_CAP)) list.append(rowItem(row, marketplace, currency));
  const actions = el("div", "");
  const csvButton = el("button", "btn secondary small") as HTMLButtonElement;
  csvButton.type = "button";
  csvButton.textContent = t().sfPlannerCsv;
  csvButton.addEventListener("click", () => {
    downloadCsv("storefront-campaign-plan.csv", plannerCsv(rows, marketplace));
  });
  actions.append(csvButton, copyButton(rows.map((r) => r.asin).join("\n")));
  results.append(list, actions);
}

function rowItem(row: PlannerRow, marketplace: string, currency: string): HTMLElement {
  const now = new Date();
  const parts: string[] = [];
  if (row.cc) {
    const end = campaignEnd(row.cc.endsAt, now);
    parts.push(
      end
        ? t().tileCampaignRateEnds(row.cc.ratePct, formatEndDay(end.day, now))
        : t().tileCampaignRate(row.cc.ratePct),
    );
  }
  if (row.spcc) parts.push(t().tileSpccClicks(formatMoney(row.spcc.epc, currency)));
  if (row.deal) parts.push(t().tileDeal);
  parts.push(t().sfPlannerVideos(row.videos));

  const item = el("li", "");
  const link = el("a", "", row.asin) as HTMLAnchorElement;
  link.href = `https://${marketplace}/dp/${row.asin}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  item.append(link, document.createTextNode(`: ${parts.join(", ")}`));
  return item;
}
