import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { getCache, loadFilters } from "../../catalogue/cache";
import { harvestStorefront } from "../storefront-check/harvest";
import { matchCampaigns, type CampaignInput, type CampaignMatch } from "./match";
import { sendToBackground } from "../../shared/messages";
import { APP_TRIAL_URL } from "../../shared/constants";
import { log } from "../../shared/log";
import type {
  AuthStatus,
  HudCommandResult,
  HudStatus,
  OrderAsinsResult,
} from "../../shared/messages";
import type { ProductRef } from "../../transport/hud-commands";

// Campaign matcher: the discovery half of campaign acceptance. Fluencer Fruit's
// "Creator Connections matching" surfaces which of your products have an open
// campaign; we cross-check your owned/tagged ASINs against the locally-cached
// CC/SPCC filters and list what you qualify for, with a one-click "send all to
// the app to accept". Works whether or not the desktop app is running (the app
// only powers the batch-accept; the list itself is free and local).
//
// Two sources: on a storefront, the products tagged across your content; on the
// order-history page, your synced ordered products. The storefront getItems
// feed only exposes tagged ASINs for videos, so the intro says "tagged in your
// videos" rather than promising every photo/list product.

export type MatchSource = "storefront" | "orders";

const LIST_CAP = 200;

export function initCampaignMatcher(source: MatchSource): void {
  const section = addSection(t().campaignMatcher, t().campaignMatcherIntro(source));

  const button = el("button", "btn");
  button.textContent = t().campaignMatcherScan;
  const progress = el("p", "progress");
  const list = el("div", "issues");
  const actions = el("div", "row");
  section.append(button, progress, list, actions);

  button.addEventListener("click", () => {
    button.disabled = true;
    list.replaceChildren();
    actions.replaceChildren();
    progress.textContent = t().campaignMatcherScanning;
    void run()
      .catch((error) => {
        log("campaign-matcher", "scan failed", error);
        progress.textContent = t().campaignMatcherFailed;
      })
      .finally(() => {
        button.disabled = false;
        button.textContent = t().campaignMatcherRescan;
      });
  });

  async function run(): Promise<void> {
    const marketplace = location.host.replace(/^www\./, "");
    const items = await gatherAsins((text) => (progress.textContent = text));
    if (items.length === 0) {
      progress.textContent = t().campaignMatcherNoProducts;
      return;
    }
    const loaded = loadFilters(await getCache());
    if (!loaded.cc && !loaded.spcc) {
      progress.textContent = t().campaignMatcherNoCatalogue;
      return;
    }
    const matches = matchCampaigns(items, loaded);
    renderMatches(matches, marketplace);
    progress.textContent = t().campaignMatcherDone(matches.length, items.length);
  }

  async function gatherAsins(setStatus: (text: string) => void): Promise<CampaignInput[]> {
    if (source === "storefront") {
      const result = await harvestStorefront((_pages, count) =>
        setStatus(t().campaignMatcherHarvesting(count)),
      );
      const seen = new Set<string>();
      const items: CampaignInput[] = [];
      for (const content of result.items) {
        for (const asin of content.taggedAsins) {
          if (seen.has(asin)) continue;
          seen.add(asin);
          items.push({ asin, title: content.title || null });
        }
      }
      return items;
    }
    // orders: the account's synced order history (requires sign-in).
    const res = await sendToBackground<OrderAsinsResult>({ kind: "GET_ORDER_ASINS" });
    if (!res.ok) {
      if (res.error === "not_signed_in") {
        setStatus(t().campaignMatcherSignIn);
      }
      return [];
    }
    return res.items.map((row) => ({ asin: row.asin, title: row.title }));
  }

  function renderMatches(matches: CampaignMatch[], marketplace: string): void {
    if (matches.length === 0) {
      list.append(el("p", "note", t().campaignMatcherNone));
      return;
    }
    const ul = el("ul", "list");
    for (const match of matches.slice(0, LIST_CAP)) {
      const li = el("li");
      li.append(el("span", "t", match.title ?? match.asin));
      const chips = el("div", "counts");
      chips.append(chip("good", match.kind === "cc" ? t().ccAvailable : t().spccAvailable));
      li.append(chips);
      const open = el("a", "", t().sfOpen);
      (open as HTMLAnchorElement).href = `https://www.${marketplace}/dp/${match.asin}`;
      (open as HTMLAnchorElement).target = "_blank";
      li.append(open);
      ul.append(li);
    }
    list.append(ul);
    if (matches.length > LIST_CAP) list.append(el("p", "note", t().sfAndMore(matches.length - LIST_CAP)));
    list.append(el("p", "note", t().campaignMatcherAcceptedNote));

    void renderAcceptAction(matches, marketplace);
  }

  async function renderAcceptAction(matches: CampaignMatch[], marketplace: string): Promise<void> {
    const items = matches.map((match) => ({
      kind: match.kind,
      product: { asin: match.asin, marketplace } as ProductRef,
    }));

    const hud = await sendToBackground<HudStatus>({ kind: "GET_HUD_STATUS" });
    const status = el("p", "note");

    if (hud.connected) {
      const accept = el("button", "btn");
      accept.textContent = t().campaignMatcherAcceptAll(items.length);
      accept.addEventListener("click", () => {
        accept.disabled = true;
        status.textContent = t().sfAcceptingCampaigns;
        void sendToBackground<HudCommandResult>({
          kind: "SEND_HUD_COMMAND",
          command: { type: "campaign.accept.batch", items },
        }).then((result) => {
          accept.disabled = false;
          status.textContent = result.message ?? (result.ok ? t().sentToApp : t().couldNotReachApp);
        });
      });
      actions.append(accept, status);
      return;
    }

    // App not running: the list stays useful; offer the app as the way to
    // accept in bulk (same funnel as the Send-to-app section).
    const auth = await sendToBackground<AuthStatus>({ kind: "GET_AUTH_STATUS" });
    const cta = el("a", "btn");
    cta.textContent = auth.signedIn ? t().ctaOpenApp : t().ctaStartTrial;
    (cta as HTMLAnchorElement).href = APP_TRIAL_URL;
    (cta as HTMLAnchorElement).target = "_blank";
    (cta as HTMLAnchorElement).rel = "noopener";
    cta.style.textDecoration = "none";
    cta.addEventListener("click", (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      void sendToBackground<void>({ kind: "OPEN_URL", url: APP_TRIAL_URL });
    });
    actions.append(el("p", "note", t().campaignMatcherUpsell), cta);
  }
}
