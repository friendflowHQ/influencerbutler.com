import { addSection, el } from "../../ui/components";
import { t } from "../../i18n";
import { sendToBackground } from "../../shared/messages";
import { APP_TRIAL_URL, DEAL_WORKSPACES } from "../../shared/constants";
import type { AuthStatus, HudStatus } from "../../shared/messages";
import type { ProductRef } from "../../transport/hud-commands";
import type { ProductSignals } from "../../amazon/product-signals";
import { makeCommandRunner, toProductRef } from "./runner";

// "Send to your butler app" section. When the desktop app is running, its
// buttons push the current product straight into a workspace (Deals Influencer Butler,
// Content Butler), all over the local bridge. Campaign acceptance lives in the
// Campaigns section above. When the app is not running, every button becomes a
// targeted upsell: this is the extension-to-subscription funnel.

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
  ]).then(([hud, auth]) => {
    if (hud.connected) {
      renderConnected(body, status, product, hud, signals.brand);
    } else {
      renderUpsell(body, auth);
    }
  });
}

function renderConnected(
  body: HTMLElement,
  status: HTMLElement,
  product: ProductRef,
  hud: HudStatus,
  brand: string | null,
): void {
  body.replaceChildren();

  const run = makeCommandRunner(body, status);

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
  grid.append(contentBtn, collabBtn);

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

  // Idea List Butler: pick an existing Amazon Idea List (from the app's known
  // lists) or name a new one, then queue this product for the butler's next
  // publish run. Mirrors the Deals workspace picker row above.
  const NEW_LIST_VALUE = "__new__";
  const ideaRow = el("div", "row");
  const ideaPicker = el("select");
  for (const list of hud.ideaLists ?? []) {
    const opt = el("option");
    opt.value = list.listId;
    opt.textContent = list.title;
    ideaPicker.append(opt);
  }
  const newOpt = el("option");
  newOpt.value = NEW_LIST_VALUE;
  newOpt.textContent = t().ideaListNewListOption;
  ideaPicker.append(newOpt);
  const nameInput = el("input") as HTMLInputElement;
  nameInput.type = "text";
  nameInput.placeholder = t().tileMenuNewListPlaceholder;
  nameInput.maxLength = 100;
  const syncNameInput = (): void => {
    nameInput.style.display = ideaPicker.value === NEW_LIST_VALUE ? "" : "none";
  };
  ideaPicker.addEventListener("change", syncNameInput);
  syncNameInput();
  const ideaBtn = el("button", "btn secondary");
  ideaBtn.textContent = t().addToIdeaList;
  ideaBtn.addEventListener("click", () => {
    const target = ideaPicker.value === NEW_LIST_VALUE
      ? { newListTitle: nameInput.value.trim() }
      : { listId: ideaPicker.value };
    if (target.newListTitle === "") {
      nameInput.focus();
      return;
    }
    run({ type: "idealist.push", product, target }, t().addingToIdeaList);
  });
  ideaRow.append(ideaPicker, nameInput, ideaBtn);
  body.append(ideaRow);

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
