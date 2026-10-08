import { log } from "../../shared/log";
import { showToast } from "../../ui/toast";
import {
  findConversationRows,
  findListRowBrandEl,
  findMessagesWidget,
  findThreadHeader,
  readThreadBrand,
} from "../brand-keywords/selectors";
import { lookupBrandEntry, summarizeBrand } from "./brand-index";
import { getIndex, loadStored } from "./data";
import { brandMatches, campaignDetailUrl, parseOpenHash } from "./open-target";

// Opens the conversation with one brand inside Creator Connections. Amazon has no
// thread URL, so this drives the same controls a creator would:
//   1. open the Messages drawer (the chat bubble), then click the brand's row;
//   2. when the drawer has no row for it (it lists at most 100), go to one of the
//      brand's campaign pages and press "Message brand", which opens that thread.
// Launcher and button selectors are the ones the desktop app's Messenger Butler
// uses against the same page (docs/developer/creator-connections-selectors.md in
// the desktop repo); the row and header readers are the shared widget selectors.

const LAUNCHER_SELECTORS = ["#t-ac-chat-icon", '[data-testid="t-ac-chat-portal"]'];
const MESSAGE_BRAND_BUTTON = '[data-testid="message-brand-btn"] button';
const WIDGET_WAIT_MS = 6000;
const ROWS_WAIT_MS = 4000;
const BUTTON_WAIT_MS = 12000;
const POLL_MS = 150;

export type OpenOutcome = "opened" | "navigating" | "not-found";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitFor<T>(read: () => T | null, timeoutMs: number): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() >= deadline) return null;
    await sleep(POLL_MS);
  }
}

// A real click needs the pointer events Amazon's React handlers listen for.
function pressElement(target: HTMLElement): void {
  target.scrollIntoView?.({ block: "center" });
  for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
}

function clickLauncher(): boolean {
  for (const selector of LAUNCHER_SELECTORS) {
    const node = document.querySelector<HTMLElement>(selector);
    if (!node) continue;
    pressElement(node.closest<HTMLElement>('button, [role="button"], a, [tabindex]') ?? node);
    return true;
  }
  return false;
}

// The pane stays mounted while closed, so "found" is not "open": require it to
// take up space on the page.
function visibleWidget(): HTMLElement | null {
  const widget = findMessagesWidget(document);
  return widget && widget.getClientRects().length > 0 ? widget : null;
}

function widgetHasContent(widget: HTMLElement): boolean {
  return findThreadHeader(widget) !== null || findConversationRows(widget).length > 0;
}

// The Messages panel with a conversation list (or an open thread) in it, opening
// it first when it is closed.
async function ensureDrawer(): Promise<HTMLElement | null> {
  let widget = visibleWidget();
  if (widget && widgetHasContent(widget)) return widget;
  if (!widget) {
    const clicked = await waitFor(() => (clickLauncher() ? true : null), WIDGET_WAIT_MS);
    if (!clicked) return null;
    widget = await waitFor(visibleWidget, WIDGET_WAIT_MS);
    if (!widget) return null;
  }
  const withContent = await waitFor(() => {
    const w = visibleWidget();
    return w && widgetHasContent(w) ? w : null;
  }, ROWS_WAIT_MS);
  if (withContent) return withContent;
  // Some sessions open the pane on a landing view with a "Messages" button.
  const pane = document.getElementById("t-ac-chat-pane");
  const messagesButton = Array.from(pane?.querySelectorAll<HTMLElement>("button") ?? []).find(
    (b) => (b.textContent ?? "").trim().toLowerCase() === "messages",
  );
  if (messagesButton) pressElement(messagesButton);
  return waitFor(() => {
    const w = visibleWidget();
    return w && widgetHasContent(w) ? w : null;
  }, ROWS_WAIT_MS);
}

function rowBrandEl(widget: HTMLElement, brand: string): HTMLElement | null {
  for (const row of findConversationRows(widget)) {
    const brandEl = findListRowBrandEl(row);
    if (brandEl && brandMatches(brandEl.textContent ?? "", brand)) return brandEl;
  }
  return null;
}

// Any campaign page of the brand (live ones first): the "Message brand" button on
// it opens the same conversation.
function campaignIdFor(brand: string): string | null {
  const entry = lookupBrandEntry(getIndex(), brand);
  if (!entry) return null;
  const live = summarizeBrand(entry, Date.now())?.bestCampaignId;
  if (live) return live;
  return entry.campaigns.find((c) => c.id)?.id ?? null;
}

export async function openBrandConversation(brand: string): Promise<OpenOutcome> {
  const widget = await ensureDrawer();
  if (widget) {
    const header = findThreadHeader(widget);
    if (header && brandMatches(readThreadBrand(header) ?? "", brand)) return "opened";
    const brandEl = rowBrandEl(widget, brand);
    if (brandEl) {
      brandEl.scrollIntoView?.({ block: "nearest" });
      // The brand name bubbles to whichever ancestor Amazon wired.
      brandEl.click();
      return "opened";
    }
  }
  const campaignId = campaignIdFor(brand);
  if (campaignId) {
    location.assign(campaignDetailUrl(location.origin, campaignId, brand));
    return "navigating";
  }
  return "not-found";
}

function notFoundToast(brand: string): void {
  showToast({
    title: "Conversation not found",
    message: `Could not open the conversation with ${brand}. Find it in the Messages drawer.`,
    closeLabel: "Close",
  });
}

// Finish a link that arrived as `#ib-open-thread=<brand>` (an Amazon page chip, or
// the campaign redirect above). Runs once per page load on Creator Connections.
export async function handleOpenHash(): Promise<void> {
  const brand = parseOpenHash(location.hash);
  if (!brand) return;
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch {
    // keep the hash; harmless
  }
  try {
    // /p/connect/request?campaignId=... (a campaign page), not /p/connect/requests.
    if (/\/p\/connect\/request(?!s)/.test(location.pathname)) {
      const button = await waitFor(() => document.querySelector<HTMLElement>(MESSAGE_BRAND_BUTTON), BUTTON_WAIT_MS);
      if (button) {
        pressElement(button);
      } else {
        notFoundToast(brand);
      }
      return;
    }
    await loadStored();
    const outcome = await openBrandConversation(brand);
    if (outcome === "not-found") notFoundToast(brand);
  } catch (error) {
    log("cc-messages", "open from link failed", error);
    notFoundToast(brand);
  }
}
