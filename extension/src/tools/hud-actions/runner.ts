import { t } from "../../i18n";
import { sendToBackground } from "../../shared/messages";
import type { HudCommandResult } from "../../shared/messages";
import type { ProductRef, HudCommand } from "../../transport/hud-commands";
import type { ProductSignals } from "../../amazon/product-signals";
import { canonicalProductUrl } from "../../integrations/url";
import { showToast } from "../../ui/toast";

// Shared plumbing for panels that send HudCommands to the desktop app (the
// Send-to-app section and the Campaigns section's inline Accept buttons).

export function toProductRef(signals: ProductSignals): ProductRef {
  // Send the canonical product url so the desktop persists the correct link per
  // retailer (Walmart /ip/, Amazon /dp/) instead of synthesizing an Amazon /dp/
  // url from the id, which is wrong for Walmart.
  const retailer = signals.marketplace.includes("walmart") ? "walmart" : "amazon";
  const url = signals.asin
    ? canonicalProductUrl(signals.asin, signals.marketplace, "", retailer)
    : undefined;
  // A Walmart rollback's was price, so the desktop can fill the "was $X" and
  // "N% off" caption lines (it only back-fills them from a live offer lookup
  // for Amazon). Walmart only: Amazon pushes keep their desktop-side enrichment.
  const originalPrice =
    retailer === "walmart" &&
    signals.listPriceCents != null &&
    signals.priceCents != null &&
    signals.listPriceCents > signals.priceCents
      ? signals.listPriceCents / 100
      : undefined;
  return {
    asin: signals.asin as string,
    marketplace: signals.marketplace,
    title: signals.title?.slice(0, 200),
    // Carry the scraped brand so the desktop can pre-fill the Content Butler /
    // Collab card's Brand field instead of leaving it blank.
    brand: signals.brand?.slice(0, 120) ?? undefined,
    priceCents: signals.priceCents,
    currency: signals.currency,
    imageUrl: signals.imageUrl ?? undefined,
    commissionRatePct: signals.commissionRatePct,
    url: url || undefined,
    ...(originalPrice !== undefined ? { originalPrice } : {}),
  };
}

export function disableAll(root: HTMLElement, disabled: boolean): void {
  for (const btn of Array.from(root.querySelectorAll("button"))) {
    (btn as HTMLButtonElement).disabled = disabled;
  }
}

// Builds the click handler used by every command button: shows pending text,
// disables the panel's buttons while in flight, and reports the app's answer
// (or the pairing hint / unreachable fallback) in the status line.
export function makeCommandRunner(
  body: HTMLElement,
  status: HTMLElement,
  // Buttons/selects to disable alongside `body`'s own buttons, for a control
  // that triggers a command but does not live inside `body` (the Deals Butler
  // push now sits in the pinned quick-links bar, not this section's body).
  extraControls: Array<HTMLButtonElement | HTMLSelectElement> = [],
): (command: HudCommand, pending: string) => void {
  // A failed command only wrote to the small status line under the buttons,
  // which scrolls out of view on a tall panel, so a click that didn't go
  // through (app not running, unpaired, no image key) read as "nothing
  // happened". Raise the same reason into a toast as well.
  const failToast = (message: string) => {
    showToast({
      title: t().actionFailedTitle,
      message,
      closeLabel: t().nudgeCloseLabel,
    });
  };
  const setExtraDisabled = (disabled: boolean): void => {
    for (const control of extraControls) control.disabled = disabled;
  };
  return (command, pending) => {
    status.textContent = pending;
    disableAll(body, true);
    setExtraDisabled(true);
    void sendToBackground<HudCommandResult>({ kind: "SEND_HUD_COMMAND", command })
      .then((result) => {
        disableAll(body, false);
        setExtraDisabled(false);
        if (result.ok) {
          status.textContent = result.message ?? t().sentToApp;
        } else if (result.needsPairing) {
          // The app answered but the extension is not paired, so the command was
          // never sent. Without this, an unpaired click just looked like nothing
          // happened. Point the user at the popup pairing flow.
          status.textContent = t().connectAppToPair;
          failToast(t().connectAppToPair);
        } else {
          const message = result.message ?? t().couldNotReachApp;
          status.textContent = message;
          failToast(message);
        }
      })
      // A rejected sendMessage (routine when the MV3 service worker was
      // terminated mid-request) must not leave the buttons stuck disabled.
      .catch(() => {
        disableAll(body, false);
        setExtraDisabled(false);
        status.textContent = t().couldNotReachApp;
        failToast(t().couldNotReachApp);
      });
  };
}
