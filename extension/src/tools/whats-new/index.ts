import { showWhatsNewCard } from "../../ui/whats-new-card";
import { sendToBackground, type WhatsNewView } from "../../shared/messages";

// Content-side driver for the post-update "What's New" corner card. Asks the
// background what changed in the running version and, when a notice is due,
// shows the card. Dismissing advances the stored "last shown version" so the
// notice stops on this surface and in the popup.

let ran = false;

export async function maybeShowWhatsNew(): Promise<void> {
  if (ran) return; // singleton per page load; SPA re-runs are no-ops
  ran = true;

  const view = await sendToBackground<WhatsNewView>({ kind: "GET_WHATS_NEW" }).catch(() => null);
  if (!view?.show) return;

  // The corner card shows features, fixes, and resolved reports; "Other Notable
  // Changes" is popup-only.
  const cardContent = view.features.length || view.fixes.length || view.reportedBugs.length;
  const anyContent = cardContent || view.other.length;
  if (!anyContent) {
    // A notice is due but this build shipped no changelog highlights and the
    // user has no resolved reports: self-heal by marking it seen so we do not
    // re-query on every page for nothing.
    void sendToBackground<void>({ kind: "DISMISS_WHATS_NEW" }).catch(() => {});
    return;
  }
  // Popup-only content (only "Other Notable Changes"): leave the notice for the
  // popup rather than showing an empty corner card or dismissing it here.
  if (!cardContent) return;

  showWhatsNewCard(view, {
    onDismiss: () => {
      void sendToBackground<void>({ kind: "DISMISS_WHATS_NEW" }).catch(() => {});
    },
  });
}
