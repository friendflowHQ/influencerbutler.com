import { getSettings, getState, patchSettings, patchState } from "../storage/store";
import { setLocale, t } from "../i18n";
import { sendToBackground, type AuthStatus, type PairResult, type SignInResult } from "../shared/messages";
import { API_BASE } from "../shared/constants";
import type { Settings } from "../storage/schema";
import { isPairedLocal } from "../shared/bridge-token";
import { runSyncReconcile, autoFillFromDesktop } from "../tools/settings-sync/ui";

// First-run walkthrough page (opened on fresh install, replayable from the
// popup). A small stepped wizard modeled on the desktop app's first-run dialog:
// welcome, connect account, storefront, tools, connect the desktop app, done.
// Every step writes real settings through the store, so a user who quits partway
// keeps whatever they set; progress is persisted so a reopen resumes.

const STEPS = ["welcome", "account", "storefront", "tools", "app", "done"] as const;
type Step = (typeof STEPS)[number];

// The tool flags offered on the tools step, mapped to their checkbox ids.
const TOOL_KEYS: Array<keyof Settings["tools"]> = [
  "searchOverlay",
  "videoCounts",
  "approved",
  "calculator",
  "storefront",
  "campaignRadar",
  "earningsOverlay",
  "walmart",
];

let index = 0;

void init();

async function init(): Promise<void> {
  const state = await getState();
  setLocale(state.settings.locale);
  applyStaticI18n();

  // Resume where the user left off (unless they already finished, in which case a
  // replay starts clean at the top).
  index = state.onboarding.completedAt ? 0 : clampIndex(state.onboarding.stepIndex);

  await Promise.all([wireAccount(), wireStorefront(), wireTools(), wireApp()]);
  wireDoneLinks();
  wireFooter();
  render();
}

function clampIndex(i: number): number {
  if (!Number.isFinite(i) || i < 0) return 0;
  return Math.min(Math.floor(i), STEPS.length - 1);
}

function stepEl(step: Step): HTMLElement {
  return document.querySelector<HTMLElement>(`.ob-step[data-step="${step}"]`) as HTMLElement;
}

function render(): void {
  const current = STEPS[index];
  for (const step of STEPS) stepEl(step).hidden = step !== current;

  const fill = document.getElementById("ob-progress-fill") as HTMLElement;
  fill.style.width = `${((index + 1) / STEPS.length) * 100}%`;
  (document.getElementById("ob-progress-label") as HTMLElement).textContent = t().obProgress(
    index + 1,
    STEPS.length,
  );

  const back = document.getElementById("ob-back") as HTMLButtonElement;
  const skip = document.getElementById("ob-skip") as HTMLButtonElement;
  const next = document.getElementById("ob-next") as HTMLButtonElement;
  back.disabled = index === 0;
  skip.hidden = current === "done";
  next.textContent = current === "done" ? t().obFinish : t().obNext;

  // Reflect live state when a step becomes visible.
  if (current === "storefront") void refreshStorefront();
  if (current === "app") void refreshApp();

  void persistStepIndex(index);
}

async function persistStepIndex(i: number): Promise<void> {
  await patchState((s) => {
    s.onboarding.stepIndex = i;
  });
}

function wireFooter(): void {
  (document.getElementById("ob-back") as HTMLButtonElement).onclick = () => {
    if (index > 0) {
      index -= 1;
      render();
    }
  };
  (document.getElementById("ob-next") as HTMLButtonElement).onclick = () => {
    if (STEPS[index] === "done") {
      void finish(false);
      return;
    }
    index += 1;
    render();
  };
  (document.getElementById("ob-skip") as HTMLButtonElement).onclick = () => void finish(true);
}

async function finish(skipped: boolean): Promise<void> {
  await patchState((s) => {
    s.onboarding.completedAt = Date.now();
    s.onboarding.skipped = skipped;
    s.onboarding.stepIndex = 0;
  });
  // Extension pages opened by the background can close themselves; if the browser
  // refuses (rare), the done screen stays up, which is a fine resting state.
  try {
    window.close();
  } catch {
    /* leave the page as-is */
  }
}

// --- Account step -----------------------------------------------------------

async function wireAccount(): Promise<void> {
  const connect = document.getElementById("ob-connect-btn") as HTMLButtonElement;
  const input = document.getElementById("ob-license-input") as HTMLInputElement;
  const errorEl = document.getElementById("ob-auth-error") as HTMLElement;
  connect.onclick = async () => {
    const licenseKey = input.value.trim();
    if (!licenseKey) return;
    connect.disabled = true;
    errorEl.hidden = true;
    const result = await sendToBackground<SignInResult>({ kind: "SIGN_IN", licenseKey });
    connect.disabled = false;
    if (result.ok) {
      input.value = "";
      await refreshAccount();
    } else {
      errorEl.hidden = false;
      errorEl.textContent = result.error ?? t().licenseDidNotVerify;
    }
  };
  await refreshAccount();
}

async function refreshAccount(): Promise<void> {
  const auth = await sendToBackground<AuthStatus>({ kind: "GET_AUTH_STATUS" });
  const signedOut = document.getElementById("ob-account-signedout") as HTMLElement;
  const signedIn = document.getElementById("ob-account-signedin") as HTMLElement;
  if (auth.signedIn) {
    signedOut.hidden = true;
    signedIn.hidden = false;
    signedIn.textContent = t().obAccountConnected(auth.email ?? "");
  } else {
    signedOut.hidden = false;
    signedIn.hidden = true;
  }
}

// --- Storefront step --------------------------------------------------------

async function wireStorefront(): Promise<void> {
  const input = document.getElementById("ob-storefront-input") as HTMLInputElement;
  input.onchange = () => void patchSettings({ storefrontHandle: input.value.trim() || null });
  await refreshStorefront();
}

async function refreshStorefront(): Promise<void> {
  const input = document.getElementById("ob-storefront-input") as HTMLInputElement;
  const detected = document.getElementById("ob-storefront-detected") as HTMLElement;
  const handle = (await getSettings()).storefrontHandle;
  // Do not stomp a value the user is mid-edit; only sync when they have not typed.
  if (document.activeElement !== input) input.value = handle ?? "";
  if (handle) {
    detected.hidden = false;
    detected.textContent = t().obStorefrontDetected(handle);
  } else {
    detected.hidden = true;
  }
}

// --- Tools step -------------------------------------------------------------

async function wireTools(): Promise<void> {
  const settings = await getSettings();
  for (const key of TOOL_KEYS) {
    const box = document.getElementById(`ob-tool-${key}`) as HTMLInputElement | null;
    if (!box) continue;
    box.checked = settings.tools[key];
    box.onchange = async () => {
      const current = await getSettings();
      await patchSettings({ tools: { ...current.tools, [key]: box.checked } });
    };
  }
}

// --- Desktop app step -------------------------------------------------------

async function wireApp(): Promise<void> {
  const status = document.getElementById("ob-app-status") as HTMLElement;

  (document.getElementById("ob-app-connect-btn") as HTMLButtonElement).onclick = async () => {
    status.textContent = t().appRequestingCode;
    const r = await sendToBackground<PairResult>({ kind: "REQUEST_PAIRING" });
    if (r.ok && r.stage === "pending") {
      showAppState("pairing");
      status.textContent = t().appCodeShown;
      (document.getElementById("ob-app-code-input") as HTMLInputElement).focus();
    } else {
      status.textContent = r.message ?? t().appNotRunning;
    }
  };

  (document.getElementById("ob-app-pair-submit") as HTMLButtonElement).onclick = async () => {
    const code = (document.getElementById("ob-app-code-input") as HTMLInputElement).value.trim();
    if (!/^\d{6}$/.test(code)) {
      status.textContent = t().appCodeInvalid;
      return;
    }
    status.textContent = t().appPairing;
    const r = await sendToBackground<PairResult>({ kind: "SUBMIT_PAIRING_CODE", code });
    if (r.ok && r.stage === "paired") {
      showAppState("connected");
      status.textContent = t().appPaired;
      void offerSyncAfterPair();
    } else {
      status.textContent = r.message ?? t().appPairFailed;
    }
  };

  (document.getElementById("ob-sync-offer-btn") as HTMLButtonElement).onclick = () => {
    const s = document.getElementById("ob-sync-offer-status") as HTMLElement;
    void runSyncReconcile(s);
  };
}

async function refreshApp(): Promise<void> {
  const paired = await isPairedLocal();
  showAppState(paired ? "connected" : "disconnected");
  if (paired) void offerSyncAfterPair();
}

function showAppState(state: "disconnected" | "pairing" | "connected"): void {
  (document.getElementById("ob-app-disconnected") as HTMLElement).hidden = state !== "disconnected";
  (document.getElementById("ob-app-pairing") as HTMLElement).hidden = state !== "pairing";
  (document.getElementById("ob-app-connected") as HTMLElement).hidden = state !== "connected";
}

// After pairing, do the non-destructive auto-fill (empty fields only) and, if
// the two sides still differ, reveal a "Sync now" offer that opens the reconcile
// confirm. Mirrors the popup's Desktop-app card behavior.
async function offerSyncAfterPair(): Promise<void> {
  const offer = document.getElementById("ob-sync-offer") as HTMLElement;
  const text = document.getElementById("ob-sync-offer-text") as HTMLElement;
  const result = await autoFillFromDesktop();
  if (!result) {
    offer.hidden = true;
    return;
  }
  if (result.filled > 0) {
    text.textContent = t().syncFilled(result.filled);
  } else {
    text.textContent = t().syncBlurb;
  }
  // Show the reconcile button only when a real difference remains after the fill.
  offer.hidden = result.remainingDiffs === 0;
}

// --- Done step --------------------------------------------------------------

function wireDoneLinks(): void {
  (document.getElementById("ob-done-help") as HTMLAnchorElement).href = `${API_BASE}/extension`;
  (document.getElementById("ob-done-dashboard") as HTMLAnchorElement).href = `${API_BASE}/dashboard/extension`;
}

// --- i18n -------------------------------------------------------------------

function applyStaticI18n(): void {
  const dict = t() as unknown as Record<string, unknown>;
  for (const node of Array.from(document.querySelectorAll<HTMLElement>("[data-i18n]"))) {
    const value = dict[node.dataset.i18n ?? ""];
    if (typeof value === "string") node.textContent = value;
  }
  for (const node of Array.from(document.querySelectorAll<HTMLElement>("[data-i18n-ph]"))) {
    const value = dict[node.dataset.i18nPh ?? ""];
    if (typeof value === "string") {
      (node as HTMLInputElement).placeholder = value;
    }
  }
}
