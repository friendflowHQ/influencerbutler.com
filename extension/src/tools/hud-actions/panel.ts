import { addSection, el } from "../../ui/components";
import { t } from "../../i18n";
import { sendToBackground } from "../../shared/messages";
import { APP_TRIAL_URL, DEAL_WORKSPACES } from "../../shared/constants";
import type { AuthStatus, HudCommandResult, HudStatus } from "../../shared/messages";
import type { ProductRef, HudCommand } from "../../transport/hud-commands";
import type { ProductSignals } from "../../amazon/product-signals";
import { getCache, loadFilters, membership } from "../../catalogue/cache";

// Which campaigns the local CC/SPCC catalogue says this product has. Drives
// whether the Accept buttons render at all: no point offering to accept (and
// having the app open a browser) for a product with no campaign.
type CampaignFlags = { cc: boolean; spcc: boolean };

// "Send to your butler app" section. When the desktop app is running, its
// buttons push the current product straight into a workspace (Deals Influencer Butler,
// Content Butler) or accept its Creator Connections campaign, all over the
// local bridge. When the app is not running, every button becomes a targeted
// upsell: this is the extension-to-subscription funnel.

export function renderHudActions(signals: ProductSignals): void {
  if (!signals.asin) return;
  const section = addSection(t().sendToApp);
  const body = el("div");
  const status = el("p", "progress");
  section.append(body, status);

  const product = toProductRef(signals);

  void Promise.all([
    sendToBackground<HudStatus>({ kind: "GET_HUD_STATUS" }),
    sendToBackground<AuthStatus>({ kind: "GET_AUTH_STATUS" }),
    campaignFlagsFor(signals.asin),
  ]).then(([hud, auth, flags]) => {
    if (hud.connected) {
      renderConnected(body, status, product, hud, flags, signals.brand);
    } else {
      renderUpsell(body, auth);
    }
  });
}

// Local, zero-cost CC/SPCC membership check against the downloaded bloom
// filters. Degrades to "no campaigns" if the catalogue has not been downloaded.
async function campaignFlagsFor(asin: string): Promise<CampaignFlags> {
  try {
    const flags = membership(loadFilters(await getCache()), asin);
    return { cc: flags.cc, spcc: flags.spcc };
  } catch {
    return { cc: false, spcc: false };
  }
}

function renderConnected(
  body: HTMLElement,
  status: HTMLElement,
  product: ProductRef,
  hud: HudStatus,
  flags: CampaignFlags,
  brand: string | null,
): void {
  body.replaceChildren();

  const run = (command: HudCommand, pending: string) => {
    status.textContent = pending;
    disableAll(body, true);
    void sendToBackground<HudCommandResult>({ kind: "SEND_HUD_COMMAND", command }).then((result) => {
      disableAll(body, false);
      status.textContent = result.ok
        ? (result.message ?? t().sentToApp)
        : (result.message ?? t().couldNotReachApp);
    });
  };

  // Deals Influencer Butler: workspace picker + send.
  const workspaces = hud.dealWorkspaces?.length ? hud.dealWorkspaces : DEAL_WORKSPACES;
  const dealRow = el("div", "row");
  const picker = el("select");
  for (const w of workspaces) {
    const opt = el("option");
    opt.value = w.key;
    opt.textContent = w.label;
    picker.append(opt);
  }
  const dealBtn = el("button", "btn");
  dealBtn.textContent = t().pushToDailyDeals;
  dealBtn.addEventListener("click", () =>
    run({ type: "deal.push", workspace: picker.value, product }, t().pushingDeals),
  );
  dealRow.append(picker, dealBtn);
  body.append(dealRow);

  // Content Butler + campaign acceptance.
  const contentBtn = el("button", "btn secondary");
  contentBtn.textContent = t().sendToContentButler;
  contentBtn.addEventListener("click", () =>
    run({ type: "content.push", product }, t().sendingContent),
  );

  const collabBtn = el("button", "btn secondary");
  collabBtn.textContent = t().addToCollab;
  collabBtn.addEventListener("click", () =>
    run({ type: "collaboration.add", product }, t().addingCollab),
  );

  const grid = el("div", "row");
  grid.style.flexWrap = "wrap";
  grid.append(contentBtn);

  // Accept buttons only appear when the local CC/SPCC catalogue says this
  // product actually has a campaign, so we never ask the app to open a browser
  // for a product with nothing to accept.
  if (flags.cc) {
    const ccBtn = el("button", "btn secondary");
    ccBtn.textContent = t().acceptCc;
    ccBtn.addEventListener("click", () =>
      run({ type: "campaign.accept", kind: "cc", product }, t().checkingCc),
    );
    grid.append(ccBtn);
  }
  if (flags.spcc) {
    const spccBtn = el("button", "btn secondary");
    spccBtn.textContent = t().acceptSpcc;
    spccBtn.addEventListener("click", () =>
      run({ type: "campaign.accept", kind: "spcc", product }, t().checkingSpcc),
    );
    grid.append(spccBtn);
  }

  grid.append(collabBtn);

  // Save to Link Butler: mint + record a branded, app-opening Calling Card for
  // this product in the desktop Link Butler (so it lands in The Ledger).
  const linkBtn = el("button", "btn secondary");
  linkBtn.textContent = t().saveToLinkButler;
  linkBtn.addEventListener("click", () =>
    run({ type: "link.mint", product }, t().savingLink),
  );
  grid.append(linkBtn);

  // Generate AI photo: ask the desktop app to render a shoppable AI image for
  // this product with its existing image engine (reusing its ASIN->image cache).
  const photoBtn = el("button", "btn secondary");
  photoBtn.textContent = t().generatePhoto;
  photoBtn.addEventListener("click", () =>
    run({ type: "photo.generate", product, style: "shoppable" }, t().generatingPhoto),
  );
  grid.append(photoBtn);

  // Pitch this brand + Request a sample: only when the page named a brand. Both
  // turn the product into an outreach lead in Pitch Butler (brand + deal), no
  // browser. Request-a-sample pre-stages the deal for the free-sample template.
  if (brand && brand.trim()) {
    const pitchBtn = el("button", "btn secondary");
    pitchBtn.textContent = t().pitchThisBrand(brand.trim());
    pitchBtn.addEventListener("click", () =>
      run({ type: "pitch.add", brand: brand.trim(), product }, t().pitchingBrand),
    );
    grid.append(pitchBtn);

    const sampleBtn = el("button", "btn secondary");
    sampleBtn.textContent = t().requestSample;
    sampleBtn.addEventListener("click", () =>
      run({ type: "sample.request", brand: brand.trim(), product }, t().requestingSample),
    );
    grid.append(sampleBtn);
  }

  body.append(grid);

  const note = el("p", "note");
  const version = hud.appVersion ? ` (app ${hud.appVersion})` : "";
  note.textContent = t().connectedToApp(version);
  body.append(note);
}

function renderUpsell(body: HTMLElement, auth: AuthStatus): void {
  body.replaceChildren();
  const card = el("div", "seal fail");
  card.style.display = "block";
  card.textContent = auth.signedIn ? t().upsellSignedIn : t().upsellSignedOut;
  body.append(card);

  const cta = el("a", "btn");
  cta.textContent = auth.signedIn ? t().ctaOpenApp : t().ctaStartTrial;
  // href is kept for middle-click / open-in-new-tab and accessibility, but a
  // plain anchor does not reliably navigate from inside the overlay's shadow
  // DOM, so a normal click routes through the background worker instead.
  (cta as HTMLAnchorElement).href = APP_TRIAL_URL;
  (cta as HTMLAnchorElement).target = "_blank";
  (cta as HTMLAnchorElement).rel = "noopener";
  cta.style.display = "inline-block";
  cta.style.marginTop = "8px";
  cta.style.textDecoration = "none";
  cta.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    void sendToBackground<void>({ kind: "OPEN_URL", url: APP_TRIAL_URL });
  });
  body.append(cta);

  const note = el("p", "note");
  note.textContent = t().toolsAlwaysFree;
  body.append(note);
}

function toProductRef(signals: ProductSignals): ProductRef {
  return {
    asin: signals.asin as string,
    marketplace: signals.marketplace,
    title: signals.title?.slice(0, 200),
    priceCents: signals.priceCents,
    currency: signals.currency,
    imageUrl: signals.imageUrl ?? undefined,
    commissionRatePct: signals.commissionRatePct,
  };
}

function disableAll(root: HTMLElement, disabled: boolean): void {
  for (const btn of Array.from(root.querySelectorAll("button"))) {
    (btn as HTMLButtonElement).disabled = disabled;
  }
}
