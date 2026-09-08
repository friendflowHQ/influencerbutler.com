import { isBlockedHtml } from "../../amazon/dp-static";
import { readCampaignGrid } from "../../amazon/creator-campaigns";
import { detectPageType } from "../../content/page-type";
import { log } from "../../shared/log";
import type { AcceptOutcome } from "../../shared/messages";

// In-page accept runner for Creator Connections: finds the campaign's Accept
// button (the card on the grid, or the button on a single campaign's detail
// page), clicks it exactly as the creator would, confirms a dialog if Amazon
// shows one, and reads Amazon's own confirmation off the page. Runs on the
// campaign-grid and campaign-detail pages: directly from the grid's Accept pill
// / Butler's Brief (we are already on the page), or on a RUN_ACCEPT message in a
// background tab the worker opened (background/campaign-accept.ts).
//
// Everything Amazon-shaped here is a best guess until live QA: the card's
// accept-button testid is verified (creator-campaigns.ts), the detail page's
// button, the confirm dialog, and the post-accept card text are UNVERIFIED and
// carry text fallbacks. Outcomes are conservative: only a vanished button or a
// clear "Accepted" / "Pending" reads as success.

// How long to wait for the card / button to appear (the grid is a React SPA
// that renders after its own campaign fetch).
const FIND_TIMEOUT_MS = 12_000;
const FIND_TICK_MS = 400;
// How long to watch for the post-click state before calling it "no change".
const CONFIRM_TIMEOUT_MS = 6_000;
const CONFIRM_TICK_MS = 250;
// How much of the document to scan for a robot-check marker.
const BLOCKED_SCAN_CHARS = 300_000;
// Text on a button that means "accept" (the card's own accept button, or a
// dialog's confirm), matched against the button's trimmed text.
const ACCEPT_BTN_RE = /^accept/i;
const CONFIRM_BTN_RE = /accept|confirm/i;
// Card text that means the accept went through. "Pending" covers a brand that
// approves creators manually (the request is queued, the button is gone).
const ACCEPTED_RE = /\baccepted\b/i;
const PENDING_RE = /\bpending\b/i;
// An error toast / inline alert after the click.
const ERROR_RE = /something went wrong|try again|could not|couldn't|unable to|error/i;

export type AcceptState = "accepted" | "pending" | "confirm" | "error" | "waiting";

// Pure (exported for tests): what the card is telling us after a click.
// Success text wins outright, then an open dialog (something to confirm), then
// an error alert, then a vanished button (success with no wording we know),
// else keep waiting. `baselineText` is the card text BEFORE the click: a word
// like "pending" that was already there (e.g. a "pending approval" label) is
// not evidence of anything, so it is ignored when it was in the baseline.
export function classifyAcceptState(
  cardText: string,
  dialogPresent: boolean,
  buttonPresent: boolean,
  baselineText = "",
): AcceptState {
  const text = cardText || "";
  const newlyAccepted = ACCEPTED_RE.test(text) && !ACCEPTED_RE.test(baselineText);
  const newlyPending = PENDING_RE.test(text) && !PENDING_RE.test(baselineText);
  if (newlyAccepted) return "accepted";
  if (newlyPending) return "pending";
  if (dialogPresent) return "confirm";
  if (ERROR_RE.test(text) && !ERROR_RE.test(baselineText)) return "error";
  if (!buttonPresent) return "accepted";
  return "waiting";
}

type Located = { region: HTMLElement; button: HTMLElement; testid: string | null };

export async function runAcceptOnPage(campaignId: string): Promise<AcceptOutcome> {
  if (isBlockedHtml(document.documentElement.outerHTML.slice(0, BLOCKED_SCAN_CHARS))) {
    return { ok: false, reason: "blocked" };
  }

  const found = await waitFor(() => locateAccept(campaignId), FIND_TIMEOUT_MS, FIND_TICK_MS);
  if (!found) return { ok: false, reason: "not-found" };

  const baseline = regionText(found.region);
  log("accept-runner", `clicking accept for ${campaignId}`);
  found.button.click();

  let dialogClicked = false;
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(CONFIRM_TICK_MS);
    const dialog = findDialog();
    if (dialog && !dialogClicked) {
      const confirm = findButton(dialog, CONFIRM_BTN_RE);
      if (confirm) {
        dialogClicked = true;
        log("accept-runner", "confirming dialog");
        confirm.click();
        continue;
      }
    }
    const buttonPresent = acceptButtonPresent(found);
    const state = classifyAcceptState(
      `${regionText(found.region)} ${alertText()}`,
      !!dialog && !dialogClicked,
      buttonPresent,
      baseline,
    );
    if (state === "accepted" || state === "pending") return { ok: true, state };
    if (state === "error") return { ok: false, reason: "error-toast" };
  }
  return { ok: false, reason: "no-change" };
}

// The card region + its Accept button. On the grid the card is matched by id
// (never by position, so a re-sorted grid cannot accept the wrong campaign);
// on a detail page the whole main region is the card.
function locateAccept(campaignId: string): Located | null {
  const testid = `${campaignId}-campaign-card-accept-btn`;
  const byTestid = document.querySelector<HTMLElement>(`[data-testid="${cssEscape(testid)}"]`);
  if (byTestid) {
    const card = readCampaignGrid(document).find((c) => c.campaignId === campaignId);
    return { region: card?.el ?? climb(byTestid), button: byTestid, testid };
  }

  const card = readCampaignGrid(document).find((c) => c.campaignId === campaignId);
  if (card) {
    const button =
      card.el.querySelector<HTMLElement>('[data-testid$="-campaign-card-accept-btn"]') ??
      findButton(card.el, ACCEPT_BTN_RE);
    return button ? { region: card.el, button, testid: null } : null;
  }

  // Detail page: no card testids; the page IS the campaign, so any Accept
  // button in the main region is the one. Never do this on the grid, where an
  // unmatched id must not fall through to some other card's button.
  if (detectPageType(location.href) === "campaign-detail") {
    const region = document.querySelector<HTMLElement>("main") ?? document.body;
    const button =
      region.querySelector<HTMLElement>('[data-testid$="-campaign-card-accept-btn"]') ??
      findButton(region, ACCEPT_BTN_RE);
    return button ? { region, button, testid: null } : null;
  }
  return null;
}

// Is the Accept button still on the page? React may replace the node on
// re-render, so re-query by testid when we have one rather than trusting the
// original element reference alone.
function acceptButtonPresent(found: Located): boolean {
  if (found.testid) {
    const el = document.querySelector<HTMLElement>(`[data-testid="${cssEscape(found.testid)}"]`);
    return !!el && isVisible(el);
  }
  if (document.contains(found.button) && isVisible(found.button)) return true;
  const again = findButton(found.region, ACCEPT_BTN_RE);
  return !!again && isVisible(again);
}

function findDialog(): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], dialog[open]'));
  return dialogs.find(isVisible) ?? null;
}

function findButton(root: ParentNode, re: RegExp): HTMLElement | null {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('button, [role="button"], input[type="submit"], input[type="button"]'),
  );
  for (const c of candidates) {
    const label = (
      c.textContent?.trim() ||
      (c as HTMLInputElement).value ||
      c.getAttribute("aria-label") ||
      ""
    ).trim();
    if (label && re.test(label) && isVisible(c) && !isDisabled(c)) return c;
  }
  return null;
}

// Visible alert / toast text anywhere on the page (Amazon's a-alert boxes and
// ARIA live regions), folded into the classification so an error surfaces.
function alertText(): string {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('[role="alert"], .a-alert-error, .a-alert-warning, [aria-live="assertive"]'),
  );
  return nodes
    .filter(isVisible)
    .map((n) => n.textContent?.trim() ?? "")
    .join(" ");
}

function regionText(el: HTMLElement): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function climb(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el;
  for (let i = 0; i < 6 && node?.parentElement && node.parentElement !== document.body; i++) {
    node = node.parentElement;
  }
  return node ?? el;
}

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isDisabled(el: HTMLElement): boolean {
  return (
    (el as HTMLButtonElement).disabled === true ||
    el.getAttribute("aria-disabled") === "true" ||
    el.classList.contains("a-button-disabled")
  );
}

function cssEscape(value: string): string {
  const esc = (window as unknown as { CSS?: { escape?: (s: string) => string } }).CSS?.escape;
  return esc ? esc(value) : value.replace(/["\\]/g, "\\$&");
}

async function waitFor<T>(probe: () => T | null, timeoutMs: number, tickMs: number): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = probe();
    if (hit) return hit;
    if (Date.now() >= deadline) return null;
    await sleep(tickMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
