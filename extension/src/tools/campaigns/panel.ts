import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { sendToBackground } from "../../shared/messages";
import { getCache, loadFilters, membership } from "../../catalogue/cache";
import { makeCommandRunner, toProductRef } from "../hud-actions/runner";
import type { HudStatus } from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";

// Shows whether this product likely has a Creator Connections or Sponsored
// Products (SPCC) campaign, checked locally against the downloaded membership
// filter (zero server cost). A hit is a strong hint, not a guarantee (Bloom
// filters have a small false-positive rate); the app confirms on Accept.

export async function renderCampaigns(signals: ProductSignals): Promise<void> {
  if (!signals.asin) return;
  // Claim the section slot before any await so this section always lands above
  // "Send to your butler app" (whose panel adds its section synchronously);
  // notes elsewhere say "the section below" and rely on this order.
  const section = addSection(t().campaigns);

  const cache = await getCache();
  const loaded = loadFilters(cache);
  // No filters downloaded yet: stay quiet rather than show a misleading "none".
  if (!loaded.cc && !loaded.spcc && !loaded.deals) {
    section.remove();
    return;
  }

  const flags = membership(loaded, signals.asin);

  if (!flags.cc && !flags.spcc && !flags.deals) {
    section.append(el("p", "note", t().noCampaign));
    return;
  }

  const row = el("div", "counts");
  if (flags.cc) row.append(chip("good", t().ccAvailable));
  if (flags.spcc) row.append(chip("good", t().spccAvailable));
  if (flags.deals) row.append(chip("good", t().dealAvailable));
  section.append(row);

  if (flags.cc || flags.spcc) {
    await renderAcceptActions(section, signals, flags);
  }

  if (flags.deals) {
    // The deal hand-off is the "Push to Deals Influencer Butler" button in the
    // Send-to-app section below.
    section.append(el("p", "note", t().dealPushNote));
  }
}

// Inline Accept buttons, right next to the availability chips, so accepting
// never requires hunting through the Send-to-app section. When the desktop app
// is not connected there is nothing to accept with, so a short pointer note
// renders instead (the full trial upsell already lives in Send-to-app).
async function renderAcceptActions(
  section: HTMLElement,
  signals: ProductSignals,
  flags: { cc: boolean; spcc: boolean },
): Promise<void> {
  let hud: HudStatus;
  try {
    hud = await sendToBackground<HudStatus>({ kind: "GET_HUD_STATUS" });
  } catch {
    hud = { connected: false };
  }

  if (!hud.connected) {
    section.append(el("p", "note", t().campaignConnectNote));
    return;
  }

  const body = el("div", "row");
  const status = el("p", "progress");
  const run = makeCommandRunner(body, status);
  const product = toProductRef(signals);

  if (flags.cc) {
    const ccBtn = el("button", "btn secondary");
    ccBtn.textContent = t().acceptCc;
    ccBtn.addEventListener("click", () =>
      run({ type: "campaign.accept", kind: "cc", product }, t().checkingCc),
    );
    body.append(ccBtn);
  }
  if (flags.spcc) {
    const spccBtn = el("button", "btn secondary");
    spccBtn.textContent = t().acceptSpcc;
    spccBtn.addEventListener("click", () =>
      run({ type: "campaign.accept", kind: "spcc", product }, t().checkingSpcc),
    );
    body.append(spccBtn);
  }
  section.append(body, status);
}
