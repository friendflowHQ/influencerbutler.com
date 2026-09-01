import { t } from "../../i18n";
import { sendToBackground } from "../../shared/messages";
import type { HudCommandResult } from "../../shared/messages";
import type { ProductRef, HudCommand } from "../../transport/hud-commands";
import type { ProductSignals } from "../../amazon/product-signals";
import { canonicalProductUrl } from "../../integrations/url";

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
  return {
    asin: signals.asin as string,
    marketplace: signals.marketplace,
    title: signals.title?.slice(0, 200),
    priceCents: signals.priceCents,
    currency: signals.currency,
    imageUrl: signals.imageUrl ?? undefined,
    commissionRatePct: signals.commissionRatePct,
    url: url || undefined,
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
): (command: HudCommand, pending: string) => void {
  return (command, pending) => {
    status.textContent = pending;
    disableAll(body, true);
    void sendToBackground<HudCommandResult>({ kind: "SEND_HUD_COMMAND", command })
      .then((result) => {
        disableAll(body, false);
        if (result.ok) {
          status.textContent = result.message ?? t().sentToApp;
        } else if (result.needsPairing) {
          // The app answered but the extension is not paired, so the command was
          // never sent. Without this, an unpaired click just looked like nothing
          // happened. Point the user at the popup pairing flow.
          status.textContent = t().connectAppToPair;
        } else {
          status.textContent = result.message ?? t().couldNotReachApp;
        }
      })
      // A rejected sendMessage (routine when the MV3 service worker was
      // terminated mid-request) must not leave the buttons stuck disabled.
      .catch(() => {
        disableAll(body, false);
        status.textContent = t().couldNotReachApp;
      });
  };
}
