import { UPDATE_REMIND_MS, UPDATE_STORAGE_KEY } from "../shared/constants";
import { log } from "../shared/log";

// Extension self-update awareness. Chrome checks the Web Store on its own every
// few hours and, in MV3, applies a staged update shortly after this worker goes
// idle; registering onUpdateAvailable does not defer that. So this module only
// records what is pending so the on-page banner and popup card can tell the
// user, offer "Update now" (an immediate reload), and ask them to refresh open
// Amazon tabs afterwards (Chrome never re-injects content scripts into tabs
// that are already open).

export type UpdateState = {
  availableVersion: string;
  detectedAt: number;
  // null until the user clicks "Remind me later"; then the banner stays hidden
  // until this timestamp passes. A newer staged version clears the snooze.
  remindAfter: number | null;
};

// What the banner and popup render from. `due` folds in the snooze and the
// "already applied" housekeeping so the UI never re-derives either.
export type UpdateStateView = {
  due: boolean;
  availableVersion: string | null;
  currentVersion: string;
};

// Numeric dotted compare ("0.1.10" > "0.1.9"). Missing segments count as 0, so
// "1.0" equals "1.0.0". Returns <0, 0, >0 like a comparator.
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function updateDue(
  state: UpdateState | null,
  currentVersion: string,
  now: number,
): boolean {
  if (!state?.availableVersion) return false;
  if (compareVersions(state.availableVersion, currentVersion) <= 0) return false; // already applied
  if (state.remindAfter !== null && now < state.remindAfter) return false; // snoozed
  return true;
}

async function readState(): Promise<UpdateState | null> {
  try {
    const out = await chrome.storage.local.get(UPDATE_STORAGE_KEY);
    const value = out?.[UPDATE_STORAGE_KEY] as UpdateState | undefined;
    if (!value || typeof value.availableVersion !== "string") return null;
    return {
      availableVersion: value.availableVersion,
      detectedAt: typeof value.detectedAt === "number" ? value.detectedAt : 0,
      remindAfter: typeof value.remindAfter === "number" ? value.remindAfter : null,
    };
  } catch {
    return null;
  }
}

async function writeState(state: UpdateState): Promise<void> {
  try {
    await chrome.storage.local.set({ [UPDATE_STORAGE_KEY]: state });
  } catch {
    // storage unavailable; the next detection simply writes again
  }
}

// Called from the top-level onUpdateAvailable listener and the periodic check.
// Re-detecting the same version keeps an existing snooze; a newer version
// resets it so the banner comes back for the fresh release.
export async function noteUpdateAvailable(version: string): Promise<void> {
  if (!version) return;
  const prev = await readState();
  const remindAfter = prev?.availableVersion === version ? prev.remindAfter : null;
  await writeState({ availableVersion: version, detectedAt: Date.now(), remindAfter });
  log("update", `update staged -> ${version}`);
}

// Periodic check, piggybacked on the catalogue alarm. Chrome injects
// update_url into the manifest only for store-packaged installs, so unpacked
// dev builds never even ask (the answer would always be no_update). "throttled"
// and "no_update" are silent no-ops; onUpdateAvailable covers us regardless.
export async function checkForUpdate(): Promise<void> {
  if (!chrome.runtime.getManifest().update_url) return;
  try {
    const result = await chrome.runtime.requestUpdateCheck();
    if (result.status === "update_available" && result.version) {
      await noteUpdateAvailable(result.version);
    }
  } catch (error) {
    log("update", "requestUpdateCheck failed", error);
  }
}

export async function getUpdateStateView(): Promise<UpdateStateView> {
  const currentVersion = chrome.runtime.getManifest().version;
  const state = await readState();
  // Housekeeping: once the running version has caught up, the record is stale.
  if (state && compareVersions(state.availableVersion, currentVersion) <= 0) {
    try {
      await chrome.storage.local.remove(UPDATE_STORAGE_KEY);
    } catch {
      // ignore; updateDue treats it as not due either way
    }
    return { due: false, availableVersion: null, currentVersion };
  }
  return {
    due: updateDue(state, currentVersion, Date.now()),
    availableVersion: state?.availableVersion ?? null,
    currentVersion,
  };
}

export async function remindUpdateLater(): Promise<void> {
  const state = await readState();
  if (!state) return;
  await writeState({ ...state, remindAfter: Date.now() + UPDATE_REMIND_MS });
}

// Applies the staged update immediately by restarting the extension. This
// kills the service worker, so callers must respond to their message first and
// fire-and-forget this.
export function applyUpdate(): void {
  chrome.runtime.reload();
}
