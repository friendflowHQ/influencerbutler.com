import {
  sendToBackground,
  type AuthStatus,
  type FeedbackInput,
  type FeedbackResult,
  type PageStatus,
  type SignInResult,
} from "../shared/messages";
import { getSettings, patchSettings } from "../storage/store";
import type { Settings } from "../storage/schema";
import { setLocale, t } from "../i18n";

// Popup: page status via the active tab's content script, account sign-in via
// the background, settings straight to storage (content scripts pick changes
// up on the next page view).

void init();

async function init(): Promise<void> {
  const settings = await getSettings();
  setLocale(settings.locale);
  applyStaticI18n();
  await Promise.all([renderPageStatus(), renderAccount(), renderSettings()]);
  wireFeedback();
  wireOptions();
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

  for (const tool of ["videoCounts", "approved", "calculator", "storefront", "ordersButler"] as const) {
    const box = byId<HTMLInputElement>(`tool-${tool}`);
    box.checked = settings.tools[tool];
    box.onchange = async () => {
      const current = await getSettings();
      await patchSettings({ tools: { ...current.tools, [tool]: box.checked } });
    };
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
