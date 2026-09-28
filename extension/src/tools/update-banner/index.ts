import {
  flipToRefreshPhase,
  isUpdateBannerMounted,
  removeUpdateBanner,
  showUpdateBanner,
} from "../../ui/banner";
import { sendToBackground, type UpdateStateView } from "../../shared/messages";
import { UPDATE_STORAGE_KEY } from "../../shared/constants";
import type { UpdateState } from "../../background/update";

// Content-side driver for the extension-update pill. Asks the background what
// Chrome has staged and, when an update is due (not snoozed, not yet applied),
// shows the banner. Once the update applies (our button, another tab, or
// Chrome's own MV3 auto-apply when the worker idles), this content script is
// orphaned: chrome.runtime.id disappears and messaging throws. The watcher
// below notices and flips the banner to its "refresh to finish" phase, which
// only needs page-local APIs.

// The update applies within a minute or two of being staged, so the orphan
// watcher never needs to run for long. Capped as a safety valve.
const WATCH_INTERVAL_MS = 5000;
const WATCH_MAX_TICKS = 360; // 30 minutes

let ran = false;

export async function maybeShowUpdateBanner(): Promise<void> {
  if (ran) return; // singleton per page load; SPA re-runs are no-ops
  ran = true;

  const view = await sendToBackground<UpdateStateView>({ kind: "GET_UPDATE_STATE" }).catch(
    () => null,
  );
  if (!view?.due || !view.availableVersion) return;

  showUpdateBanner(view.availableVersion, {
    onUpdate: () => {
      // Fire and forget: the background responds and then reloads itself, and
      // if the update already auto-applied this throws; either way the banner
      // flips to the refresh phase.
      void sendToBackground<void>({ kind: "APPLY_UPDATE" }).catch(() => {});
    },
    onLater: () => {
      void sendToBackground<void>({ kind: "UPDATE_REMIND_LATER" }).catch(() => {});
    },
  });

  watchForApply();
  watchOtherTabs();
}

// Flip to the refresh phase the moment our extension context dies, which is
// how "the update applied" looks from inside an orphaned content script.
function watchForApply(): void {
  let ticks = 0;
  const timer = window.setInterval(() => {
    ticks += 1;
    if (!isUpdateBannerMounted() || ticks > WATCH_MAX_TICKS) {
      window.clearInterval(timer);
      return;
    }
    if (!chrome.runtime?.id) {
      flipToRefreshPhase();
      window.clearInterval(timer);
    }
  }, WATCH_INTERVAL_MS);
}

// "Remind me later" clicked in another tab: hide this tab's banner too. The
// listener stops firing once this script is orphaned, which is fine; by then
// the watcher above wants the refresh phase anyway.
function watchOtherTabs(): void {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !(UPDATE_STORAGE_KEY in changes)) return;
      const next = changes[UPDATE_STORAGE_KEY]?.newValue as UpdateState | undefined;
      const snoozed =
        typeof next?.remindAfter === "number" && next.remindAfter > Date.now();
      if (snoozed && isUpdateBannerMounted()) removeUpdateBanner();
    });
  } catch {
    // storage events unavailable; the banner still behaves per-tab
  }
}
