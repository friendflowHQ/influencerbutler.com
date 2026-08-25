import {
  sendToBackground,
  type AuthStatus,
  type FeedbackInput,
  type FeedbackResult,
  type IntegrationsView,
  type PageStatus,
  type PairResult,
  type ProductListsResult,
  type RowBadge,
  type RowBadgesResult,
  type RowEnrichRef,
  type SignInResult,
  type UpdateStateView,
  type WatchlistResult,
} from "../shared/messages";
import { getSettings, patchSettings } from "../storage/store";
import { getFlags } from "../flags/cache";
import type { Settings, WatchCondition } from "../storage/schema";
import {
  AVAILABILITY_MARKETS,
  OPTIONAL_MARKET_ORIGINS,
} from "../background/market-availability";
import { channelAllowed } from "../shared/creator-mode";
import { resolveLocale, setLocale, t } from "../i18n";

// Popup: page status via the active tab's content script, account sign-in via
// the background, settings straight to storage (content scripts pick changes
// up on the next page view).

// Adapter id of the first-party branded-link provider. Selecting it as the
// primary deeplink provider is the whole of "turn branded links on": it takes no
// credentials, only the signed-in license.
const IB_LINKS = "influencerbutler";

void init();

async function init(): Promise<void> {
  const settings = await getSettings();
  setLocale(settings.locale);
  applyStaticI18n();
  showVersion();
  await Promise.all([
    renderUpdateCard(),
    renderPageStatus(),
    renderAccount(),
    renderAppBridge(),
    renderSettings(),
    renderWatchlist(),
    renderProductLists(),
  ]);
  wireFeedback();
  wireOptions();
  // AI Assistant is a neutral help tool for every creator, so it is wired
  // unconditionally, like Link Butler below.
  wireChat(settings.locale);
  // Link Butler (branded-link Ledger) is a neutral tool: creators share links on
  // every channel, so it shows regardless of onsite/offsite creator mode.
  void wireLinkButler(settings.locale);
  // The Deal Sites Harvester and Instagram Goldmine are offsite tools (harvest
  // deals / creators to share off-Amazon). Hide their launcher cards for an
  // onsite-only creator; "both" and offsite show them as before.
  if (channelAllowed(settings.creatorMode, "offsite")) {
    wireDealHarvester(settings.locale);
    // Instagram Goldmine launcher: self-hosted build only. The whole call (and
    // its import-free body) dead-code-eliminates out of the public build,
    // leaving the card hidden as authored in popup.html.
    if (IB_IG_ENABLED) wireGoldmine();
  } else {
    const dealCard = document.getElementById("deal-harvester");
    if (dealCard) dealCard.hidden = true;
  }
}

// Stamp the running extension version into the header, read from the manifest
// so it always matches the installed build (no hardcoded string to drift).
function showVersion(): void {
  const el = document.getElementById("ext-version");
  if (el) el.textContent = `v${chrome.runtime.getManifest().version}`;
}

// Extension-update card: shown only when Chrome has a newer version staged
// (and the user has not snoozed it). "Update now" restarts the extension to
// apply it, which closes this popup; that is expected.
async function renderUpdateCard(): Promise<void> {
  const view = await sendToBackground<UpdateStateView>({ kind: "GET_UPDATE_STATE" }).catch(
    () => null,
  );
  if (!view?.due || !view.availableVersion) return; // card stays hidden
  byId("update-heading").textContent = t().updatePopupHeading;
  byId("update-blurb").textContent = t().updatePopupBody(view.currentVersion, view.availableVersion);
  const btn = byId<HTMLButtonElement>("update-apply");
  btn.textContent = t().updateNow;
  btn.onclick = () => {
    void sendToBackground<void>({ kind: "APPLY_UPDATE" }).catch(() => {});
  };
  byId("update-card").hidden = false;
}

// Build and wire the Instagram Goldmine card. Constructed entirely in JS (not
// in popup.html) so the public build's popup markup is byte-for-byte unchanged;
// this whole function dead-code-eliminates out when IB_IG_ENABLED is false. It
// opens in its own tab (it needs room for the config + results table and
// outlives the popup).
function wireGoldmine(): void {
  const main = document.querySelector("main");
  const anchor = document.getElementById("deal-harvester");
  if (!main) return;

  const card = document.createElement("section");
  card.className = "card";

  const h2 = document.createElement("h2");
  h2.textContent = "Instagram Goldmine";

  const blurb = document.createElement("p");
  blurb.className = "muted small";
  blurb.textContent =
    "Crawl Instagram hashtags for creator emails using your own logged-in Instagram session, then send them to Pitch or Group Invite.";

  const btn = document.createElement("button");
  btn.className = "primary";
  btn.textContent = "Open Instagram Goldmine";
  btn.onclick = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("goldmine.html") });
  };

  card.append(h2, blurb, btn);
  // Place it just after the Deal Sites Harvester card, else at the end.
  if (anchor && anchor.parentElement === main) {
    anchor.insertAdjacentElement("afterend", card);
  } else {
    main.append(card);
  }
}

// The Deal Sites Harvester opens in its own tab (it needs room for a review
// table and outlives the popup, which closes on blur). Localized inline so the
// three strings do not have to live in the shared catalog.
// The AI Assistant opens in its own tab, like the harvester. Strings are
// localized inline so they do not have to live in the shared catalog.
function wireChat(locale: Settings["locale"]): void {
  const dict = {
    en: {
      heading: "AI Assistant",
      blurb: "Ask setup and how-to questions and get instant answers from our help guides.",
      open: "Open AI Assistant",
    },
    es: {
      heading: "Asistente de IA",
      blurb: "Haz preguntas de configuración y guías, y obtén respuestas al instante desde nuestra ayuda.",
      open: "Abrir el asistente de IA",
    },
    fr: {
      heading: "Assistant IA",
      blurb: "Posez vos questions de configuration et obtenez des réponses instantanées depuis notre aide.",
      open: "Ouvrir l'assistant IA",
    },
  }[resolveLocale(locale)];
  byId("chat-heading").textContent = dict.heading;
  byId("chat-blurb").textContent = dict.blurb;
  const btn = byId<HTMLButtonElement>("open-chat");
  btn.textContent = dict.open;
  btn.onclick = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("chat.html") });
  };
}

function wireDealHarvester(locale: Settings["locale"]): void {
  const dict = {
    en: {
      heading: "Deal Sites Harvester",
      blurb:
        "Pull deals from the daily-deal sites you follow and send them into a Deals Influencer Butler workspace in the app.",
      open: "Open Deal Sites Harvester",
    },
    es: {
      heading: "Recolector de sitios de ofertas",
      blurb:
        "Extrae ofertas de los sitios de ofertas diarias que sigues y envíalas a un espacio de Ofertas Diarias en la app.",
      open: "Abrir el recolector de sitios",
    },
    fr: {
      heading: "Collecteur de sites de bons plans",
      blurb:
        "Récupérez les offres des sites de bons plans que vous suivez et envoyez-les vers un espace Offres du Jour dans l'app.",
      open: "Ouvrir le collecteur de sites",
    },
  }[resolveLocale(locale)];
  byId("deals-heading").textContent = dict.heading;
  byId("deals-blurb").textContent = dict.blurb;
  const btn = byId<HTMLButtonElement>("open-deals");
  btn.textContent = dict.open;
  btn.onclick = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("deals.html") });
  };
}

// The Link Butler (Ledger) opens in its own tab, like the harvester. Localized
// inline so the strings do not have to live in the shared catalog. The card also
// carries the branded-links switch: this is where a creator signs in, so it is
// the one place the free short-link feature is guaranteed to be seen, instead of
// only in a dropdown on the API Integrations page.
async function wireLinkButler(locale: Settings["locale"]): Promise<void> {
  const dict = {
    en: {
      heading: "Link Butler",
      blurb:
        "See how your branded links are performing, fix a posted link, and manage retargeting pixels.",
      open: "Open Link Butler",
      brandedLabel: "Copy short branded links",
      brandedHint:
        "Copy my link hands you a links.influencerbutler.com short link instead of a long Amazon url. Your affiliate tag stays out of what you post, and clicks are counted. Free on any plan. Turn it off to copy the plain Amazon link.",
      brandedSignIn: "Connect your license key above to use branded links.",
    },
    es: {
      heading: "Link Butler",
      blurb:
        "Mira el rendimiento de tus enlaces de marca, corrige un enlace publicado y gestiona los pixeles de retargeting.",
      open: "Abrir Link Butler",
      brandedLabel: "Copiar enlaces cortos de marca",
      brandedHint:
        "Copiar mi enlace te da un enlace corto de links.influencerbutler.com en lugar de una url larga de Amazon. Tu etiqueta de afiliado no aparece en lo que publicas y se cuentan los clics. Gratis en cualquier plan. Desactívalo para copiar el enlace normal de Amazon.",
      brandedSignIn: "Conecta tu clave de licencia arriba para usar enlaces de marca.",
    },
    fr: {
      heading: "Link Butler",
      blurb:
        "Suivez les performances de vos liens de marque, corrigez un lien publie et gerez les pixels de reciblage.",
      open: "Ouvrir Link Butler",
      brandedLabel: "Copier des liens de marque courts",
      brandedHint:
        "Copier mon lien vous donne un lien court links.influencerbutler.com au lieu d'une longue url Amazon. Votre balise d'affiliation reste hors de ce que vous publiez et les clics sont comptes. Gratuit sur toute offre. Desactivez-le pour copier le lien Amazon brut.",
      brandedSignIn: "Connectez votre cle de licence ci-dessus pour utiliser les liens de marque.",
    },
  }[resolveLocale(locale)];
  byId("lb-heading").textContent = dict.heading;
  byId("lb-blurb").textContent = dict.blurb;
  const btn = byId<HTMLButtonElement>("open-links");
  btn.textContent = dict.open;
  btn.onclick = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("links.html") });
  };

  byId("lb-branded-label").textContent = dict.brandedLabel;
  const box = byId<HTMLInputElement>("lb-branded");
  const hint = byId("lb-branded-hint");
  const view = await sendToBackground<IntegrationsView>({ kind: "GET_INTEGRATIONS" });
  const on = view.global.primaryDeeplinkProvider === IB_LINKS;
  box.checked = on;
  // `configured` for this provider means a license key is signed in, which is
  // the only thing branded links need. Say so rather than letting the toggle
  // look armed while links would quietly come back plain.
  const signedIn = Boolean(view.providers.find((p) => p.id === IB_LINKS)?.configured);
  hint.textContent = signedIn ? dict.brandedHint : dict.brandedSignIn;
  box.onchange = () => {
    void sendToBackground({
      kind: "SET_INTEGRATION_GLOBAL",
      partial: { primaryDeeplinkProvider: box.checked ? IB_LINKS : null },
    });
  };
}

// Local storage key the background's hud-bridge writes the pairing token to.
// Kept in sync with TOKEN_KEY in src/background/hud-bridge.ts.
const BRIDGE_TOKEN_KEY = "ib-bridge-token";

async function isPairedLocal(): Promise<boolean> {
  try {
    const out = await chrome.storage.local.get(BRIDGE_TOKEN_KEY);
    const token = out?.[BRIDGE_TOKEN_KEY];
    return typeof token === "string" && token.length > 0;
  } catch {
    return false;
  }
}

// The "Desktop app" card: a two-step pairing flow. Connect asks the running app
// to show a 6-digit code (it pops it in the app), then the user types the code
// here to pair. Once paired, the token is stored and commands authenticate with
// it; Disconnect forgets it.
async function renderAppBridge(): Promise<void> {
  const disconnected = byId("app-bridge-disconnected");
  const pairing = byId("app-bridge-pairing");
  const connected = byId("app-bridge-connected");
  const status = byId("app-pair-status");

  const show = (state: "disconnected" | "pairing" | "connected") => {
    disconnected.hidden = state !== "disconnected";
    pairing.hidden = state !== "pairing";
    connected.hidden = state !== "connected";
  };
  const paired = await isPairedLocal();
  show(paired ? "connected" : "disconnected");

  // Guide freshly-connected users to the (optional) next step: once they've
  // linked a license but haven't paired the desktop app, surface a hint so the
  // two separate connections don't get conflated.
  const auth = await sendToBackground<AuthStatus>({ kind: "GET_AUTH_STATUS" });
  byId("app-next-step").hidden = !(auth.signedIn && !paired);

  byId<HTMLButtonElement>("app-connect-btn").onclick = async () => {
    status.textContent = t().appRequestingCode;
    const r = await sendToBackground<PairResult>({ kind: "REQUEST_PAIRING" });
    if (r.ok && r.stage === "pending") {
      show("pairing");
      status.textContent = t().appCodeShown;
      byId<HTMLInputElement>("app-code-input").focus();
    } else {
      status.textContent = r.message ?? t().appNotRunning;
    }
  };

  byId<HTMLButtonElement>("app-pair-submit").onclick = async () => {
    const code = byId<HTMLInputElement>("app-code-input").value.trim();
    if (!/^\d{6}$/.test(code)) {
      status.textContent = t().appCodeInvalid;
      return;
    }
    status.textContent = t().appPairing;
    const r = await sendToBackground<PairResult>({ kind: "SUBMIT_PAIRING_CODE", code });
    if (r.ok && r.stage === "paired") {
      show("connected");
      status.textContent = t().appPaired;
    } else {
      status.textContent = r.message ?? t().appPairFailed;
    }
  };

  byId<HTMLButtonElement>("app-unpair-btn").onclick = async () => {
    await sendToBackground({ kind: "UNPAIR_APP" });
    show("disconnected");
    status.textContent = "";
  };
}

// The gear opens the full API Integrations settings page.
function wireOptions(): void {
  byId<HTMLButtonElement>("open-options").onclick = () => {
    chrome.runtime.openOptionsPage();
  };
}

// Translate the static popup chrome: every element carrying data-i18n gets its
// text set, and data-i18n-ph sets an input/textarea placeholder. Interpolated
// strings (counts, times) are handled inline where they are built.
function applyStaticI18n(): void {
  const dict = t() as unknown as Record<string, unknown>;
  for (const node of Array.from(document.querySelectorAll<HTMLElement>("[data-i18n]"))) {
    const value = dict[node.dataset.i18n ?? ""];
    if (typeof value === "string") node.textContent = value;
  }
  for (const node of Array.from(document.querySelectorAll<HTMLElement>("[data-i18n-ph]"))) {
    const value = dict[node.dataset.i18nPh ?? ""];
    if (typeof value === "string") {
      (node as HTMLInputElement | HTMLTextAreaElement).placeholder = value;
    }
  }
}

function wireFeedback(): void {
  const btn = byId<HTMLButtonElement>("fb-send");
  const type = byId<HTMLSelectElement>("fb-type");
  const message = byId<HTMLTextAreaElement>("fb-message");
  const honeypot = byId<HTMLInputElement>("fb-website");
  const status = byId("fb-status");

  btn.onclick = async () => {
    if (honeypot.value) return; // bot
    const text = message.value.trim();
    if (text.length < 3) {
      status.textContent = t().feedbackAddDetail;
      return;
    }
    btn.disabled = true;
    status.textContent = t().feedbackSending;
    let pageUrl: string | undefined;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url?.includes("amazon.com")) pageUrl = tab.url.split("?")[0];
    } catch {
      // page url is best-effort context, not required
    }
    const feedback: FeedbackInput = {
      feedbackType: type.value as FeedbackInput["feedbackType"],
      message: text,
      pageUrl,
    };
    const result = await sendToBackground<FeedbackResult>({ kind: "SEND_FEEDBACK", feedback });
    btn.disabled = false;
    if (result.ok) {
      message.value = "";
      status.textContent = t().feedbackThanks;
    } else {
      status.textContent = result.error ?? t().feedbackFailed;
    }
  };
}

async function renderPageStatus(): Promise<void> {
  const text = byId("page-status-text");
  const list = byId("page-status-list");
  // An admin notice from the operational flags feed (for example, "We paused
  // the storefront check while Amazon settles a layout change"), shown above
  // the page status so a user knows why a tool went quiet.
  const notice = byId("page-status-notice");
  try {
    const flags = await getFlags();
    if (flags?.notice) {
      notice.textContent = flags.notice;
      notice.hidden = false;
    } else {
      notice.hidden = true;
    }
  } catch {
    notice.hidden = true;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Amazon and Walmart are both supported; the content script answers
    // GET_PAGE_STATUS on either. Any other host has no tools to report.
    const onSupportedSite =
      tab?.url?.includes("amazon.com") || tab?.url?.includes("walmart.com");
    if (!tab?.id || !onSupportedSite) {
      text.textContent = t().openAmazonToStart;
      return;
    }
    const status = await chrome.tabs.sendMessage<unknown, PageStatus>(tab.id, { kind: "GET_PAGE_STATUS" });
    if (!status || status.pageType === "other") {
      text.textContent = t().noToolsOnPage;
      return;
    }
    text.textContent = {
      product: t().productToolsActive,
      "order-history": t().orderScanReady,
      storefront: t().storefrontCheckupReady,
      "creator-upload": t().uploadHelperReady,
      "creator-manage": t().sumVideoMoney,
      "campaign-grid": t().campaignRadarActive,
      search: t().searchOverlayActive,
      "brand-store": t().storeOverlayActive,
      discovery: t().trendRadarActive,
      "idea-list": t().ideaListActive,
    }[status.pageType];
    if (status.toolSummaries.length > 0) {
      list.hidden = false;
      list.replaceChildren(
        ...status.toolSummaries.map((s) => {
          const li = document.createElement("li");
          const label = document.createElement("span");
          label.textContent = s.label;
          const value = document.createElement("b");
          value.textContent = s.value;
          li.append(label, value);
          return li;
        }),
      );
    }
  } catch {
    text.textContent = t().reloadTabToActivate;
  }
}

async function renderAccount(): Promise<void> {
  const signedOut = byId("signed-out");
  const signedIn = byId("signed-in");
  const errorEl = byId("auth-error");

  const status = await sendToBackground<AuthStatus>({ kind: "GET_AUTH_STATUS" });
  const settings = await getSettings();

  signedOut.hidden = status.signedIn;
  signedIn.hidden = !status.signedIn;

  if (status.signedIn) {
    byId("account-email").textContent = status.email ?? t().connectedFallback;
    const toggle = byId<HTMLInputElement>("sync-toggle");
    toggle.checked = settings.syncEnabled;
    toggle.onchange = () => void patchSettings({ syncEnabled: toggle.checked });

    // Opt-in (off by default): contribute product facts to the shared catalogue.
    const contribute = byId<HTMLInputElement>("contribute-toggle");
    contribute.checked = settings.contributeCatalogue;
    contribute.onchange = () => void patchSettings({ contributeCatalogue: contribute.checked });
    byId("sync-status").textContent =
      status.queueDepth > 0
        ? t().findingsWaiting(status.queueDepth)
        : status.lastSyncAt
          ? t().lastSynced(new Date(status.lastSyncAt).toLocaleTimeString())
          : t().nothingToSync;
    byId("disconnect-btn").onclick = async () => {
      await sendToBackground({ kind: "SIGN_OUT" });
      await renderAccount();
    };
    return;
  }

  const connect = byId<HTMLButtonElement>("connect-btn");
  const input = byId<HTMLInputElement>("license-input");
  connect.onclick = async () => {
    const licenseKey = input.value.trim();
    if (!licenseKey) return;
    connect.disabled = true;
    errorEl.hidden = true;
    const result = await sendToBackground<SignInResult>({ kind: "SIGN_IN", licenseKey });
    connect.disabled = false;
    if (result.ok) {
      input.value = "";
      await renderAccount();
    } else {
      errorEl.hidden = false;
      errorEl.textContent = result.error ?? t().licenseDidNotVerify;
    }
  };
}

async function renderSettings(): Promise<void> {
  const settings = await getSettings();

  const language = byId<HTMLSelectElement>("set-language");
  language.value = settings.locale;
  language.onchange = async () => {
    await patchSettings({ locale: language.value as Settings["locale"] });
    // Re-render the whole popup in the chosen language. A reload is the simplest
    // way to retranslate both the static chrome and the dynamic status lines.
    location.reload();
  };

  bindNumber("set-commission", settings.commissionRatePct, (v) => ({ commissionRatePct: v }));
  bindNumber("set-hourly", settings.hourlyValue, (v) => ({ hourlyValue: v }));
  bindNumber("set-minutes", settings.minutesPerVideo, (v) => ({ minutesPerVideo: v }));
  bindNumber("set-gap", settings.contentGapThreshold, (v) => ({ contentGapThreshold: v }));

  const storefront = byId<HTMLInputElement>("set-storefront");
  storefront.value = settings.storefrontHandle ?? "";
  storefront.onchange = () =>
    void patchSettings({ storefrontHandle: storefront.value.trim() || null });

  for (const tool of [
    "walmart",
    "videoCounts",
    "videoLandscape",
    "approved",
    "calculator",
    "storefront",
    "ordersButler",
    "searchOverlay",
    "storeOverlay",
    "trendRadar",
    "ideaListOverlay",
    "globalMaximizer",
    "campaignMatcher",
    "campaignRadar",
    "earningsOverlay",
    "watchlist",
  ] as const) {
    const box = byId<HTMLInputElement>(`tool-${tool}`);
    box.checked = settings.tools[tool];
    box.onchange = async () => {
      const current = await getSettings();
      await patchSettings({ tools: { ...current.tools, [tool]: box.checked } });
      if (tool === "watchlist") await renderWatchlist();
    };
  }

  // Campaign Radar availability markets. AU is not in the manifest's required
  // host_permissions, so ticking it requests the amazon.com.au origin first
  // (rides the optional_host_permissions wildcard); a declined prompt unticks
  // the box and explains, so the setting never claims a market we cannot fetch.
  const auDenied = byId("avail-au-denied");
  for (const market of AVAILABILITY_MARKETS) {
    const box = byId<HTMLInputElement>(`avail-${market}`);
    box.checked = settings.availabilityMarkets.includes(market);
    box.onchange = async () => {
      const origin = OPTIONAL_MARKET_ORIGINS[market];
      if (box.checked && origin) {
        let granted = false;
        try {
          granted = await chrome.permissions.request({ origins: [origin] });
        } catch {
          granted = false;
        }
        auDenied.hidden = granted;
        if (!granted) {
          box.checked = false;
          return;
        }
      }
      const current = await getSettings();
      const next = current.availabilityMarkets.filter((m) => m !== market);
      if (box.checked) next.push(market);
      // Keep the picker's display order, not click order.
      await patchSettings({
        availabilityMarkets: AVAILABILITY_MARKETS.filter((m) => next.includes(m)),
      });
    };
  }
}

// A rendered row waiting on its enrichment: the thumbnail to fill, the title to
// upgrade from a bare ASIN, and the chip strip to populate. `ref` carries the
// batch request (and where a fetched image/title is written back).
type RowHandle = {
  ref: RowEnrichRef;
  thumb: HTMLImageElement;
  title: HTMLElement;
  signals: HTMLElement;
};

// A 34px product thumbnail; renders a neutral placeholder box until (or unless)
// an image URL is known. A broken image URL falls back to the placeholder.
function makeThumb(imageUrl: string | null, alt: string): HTMLImageElement {
  const img = document.createElement("img");
  img.className = imageUrl ? "row-thumb" : "row-thumb placeholder";
  img.loading = "lazy";
  img.alt = alt;
  if (imageUrl) img.src = imageUrl;
  img.onerror = () => {
    img.removeAttribute("src");
    img.classList.add("placeholder");
  };
  return img;
}

function setThumb(img: HTMLImageElement, imageUrl: string): void {
  img.src = imageUrl;
  img.classList.remove("placeholder");
}

function makeChip(kind: "cc" | "spcc", label: string): HTMLElement {
  const span = document.createElement("span");
  span.className = `row-chip ${kind}`;
  span.textContent = label;
  return span;
}

function makeRatePill(label: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "row-rate";
  span.textContent = label;
  return span;
}

// Paint one row's badge: fill the image, upgrade a bare-ASIN title, and lay out
// the CC / SPCC / commission chips (in that order, matching Orders Butler).
function applyRowBadge(handle: RowHandle, badge: RowBadge): void {
  if (badge.imageUrl) setThumb(handle.thumb, badge.imageUrl);
  if (badge.title && handle.title.dataset.hasTitle !== "1") {
    handle.title.textContent = badge.title;
    handle.title.dataset.hasTitle = "1";
  }
  handle.signals.replaceChildren();
  if (badge.cc) handle.signals.append(makeChip("cc", t().radarChipCc));
  if (badge.spcc) handle.signals.append(makeChip("spcc", t().radarChipSpcc));
  if (badge.ratePct != null) handle.signals.append(makeRatePill(t().tileCampaignRate(badge.ratePct)));
}

// One batch round-trip for a card's rows, then patch each in place. Runs after
// the card is drawn so the list is interactive immediately; nodes detached by a
// re-render before this resolves are simply patched off-screen (harmless).
async function enrichRowHandles(handles: RowHandle[]): Promise<void> {
  if (handles.length === 0) return;
  const { badges } = await sendToBackground<RowBadgesResult>({
    kind: "ENRICH_ROWS",
    refs: handles.map((h) => h.ref),
  });
  for (const handle of handles) {
    const badge = badges[handle.ref.asin.toUpperCase()];
    if (badge) applyRowBadge(handle, badge);
  }
}

// The Watchlist card: the products the background poller is watching, each with
// per-condition toggles and a remove. Hidden entirely when the watchlist tool
// is off, so a user who does not want it never sees the card.
async function renderWatchlist(): Promise<void> {
  const card = byId("watchlist-card");
  const list = byId("watchlist-list");
  const empty = byId("watchlist-empty");

  const settings = await getSettings();
  if (!settings.tools.watchlist) {
    card.hidden = true;
    return;
  }
  card.hidden = false;

  const { items } = await sendToBackground<WatchlistResult>({ kind: "GET_WATCHLIST" });
  list.replaceChildren();
  empty.hidden = items.length > 0;

  const conditions: Array<{ key: WatchCondition; label: string }> = [
    { key: "back_in_stock", label: t().watchCondBackInStock },
    { key: "slot_opens", label: t().watchCondSlotOpens },
    { key: "price_drop", label: t().watchCondPriceDrop },
  ];

  const handles: RowHandle[] = [];
  for (const item of items) {
    const li = document.createElement("li");

    const head = document.createElement("div");
    head.className = "watchlist-head";
    const thumb = makeThumb(item.imageUrl ?? null, item.title ?? item.asin);
    const title = document.createElement("span");
    title.className = "watchlist-title";
    title.textContent = item.title ?? item.asin;
    if (item.title) title.dataset.hasTitle = "1";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost small";
    remove.textContent = t().watchRemoveShort;
    remove.onclick = async () => {
      await sendToBackground<WatchlistResult>({
        kind: "REMOVE_FROM_WATCHLIST",
        asin: item.asin,
        marketplace: item.marketplace,
      });
      await renderWatchlist();
    };
    head.append(thumb, title, remove);
    li.append(head);

    const signals = document.createElement("div");
    signals.className = "row-signals";
    li.append(signals);
    handles.push({
      ref: {
        asin: item.asin,
        marketplace: item.marketplace,
        source: "watchlist",
        needsImage: !(item.imageUrl && item.title),
      },
      thumb,
      title,
      signals,
    });

    const conds = document.createElement("div");
    conds.className = "watchlist-conds";
    for (const cond of conditions) {
      const label = document.createElement("label");
      label.className = "watchlist-cond";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = item.notifyOn.includes(cond.key);
      box.onchange = () => {
        const next = conditions
          .map((c) => c.key)
          .filter((key) =>
            key === cond.key ? box.checked : item.notifyOn.includes(key),
          );
        item.notifyOn = next;
        void sendToBackground<WatchlistResult>({
          kind: "SET_WATCH_CONDITIONS",
          asin: item.asin,
          marketplace: item.marketplace,
          notifyOn: next,
        });
      };
      const span = document.createElement("span");
      span.textContent = cond.label;
      label.append(box, span);
      conds.append(label);
    }
    li.append(conds);
    list.append(li);
  }

  void enrichRowHandles(handles);
}

// "My lists" card: the user-named product collections built from the search
// overlay's action menu. Read-only management here (open a product, remove an
// item, delete a list); adding happens on-page.
async function renderProductLists(): Promise<void> {
  const card = byId("lists-card");
  const list = byId("lists-list");
  const empty = byId("lists-empty");

  const { lists } = await sendToBackground<ProductListsResult>({ kind: "GET_PRODUCT_LISTS" });
  list.replaceChildren();
  empty.hidden = lists.length > 0;
  card.hidden = false;

  const handles: RowHandle[] = [];
  for (const pl of lists) {
    const li = document.createElement("li");

    const head = document.createElement("div");
    head.className = "watchlist-head";
    const title = document.createElement("span");
    title.className = "watchlist-title";
    title.textContent = `${pl.name} · ${t().popupListItems(pl.items.length)}`;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost small";
    del.textContent = t().popupListDelete;
    del.onclick = async () => {
      await sendToBackground<ProductListsResult>({ kind: "DELETE_PRODUCT_LIST", id: pl.id });
      await renderProductLists();
    };
    head.append(title, del);
    li.append(head);

    for (const item of pl.items) {
      const row = document.createElement("div");
      row.className = "list-item-row";
      const thumb = makeThumb(item.imageUrl, item.title ?? item.asin);
      const open = document.createElement("button");
      open.type = "button";
      open.className = "linklike small";
      open.textContent = item.title ?? item.asin;
      if (item.title) open.dataset.hasTitle = "1";
      open.onclick = () => {
        const url = `https://www.${item.marketplace}/dp/${item.asin}`;
        void sendToBackground<void>({ kind: "OPEN_URL", url });
      };
      const signals = document.createElement("div");
      signals.className = "row-signals";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ghost small";
      remove.textContent = t().watchRemoveShort;
      remove.onclick = async () => {
        await sendToBackground<ProductListsResult>({
          kind: "REMOVE_FROM_PRODUCT_LIST",
          listId: pl.id,
          asin: item.asin,
          marketplace: item.marketplace,
        });
        await renderProductLists();
      };
      row.append(thumb, open, signals, remove);
      li.append(row);
      handles.push({
        ref: {
          asin: item.asin,
          marketplace: item.marketplace,
          source: "list",
          listId: pl.id,
          needsImage: !(item.imageUrl && item.title),
        },
        thumb,
        title: open,
        signals,
      });
    }

    list.append(li);
  }

  void enrichRowHandles(handles);
}

function bindNumber(
  id: string,
  value: number,
  toPatch: (value: number) => Partial<Settings>,
): void {
  const input = byId<HTMLInputElement>(id);
  input.value = String(value);
  input.onchange = () => {
    const parsed = parseFloat(input.value);
    if (!Number.isNaN(parsed) && parsed >= 0) void patchSettings(toPatch(parsed));
  };
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`popup element missing: ${id}`);
  return el as T;
}
