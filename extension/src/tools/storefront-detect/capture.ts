import { readStorefrontHandle } from "../../amazon/creator-hub";
import { getState, patchState } from "../../storage/store";
import { showToast } from "../../ui/toast";
import { t } from "../../i18n";
import { log } from "../../shared/log";

// Auto-detect the creator's own Amazon storefront handle from their Creator Hub
// and save it to settings.storefrontHandle when that field is still empty. The
// handle drives the US affiliate tag fallback and the storefront checks, and
// asking the user to hunt for it in the /shop/ URL is friction we can remove:
// readStorefrontHandle already reads it off the signed-in Creator Hub chrome.
//
// Non-destructive by design: a hand-typed handle is never overwritten. The
// auto-fill itself re-runs whenever the field is empty (so clearing it re-detects
// on the next Creator Hub visit), but the "Detected your storefront" toast shows
// at most once, gated on the hints.storefrontAutofill stamp.
export async function maybeCaptureStorefrontHandle(): Promise<void> {
  const detected = readStorefrontHandle(document);
  if (!detected) return;

  const state = await getState();
  const current = state.settings.storefrontHandle;
  if (typeof current === "string" && current.trim()) return; // never clobber a set handle

  const firstTime = state.hints.storefrontAutofill === null;
  await patchState((s) => {
    s.settings.storefrontHandle = detected;
    if (firstTime) s.hints.storefrontAutofill = Date.now();
  });
  log("storefront-detect", "captured storefront handle", { handle: detected, firstTime });

  if (firstTime) {
    showToast({
      title: t().storefrontDetectedTitle,
      message: t().storefrontDetectedBody(detected),
      closeLabel: t().nudgeCloseLabel,
    });
  }
}
