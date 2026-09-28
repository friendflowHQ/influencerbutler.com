import { buildSyncPayload, writeSyncPayload } from "./integrations";
import { fetchDesktopSettings, isPaired, pushDesktopSettings } from "./hud-bridge";
import { diffPayloads, fillEmpty, overwriteWith } from "../tools/settings-sync/merge";
import { onStateChange } from "../storage/store";
import { log } from "../shared/log";
import type { StorageShape } from "../storage/schema";
import type { SyncApplyResult, SyncPreviewResult } from "../shared/messages";

// Orchestrates settings sync with the paired desktop app. Lives in the background
// because it reads/writes decrypted credentials (via integrations.ts) and drives
// the loopback bridge (hud-bridge.ts). The pure merge decisions are in
// tools/settings-sync/merge.ts; nothing here touches the network except the two
// bridge calls, which are local-only.

// The non-destructive pass, run on pairing / reconnect and behind "Sync now".
// Pulls the desktop settings, fills only the extension's EMPTY fields from them,
// pushes the extension's values to fill the desktop's empty fields, and reports
// which fields still genuinely differ (a conflict the user must resolve).
export async function previewSync(): Promise<SyncPreviewResult> {
  const desktop = await fetchDesktopSettings();
  if (desktop.status !== "ok") {
    return { status: desktop.status, filled: 0, pushed: 0, diffs: [] };
  }
  const ext = await buildSyncPayload();

  const { merged, filled } = fillEmpty(ext, desktop.payload);
  if (filled > 0) await writeSyncPayload(merged);

  // Fill the desktop's empty fields from the extension (non-destructive).
  const push = await pushDesktopSettings(ext, "fill");
  const pushed = push.status === "ok" ? push.applied : 0;

  const diffs = diffPayloads(merged, desktop.payload);
  log("settings-sync", "preview", { filled, pushed, diffs: diffs.length });
  return { status: "ok", filled, pushed, diffs };
}

// The reconcile pass behind the "are you sure" confirm. "app-wins" overwrites the
// extension's conflicting values with the desktop's (and still fills the desktop's
// gaps from the extension); "ext-wins" pushes the extension's values over the
// desktop's (and fills the extension's gaps from the desktop).
export async function applySync(direction: "app-wins" | "ext-wins"): Promise<SyncApplyResult> {
  const desktop = await fetchDesktopSettings();
  if (desktop.status !== "ok") return { status: desktop.status, changed: 0 };
  const ext = await buildSyncPayload();

  if (direction === "app-wins") {
    const { merged, changed } = overwriteWith(ext, desktop.payload);
    await writeSyncPayload(merged);
    // Give the desktop anything only the extension had (non-destructive).
    await pushDesktopSettings(merged, "fill");
    log("settings-sync", "apply app-wins", { changed });
    return { status: "ok", changed };
  }

  // ext-wins: the desktop overwrites its conflicting values with the extension's.
  const push = await pushDesktopSettings(ext, "overwrite");
  if (push.status !== "ok") return { status: push.status, changed: 0 };
  // Pull anything only the desktop had into the extension (non-destructive).
  const { merged, filled } = fillEmpty(ext, desktop.payload);
  if (filled > 0) await writeSyncPayload(merged);
  log("settings-sync", "apply ext-wins", { changed: push.applied });
  return { status: "ok", changed: push.applied };
}

// Best-effort, non-destructive push of the extension's settings to a running
// desktop app when a setting changes locally. A no-op when not paired or the app
// is not running; only fills the desktop's empty fields (never overwrites).
export async function pushSettingsToDesktopIfPaired(): Promise<void> {
  if (!(await isPaired())) return;
  const ext = await buildSyncPayload();
  await pushDesktopSettings(ext, "fill");
}

// A fingerprint of just the syncable fields, so a change to some unrelated slice
// (price history, cache, watchlist) does not trigger a push. Storefront handle
// plus the whole integrations slice (provider blobs included) covers everything
// buildSyncPayload reads.
function syncableFingerprint(state: StorageShape): string {
  return JSON.stringify({
    storefront: state.settings.storefrontHandle,
    integrations: state.integrations,
  });
}

// Wire a debounced extension -> desktop push on any change to the syncable
// settings. Called once at background startup. Guarded so most installs (never
// paired) do almost no work: the fingerprint compare is local, and the push
// itself short-circuits on isPaired().
export function initSettingsSyncOnChange(): void {
  let last: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  onStateChange((state) => {
    const fp = syncableFingerprint(state);
    if (last === null) {
      last = fp; // first observation: establish the baseline, do not push
      return;
    }
    if (fp === last) return;
    last = fp;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void pushSettingsToDesktopIfPaired();
    }, 4000);
  });
}
