import {
  sendToBackground,
  type AuthStatus,
  type FeedbackInput,
  type FeedbackResult,
  type PageStatus,
  type PairResult,
  type SignInResult,
  type WatchlistResult,
} from "../shared/messages";
import { getSettings, patchSettings } from "../storage/store";
import type { Settings, WatchCondition } from "../storage/schema";
import { resolveLocale, setLocale, t } from "../i18n";

// Popup: page status via the active tab's content script, account sign-in via
// the background, settings straight to storage (content scripts pick changes
// up on the next page view).

void init();

async function init(): Promise<void> {
  const settings = await getSettings();
  setLocale(settings.locale);
  applyStaticI18n();
  await Promise.all([
    renderPageStatus(),
    renderAccount(),
    renderAppBridge(),
    renderSettings(),
    renderWatchlist(),
  ]);
  wireFeedback();
  wireOptions();
  wireDealHarvester(settings.locale);
  // Instagram Goldmine launcher: self-hosted build only. The whole call (and its
  // import-free body) dead-code-eliminates out of the public build, leaving the
  // card hidden as authored in popup.html.
  if (IB_IG_ENABLED) wireGoldmine();
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
  show((await isPairedLocal()) ? "connected" : "disconnected");

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
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.includes("amazon.com")) {
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
      "campaign-grid": t().campaignRadarActive,
      search: t().searchOverlayActive,
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
    "videoCounts",
    "approved",
    "calculator",
    "storefront",
    "ordersButler",
    "searchOverlay",
    "campaignMatcher",
    "campaignRadar",
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

  for (const item of items) {
    const li = document.createElement("li");

    const head = document.createElement("div");
    head.className = "watchlist-head";
    const title = document.createElement("span");
    title.className = "watchlist-title";
    title.textContent = item.title ?? item.asin;
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
    head.append(title, remove);
    li.append(head);

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
