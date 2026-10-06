import { addSection, el, getQuickBarDealsSlot, peekQuickBarDealsSlot } from "../../ui/components";
import { t } from "../../i18n";
import { sendToBackground } from "../../shared/messages";
import { getSettings } from "../../storage/store";
import { APP_TRIAL_URL, DEAL_WORKSPACES } from "../../shared/constants";
import type { AuthStatus, HudCommandResult, HudStatus } from "../../shared/messages";
import { getFlags } from "../../flags/cache";
import { activeDealEvent, findPrimeDayWorkspace, retailerOfMarketplace } from "../../deals/events";
import { showToast } from "../../ui/toast";
import type { ProductRef } from "../../transport/hud-commands";
import type { ProductSignals } from "../../amazon/product-signals";
import { makeCommandRunner, toProductRef } from "./runner";

// "Send to your butler app" section. When the desktop app is running, its
// buttons push the current product straight into a workspace (Deals Butler,
// Content Butler), all over the local bridge. Campaign acceptance lives in the
// Campaigns section above. When the app is not running, every button becomes a
// targeted upsell: this is the extension-to-subscription funnel.

// Options let a non-Amazon caller (the Walmart product overlay) reuse this same
// section but limit it to the actions whose desktop handlers are retailer-ready.
// `onlyDeals` renders just the Deals Butler push (verified end-to-end
// for Walmart) and skips the Amazon-only actions (Idea Lists, video/photo, etc.).
export type HudActionsOptions = { onlyDeals?: boolean };

export function renderHudActions(signals: ProductSignals, opts: HudActionsOptions = {}): void {
  if (!signals.asin) return;
  const section = addSection(t().sendToApp);
  const body = el("div");
  const status = el("p", "progress");
  section.append(body, status);

  const product = toProductRef(signals);

  // Schedule a social post from this product's image. Lives on `section` (not
  // `body`, which the connect-state branches replace) so it is always shown: it
  // goes to the backend queue and the desktop app publishes it, so it works even
  // when the app is not paired. The compose window checks the signed-in license.
  const scheduleRow = el("div", "row");
  const scheduleBtn = el("button", "btn secondary");
  scheduleBtn.textContent = t().tileMenuSchedulePost;
  scheduleBtn.addEventListener("click", () => {
    void sendToBackground<{ ok: boolean }>({
      kind: "OPEN_SOCIAL_COMPOSE",
      context: {
        imageUrl: product.imageUrl ?? null,
        pageUrl: product.url ?? location.href,
        title: product.title ?? null,
      },
    });
  });
  scheduleRow.append(scheduleBtn);
  section.append(scheduleRow);

  // The section used to render its connect state exactly once, from the very
  // first probe of the page load. That probe can fail while the background
  // worker is still waking up, so a healthy, paired app got stuck on the
  // "isn't responding, reload this page" hint forever (while the header's
  // Synced chip, which re-polls, went green seconds later). Re-check on a
  // timer and re-render whenever the state actually changes; polling stops
  // once the app is connected or the panel leaves the DOM.
  type ConnectState = "needs-pairing" | "connected" | "reconnect" | "upsell";
  let lastState: ConnectState | "" = "";
  const apply = (hud: HudStatus, auth: AuthStatus): ConnectState => {
    let state: ConnectState;
    if (hud.connected && hud.paired === false) {
      // App running but this extension was never paired to it. Every command
      // would come back needsPairing, and the only place that showed was a
      // small status line AFTER a click, so the buttons looked ready and then
      // appeared to do nothing (reported for Send to Deals Butler, Send to
      // Collab Butler, and Generate AI photo alike). Say it up front instead.
      // Explicit === false so an older background that omits `paired` keeps the
      // previous behavior rather than being treated as unpaired.
      state = "needs-pairing";
    } else if (hud.connected) {
      state = "connected";
    } else if (hud.paired) {
      // Already installed and paired, but the local bridge did not answer this
      // time (app closed, still starting, or its port is blocked). Pitching the
      // download here reads as broken, so show a reconnect hint instead.
      state = "reconnect";
    } else {
      state = "upsell";
    }
    if (state === lastState) return state;
    lastState = state;
    // The Deals Butler push lives in the pinned quick-links bar (next to Scrub
    // link), not in this section's body, so every non-connected state must
    // clear it explicitly rather than relying on the body swap below to hide it.
    if (state !== "connected") peekQuickBarDealsSlot()?.replaceChildren();
    if (state === "needs-pairing") {
      renderNeedsPairing(body, status);
    } else if (state === "connected") {
      renderConnected(body, status, product, hud, signals.brand, opts);
    } else if (state === "reconnect") {
      renderReconnect(body, status);
    } else {
      renderUpsell(body, auth);
    }
    return state;
  };

  const check = (force: boolean): Promise<ConnectState> =>
    Promise.all([
      sendToBackground<HudStatus>({ kind: "GET_HUD_STATUS", force }),
      sendToBackground<AuthStatus>({ kind: "GET_AUTH_STATUS" }),
    ]).then(([hud, auth]) => apply(hud, auth));

  void check(false)
    .catch((): "" => "")
    .then((state) => {
      if (state === "connected") return;
      const timer = setInterval(() => {
        if (!body.isConnected) {
          clearInterval(timer);
          return;
        }
        void check(true)
          .then((s) => {
            if (s === "connected") clearInterval(timer);
          })
          .catch(() => {});
      }, RECONNECT_POLL_MS);
    });
}

// How often the section re-checks for the app while it is not connected. The
// forced probe bypasses the background's status cache, so each tick is a real
// answer; 10s keeps the recovery snappy without hammering the loopback bridge.
const RECONNECT_POLL_MS = 10_000;

// The app is reachable but unpaired: show the pairing instruction in place of
// the action buttons, so the user learns it before clicking rather than after.
function renderNeedsPairing(body: HTMLElement, status: HTMLElement): void {
  body.replaceChildren();
  const card = el("div", "seal fail");
  card.style.display = "block";
  card.textContent = t().connectAppToPair;
  body.append(card);
  status.textContent = "";
}

// Paired but the bridge did not answer right now: show a reconnect hint (and
// keep the always-free note) instead of the install upsell a fresh user gets.
function renderReconnect(body: HTMLElement, status: HTMLElement): void {
  body.replaceChildren();
  const card = el("div", "seal fail");
  card.style.display = "block";
  card.textContent = t().upsellReconnect;
  body.append(card);

  const note = el("p", "note");
  note.textContent = t().toolsAlwaysFree;
  body.append(note);
  status.textContent = "";
}

function renderConnected(
  body: HTMLElement,
  status: HTMLElement,
  product: ProductRef,
  hud: HudStatus,
  brand: string | null,
  opts: HudActionsOptions,
): void {
  body.replaceChildren();

  // Deals Butler: workspace picker + send. Rendered into the pinned quick-links
  // bar (next to Scrub link) instead of this section's body, so it is one click
  // away without scrolling past the rest of "Send to your butler app". Built
  // before `run` so the button can be passed in as an extra control to disable
  // while any command (not just this one) is in flight, mirroring how it used
  // to sit inside `body` and get swept up by disableAll.
  const workspaces = hud.dealWorkspaces?.length ? hud.dealWorkspaces : DEAL_WORKSPACES;
  const dealRow = el("div", "quickbar-deals-row");
  const picker = el("select", "quickbar-select");
  for (const w of workspaces) {
    const opt = el("option");
    opt.value = w.key;
    opt.textContent = w.label;
    picker.append(opt);
  }
  const dealBtn = el("button", "btn small");
  dealBtn.textContent = t().pushToDailyDeals;
  dealRow.append(picker, dealBtn);
  getQuickBarDealsSlot().replaceChildren(dealRow);

  const run = makeCommandRunner(body, status, [dealBtn]);

  // Event days (Prime Day, Walmart Deals): also send to the Prime Day Deals
  // workspace. Resolved asynchronously; until then (and whenever no event is
  // open, the setting is off, or the app does not offer that workspace) the row
  // is exactly the plain push it always was.
  let primeDay: { key: string; mode: "ask" | "always"; box: HTMLInputElement | null } | null = null;
  void (async () => {
    const [settings, flags] = await Promise.all([getSettings(), getFlags()]);
    const mode = settings.deals.eventAlsoSend;
    if (mode === "off") return;
    if (!activeDealEvent(flags?.events, retailerOfMarketplace(product.marketplace))) return;
    const target = findPrimeDayWorkspace(hud.dealWorkspaces ?? []);
    if (!target) return;
    let box: HTMLInputElement | null = null;
    if (mode === "ask") {
      const label = el("label", "quickbar-event");
      box = el("input") as HTMLInputElement;
      box.type = "checkbox";
      label.append(box, document.createTextNode(" " + t().alsoSendPrimeDay));
      dealRow.append(label);
    }
    primeDay = { key: target.key, mode, box };
  })().catch(() => {});

  dealBtn.addEventListener("click", async () => {
    // Honour the "When a deal arrives" placement from Settings > Deals, so this
    // button lands the deal where the creator chose rather than the desktop's
    // own fallback default (read at click time so a Settings change is picked up).
    const placement = (await getSettings()).deals.placement;
    const extra = primeDay;
    if (extra && picker.value !== extra.key && (extra.mode === "always" || extra.box?.checked)) {
      void sendToBackground<HudCommandResult>({
        kind: "SEND_HUD_COMMAND",
        command: { type: "deal.push", workspace: extra.key, product, placement },
      })
        .then((result) => {
          if (!result.ok) {
            showToast({
              title: t().actionFailedTitle,
              message: result.message ?? t().couldNotReachApp,
              closeLabel: t().nudgeCloseLabel,
            });
          }
        })
        .catch(() => {});
    }
    run({ type: "deal.push", workspace: picker.value, product, placement }, t().pushingDeals);
  });

  // Non-Amazon retailers only get the retailer-ready actions above for now; the
  // rest of the section is Amazon-specific (Idea Lists, video/photo, CC).
  if (opts.onlyDeals) {
    const note = el("p", "note");
    const version = hud.appVersion ? ` (app ${hud.appVersion})` : "";
    note.textContent = t().connectedToApp(version);
    body.append(note);
    return;
  }

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

  // Send to Voiceover Butler: enqueue the product for a shoppable-video script.
  const voiceoverBtn = el("button", "btn secondary");
  voiceoverBtn.textContent = t().sendToVoiceover;
  voiceoverBtn.addEventListener("click", () =>
    run({ type: "voiceover.push", product }, t().sendingVoiceover),
  );

  const grid = el("div", "row");
  grid.style.flexWrap = "wrap";
  grid.append(contentBtn, collabBtn, voiceoverBtn);

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
