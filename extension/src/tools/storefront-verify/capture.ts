import { parseStoreIdFromText } from "../cc-messages/session";
import { sendToBackground, type HudCommandResult } from "../../shared/messages";
import { log } from "../../shared/log";

// Silent background push behind the desktop app's "Verify with extension"
// button next to the CC Storefront ID field: the desktop opens this Creator
// Connections page and asks the extension to read the creator's off-site
// Amazon Associates tag off it and push it back over the local bridge. No UI
// of its own (mirrors tools/audio-suppressed and tools/reach's report.batch
// shape) -- the desktop surfaces its own "Verified via extension" confirmation
// and auto-fills the field once the push lands.
//
// The page's own header shows "StoreID: littleprettyl-20", and the same value
// rides as the `storeid` header on the page's /connect/api/* calls. Both are
// already captured for tools/cc-messages (content/connect-hook.ts's MAIN-world
// shim publishes the header value via the "ib-ext-cc-session" event; session.ts's
// parseStoreIdFromText is the page-text fallback), so this reuses that
// proven-live source instead of hunting for a SiteStripe store-id <select> that
// may or may not be present on this particular page.

// Real off-site Associates tags end in a 2-digit marketplace suffix (-20 NA,
// -21 EU, -22 Far East). Amazon's internal on-site id can carry the very same
// suffix shape (e.g. "onamzdavi039-20"), so the onamz prefix must be excluded
// too -- there is nothing to verify yet when that is all the page shows.
const OFFSITE_TAG_RE = /^(?!onamz)[a-z0-9_.-]+-\d{2}$/i;

function isEligibleHandle(storeId: string): boolean {
  return OFFSITE_TAG_RE.test(storeId.trim());
}

// The handle already pushed for this page view, so a late mutation or a
// repeated session event never re-sends (the desktop side is idempotent
// anyway, but there is no reason to hammer it).
let sentFor: string | null = null;
let stopListening: (() => void) | null = null;
let timers: number[] = [];

function pushHandle(handle: string): void {
  if (sentFor === handle) return;
  sentFor = handle;
  log("storefront-verify", "pushing CC storefront id to the desktop app", { handle });
  void sendToBackground<HudCommandResult>({
    kind: "SEND_HUD_COMMAND",
    command: { type: "storefront.verify", handle },
  }).catch(() => {
    // Not paired / app closed: nothing to verify against this pass. The
    // desktop's own button already told the user to pair first.
  });
}

function checkPageText(): void {
  if (sentFor) return;
  let text = "";
  try {
    text = document.body?.innerText?.slice(0, 20000) ?? "";
  } catch {
    text = "";
  }
  const storeId = parseStoreIdFromText(text);
  if (storeId && isEligibleHandle(storeId)) pushHandle(storeId);
}

function onSessionEvent(event: Event): void {
  if (sentFor) return;
  const detail = (event as CustomEvent<{ storeId?: string }>).detail;
  const storeId = (detail?.storeId || "").trim();
  if (storeId && isEligibleHandle(storeId)) pushHandle(storeId);
}

// Run once per Creator Connections page view (the campaign grid or a single
// campaign's detail page both carry the same header). Callers run this inside
// runForPage's existing teardown-then-reinit cycle, so a stale listener from
// the previous view is always cleared first.
export function initStorefrontVerify(): void {
  stopStorefrontVerify();
  sentFor = null;
  document.addEventListener("ib-ext-cc-session", onSessionEvent);
  stopListening = () => document.removeEventListener("ib-ext-cc-session", onSessionEvent);
  checkPageText();
  // The header text can render a moment after document_idle (SPA hydration),
  // and the hook's first request may land a little later still; a couple of
  // delayed re-checks cover that without holding an indefinite observer open.
  timers.push(window.setTimeout(checkPageText, 1500));
  timers.push(window.setTimeout(checkPageText, 4000));
}

export function stopStorefrontVerify(): void {
  stopListening?.();
  stopListening = null;
  for (const id of timers) window.clearTimeout(id);
  timers = [];
}
