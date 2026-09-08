import { chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { sendToBackground } from "../../shared/messages";
import { getCache, loadFilters, membership } from "../../catalogue/cache";
import { makeCommandRunner, toProductRef } from "../hud-actions/runner";
import { resolveCampaignStatus } from "./status";
import { describeAcceptResult, lookupCampaignId, requestAccept } from "./accept";
import { showToast } from "../../ui/toast";
import type { CampaignStatusRecord, HudStatus } from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";

// Shows whether this product likely has a Creator Connections or Sponsored
// Products (SPCC) campaign, checked locally against the downloaded membership
// filter (zero server cost). A hit is a strong hint, not a guarantee (Bloom
// filters have a small false-positive rate); the app confirms on Accept.
//
// This block is appended to the bottom of the Product snapshot section (passed
// in as `section`) rather than living in its own panel section, so campaign
// status reads as part of the product's identity card.

export async function renderCampaigns(
  signals: ProductSignals,
  showEnrolled = true,
  section: HTMLElement | null = null,
  // tools.standaloneAccept with remote flags applied: whether an unpaired user
  // still gets an Accept button (our own tab drives Amazon's Accept), or only
  // the "open the app" note.
  standaloneAccept = true,
): Promise<void> {
  if (!signals.asin || !section) return;

  const cache = await getCache();
  const loaded = loadFilters(cache);
  // No filters downloaded yet: stay quiet rather than show a misleading status.
  // We cannot honestly say "not available" for a filter we never fetched.
  if (!loaded.cc && !loaded.spcc && !loaded.deals) return;

  const flags = membership(loaded, signals.asin);

  // Personal enrollment from the desktop accepted-history ledger (kept fresh by
  // the app's hourly sync). Empty for unpaired users / when the app is closed.
  // Fetched before building the chip row so an enrolled program shows the stronger
  // "Enrolled" badge instead of the generic "available" chip + Accept button. This
  // is a *different* signal from the Bloom availability flag above: availability
  // means "some creator can join", enrollment means "you already joined".
  let enrolled: CampaignStatusRecord | null = null;
  if (showEnrolled && (flags.cc || flags.spcc)) {
    try {
      const [rec] = await resolveCampaignStatus([signals.asin]);
      enrolled = rec ?? null;
    } catch {
      enrolled = null;
    }
  }
  const ccEnrolled = enrolled?.cc === true;
  const spccEnrolled = enrolled?.spcc === true;

  // The block that lands at the bottom of the Product snapshot card, headed by a
  // small "Campaigns" label so the chips read as campaign status, not identity.
  const block = el("div", "snapshot-campaigns");
  block.append(el("span", "snapshot-campaigns-head", t().campaigns));

  // Always show a status line per program whose filter is downloaded: enrolled >
  // available > not available. A program with no downloaded filter is omitted
  // rather than shown as "not available" (we can't honestly claim that).
  const row = el("div", "counts");
  if (ccEnrolled) row.append(chip("good", t().enrolledCc));
  else if (flags.cc) row.append(chip("good", t().ccAvailable));
  else if (loaded.cc) row.append(chip("muted", t().ccNotAvailable));
  if (spccEnrolled) row.append(chip("good", t().enrolledSpcc));
  else if (flags.spcc) row.append(chip("good", t().spccAvailable));
  else if (loaded.spcc) row.append(chip("muted", t().spccNotAvailable));
  if (flags.deals) row.append(chip("good", t().dealAvailable));
  block.append(row);

  // Enrolled economics: the accepted commission rate and the creator's realized
  // EPC (earnings / clicks), each shown only when the app returned it. Realized
  // EPC is null for products accepted but not yet earned on, so the pill is often
  // absent right after accepting.
  if (enrolled && (ccEnrolled || spccEnrolled)) {
    const pills = el("div", "counts");
    if (enrolled.ratePct !== null) {
      pills.append(chip("good", t().enrolledRate(enrolled.ratePct)));
    }
    if (enrolled.epc !== null) {
      // No currency travels with the record; realized EPC is overwhelmingly USD
      // (Amazon Associates US). Format as dollars; localize if that changes.
      pills.append(chip("good", t().epc(`$${enrolled.epc.toFixed(2)}`)));
    }
    if (pills.childElementCount > 0) block.append(pills);
  }

  // Accept only a program that is available but NOT already enrolled: accepting a
  // campaign you are already in is meaningless.
  const canAcceptCc = flags.cc && !ccEnrolled;
  const canAcceptSpcc = flags.spcc && !spccEnrolled;
  if (canAcceptCc || canAcceptSpcc) {
    // The standalone route needs the campaign to open, and this page only knows
    // the ASIN: resolve it through the daily cc-rates lookup (cached a day, and
    // only for products the Bloom filter already flagged, so it is cheap).
    const ccCampaignId =
      canAcceptCc && standaloneAccept ? await lookupCampaignId(signals.asin) : null;
    await renderAcceptActions(
      block,
      signals,
      { cc: canAcceptCc, spcc: canAcceptSpcc },
      { standaloneAccept, ccCampaignId },
    );
  }

  if (flags.deals) {
    // The deal hand-off is the "Push to Deals Butler" button in the
    // Send-to-app section below.
    block.append(el("p", "note", t().dealPushNote));
  }

  section.append(block);
}

// Inline Accept buttons, right next to the availability chips, so accepting
// never requires hunting through the Send-to-app section. The desktop app is
// the preferred route when it is paired (it confirms and accepts). Without it,
// a Creator Connections campaign whose id we know can still be accepted by our
// standalone path (Amazon's own Accept button, driven in a background tab);
// SPCC has no standalone path yet, so it keeps the short pointer note (the full
// trial upsell already lives in Send-to-app).
async function renderAcceptActions(
  section: HTMLElement,
  signals: ProductSignals,
  flags: { cc: boolean; spcc: boolean },
  opts: { standaloneAccept: boolean; ccCampaignId: string | null },
): Promise<void> {
  let hud: HudStatus;
  try {
    hud = await sendToBackground<HudStatus>({ kind: "GET_HUD_STATUS" });
  } catch {
    hud = { connected: false };
  }

  if (!hud.connected || hud.paired === false) {
    if (flags.cc && opts.standaloneAccept && opts.ccCampaignId) {
      renderStandaloneAccept(section, signals, opts.ccCampaignId, flags.spcc);
      return;
    }
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

// The unpaired "Accept CC campaign" button: requestAccept re-checks the bridge
// (it wins if the app got paired meanwhile) and otherwise asks the background
// to drive Amazon's Accept in a tab. The button disappears on success; a
// failure is named in the status line and raised as a toast, like the bridge
// runner does.
function renderStandaloneAccept(
  section: HTMLElement,
  signals: ProductSignals,
  campaignId: string,
  spccAlsoAvailable: boolean,
): void {
  const body = el("div", "row");
  const status = el("p", "progress");
  const btn = el("button", "btn secondary");
  btn.textContent = t().acceptCc;
  btn.addEventListener("click", () => {
    void (async () => {
      btn.disabled = true;
      status.textContent = t().acceptWorking;
      const result = await requestAccept({
        asin: signals.asin,
        marketplace: signals.marketplace,
        kind: "cc",
        campaignId,
        brand: signals.brand ?? null,
      });
      const line = describeAcceptResult(result);
      status.textContent = line;
      if (result.ok) {
        btn.remove();
      } else {
        btn.disabled = false;
        showToast({ title: t().actionFailedTitle, message: line, closeLabel: t().nudgeCloseLabel });
      }
    })();
  });
  body.append(btn);
  section.append(body, status);
  // SPCC still needs the app; say so under the button rather than hiding it.
  if (spccAlsoAvailable) section.append(el("p", "note", t().campaignConnectNote));
}
