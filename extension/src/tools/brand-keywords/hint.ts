// The "open the desktop app" hint for the Creator Connections Messages drawer.
//
// Brand Keywords draws nothing unless the extension is paired to the desktop
// app AND the app is running: both the keyword lookup and the inbound-brand
// enrichment lookup come back empty over a dead bridge. That used to fail
// completely silently, so a creator with the app closed saw a bare drawer and
// no reason why. This mounts one small, dismissible banner at the top of the
// drawer telling them the app is the missing piece. It self-clears the moment
// the app becomes reachable (the overlay calls removeAppHint on a good fetch).

import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";

export const HINT_HOST_CLASS = "bkw-hint-host";

// Where the dismissal deadline is stored. A bare chrome.storage.local key (not
// part of the settings schema), like the notify cursor: it is a UI-nag timer,
// not a setting the options page shows.
const DISMISS_KEY = "ib-bkw-hint-dismissed-until";
// After the creator dismisses the hint, stay quiet this long before it may
// reappear. Opening the app hides it far sooner (removeAppHint on a live
// fetch); this only bounds the case where they keep the app closed on purpose.
const SUPPRESS_MS = 7 * 24 * 60 * 60 * 1000;

// Mount the banner at the very top of the Messages widget. Only one may exist
// at a time, so a re-entrant sweep that calls this again is a no-op. `paired`
// picks the verb: an unpaired install must connect first, a paired one just
// needs the app running.
export function mountAppHint(
  widget: HTMLElement,
  opts: { paired: boolean },
  onDismiss: () => void,
): void {
  if (widget.querySelector(`.${HINT_HOST_CLASS}`)) return;
  const { host, root } = createInlineShadow(HINT_HOST_CLASS);
  const bar = el("div", "bkw-hint");

  const text = el(
    "span",
    "bkw-hint-text",
    opts.paired
      ? "Open the InfluencerButler desktop app to see keyword and commission insights on these conversations."
      : "Connect the InfluencerButler desktop app to see keyword and commission insights on these conversations.",
  );

  const dismiss = el("button", "bkw-hint-x", "×"); // multiplication sign
  dismiss.type = "button";
  dismiss.title = "Dismiss";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    removeAppHint();
    void suppressHint();
    onDismiss();
  });

  bar.append(el("span", "bkw-hint-glyph", "🖥️"), text, dismiss);
  root.append(bar);
  // Prepend so it sits above the conversation list / open thread. The host is a
  // shadow host with no light-DOM text, so the row/timestamp scanners in
  // selectors.ts skip right over it.
  widget.insertBefore(host, widget.firstChild);
}

export function removeAppHint(): void {
  for (const node of Array.from(document.querySelectorAll(`.${HINT_HOST_CLASS}`))) {
    node.remove();
  }
}

// The timestamp before which the hint stays suppressed (0 = never dismissed).
// Read once per init; failures are treated as "not suppressed".
export async function readHintSuppressedUntil(): Promise<number> {
  try {
    const got = await chrome.storage.local.get(DISMISS_KEY);
    const value = got?.[DISMISS_KEY];
    return typeof value === "number" ? value : 0;
  } catch {
    return 0;
  }
}

async function suppressHint(): Promise<void> {
  try {
    await chrome.storage.local.set({ [DISMISS_KEY]: Date.now() + SUPPRESS_MS });
  } catch {
    // Storage blocked: the in-memory per-page guard still stops it re-mounting
    // this visit; it may simply reappear next visit.
  }
}
