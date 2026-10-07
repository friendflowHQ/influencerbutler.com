import { isBlockedHtml } from "../../amazon/dp-static";
import { readSpccGrid, type Campaign } from "../../amazon/creator-campaigns";
import { log } from "../../shared/log";
import type { AcceptOutcome } from "../../shared/messages";
import { clickAcceptAndConfirm, findButton, sleep, waitFor } from "./accept-runner";

// In-page accept for an SPCC ("Sponsored Products for Creators") card, keyed by
// ASIN: an SPCC card carries no campaign id anywhere in the DOM, so the ASIN
// (read off the card's /dp/ link) is the only handle there is.
//
// The recipe is the desktop app's verified one (integrations/cc-campaigns/
// ccCardAccept.js acceptSpccCardForAsin): the SPCC tab CANNOT be reached by a cold
// URL (Amazon's SPA rewrites ?type=spcc back to affiliate-plus and drops the
// keyword), so we drive the live SPA instead: click the "Sponsored Products for
// Creators" tab, optionally type the ASIN into the in-page search box, find THAT
// ASIN's card, click its own Accept button, and VERIFY the card is gone from the
// grid before reporting success. Everything matches on button / tab TEXT and the
// stable #request-card-search-input id, never on hashed class names.
//
// Like the CC runner, this clicks Amazon's own button in a real page. It never
// replays Amazon's API, and it refuses to click anything unless the SPCC tab is
// confirmed active (clicking Accept on the Affiliate+ grid would join the wrong
// program).

const SPCC_TAB_RE = /Sponsored Products for Creators/i;
const SEARCH_INPUT_SEL =
  "#request-card-search-input, input[type='search'], input[placeholder*='ASIN' i]";
// The card's own button reads exactly "Accept" ("Accept all" / "Accepted" are
// something else and must never match).
const CARD_ACCEPT_RE = /^accept$/i;

const TAB_TIMEOUT_MS = 15_000;
const TAB_TICK_MS = 600;
const CARD_TIMEOUT_MS = 15_000;
const CARD_TICK_MS = 400;
const VERIFY_TIMEOUT_MS = 5_000;
const BLOCKED_SCAN_CHARS = 300_000;

// The SPCC ledger / message key for an ASIN.
export const spccKey = (asin: string): string => `spcc:${asin.trim().toUpperCase()}`;

// Pure: the ASIN in an `spcc:<ASIN>` key, or null for anything else.
export function asinFromSpccKey(key: string): string | null {
  const m = /^spcc:([A-Z0-9]{10})$/.exec(key);
  return m ? (m[1] ?? null) : null;
}

function findSpccTab(doc: Document): HTMLElement | null {
  const tabs = Array.from(doc.querySelectorAll<HTMLElement>("button, [role='tab'], a"));
  return tabs.find((b) => SPCC_TAB_RE.test((b.textContent ?? "").trim())) ?? null;
}

// Is the SPCC tab the active one? The URL when Amazon keeps it, the tab's own
// aria-selected, or SPCC cards already on screen.
export function isSpccTabActive(doc: Document = document): boolean {
  if (/[?&]type=spcc(&|$)/i.test(location.href)) return true;
  if (findSpccTab(doc)?.getAttribute("aria-selected") === "true") return true;
  return readSpccGrid(doc).length > 0;
}

// Click the SPCC tab (if it is not already active) and wait for it to take.
// False when the tab never appears / never activates: callers then refuse to
// touch the grid. A localized label that does not match the English text lands
// here too, which is the first thing to check on a non-US SPCC failure.
export async function activateSpccTab(doc: Document = document): Promise<boolean> {
  const start = Date.now();
  let clicked = false;
  let reclicked = false;
  for (;;) {
    if (isSpccTabActive(doc)) return true;
    const elapsed = Date.now() - start;
    const tab = findSpccTab(doc);
    if (tab && !clicked) {
      clicked = true;
      tab.click();
    } else if (tab && !reclicked && elapsed > TAB_TIMEOUT_MS / 2) {
      // One more click mid-way if the first did not take.
      reclicked = true;
      tab.click();
    }
    if (elapsed >= TAB_TIMEOUT_MS) return isSpccTabActive(doc);
    await sleep(TAB_TICK_MS);
  }
}

// Type an ASIN into the opportunity search box the way a user would, driving
// React's controlled input through the native value setter plus input / change
// events, then Enter. False when no search box exists.
export function setCardSearch(asin: string, doc: Document = document): boolean {
  const input = doc.querySelector<HTMLInputElement>(SEARCH_INPUT_SEL);
  if (!input) return false;
  const proto = Object.getPrototypeOf(input) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  try {
    input.focus();
  } catch {
    // focus is best-effort
  }
  if (setter) setter.call(input, asin);
  else input.value = asin;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  for (const type of ["keydown", "keyup"]) {
    input.dispatchEvent(
      new KeyboardEvent(type, { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }),
    );
  }
  return true;
}

function searchValue(doc: Document): string {
  return (doc.querySelector<HTMLInputElement>(SEARCH_INPUT_SEL)?.value ?? "").trim().toUpperCase();
}

// The SPCC card for exactly this ASIN, or null. Matches the card's own /dp/ link
// ASIN, never position, so a re-sorted grid cannot accept the wrong product.
export function findSpccCard(asin: string, doc: Document = document): Campaign | null {
  const want = asin.toUpperCase();
  return readSpccGrid(doc).find((c) => c.asins.includes(want)) ?? null;
}

function cardAcceptButton(card: Campaign): HTMLElement | null {
  return findButton(card.el, CARD_ACCEPT_RE);
}

// Accept one SPCC card by ASIN. `search` types the ASIN into the in-page search
// first (the one-off path: the card may not be on the first screen of a long
// grid); the Auto pass already has the grid on screen and skips it.
export async function runAcceptSpccByAsin(
  asin: string,
  opts: { search?: boolean } = {},
): Promise<AcceptOutcome> {
  const want = asin.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(want)) return { ok: false, reason: "needs-id" };
  if (isBlockedHtml(document.documentElement.outerHTML.slice(0, BLOCKED_SCAN_CHARS))) {
    return { ok: false, reason: "blocked" };
  }

  if (!(await activateSpccTab())) {
    log("spcc-runner", "SPCC tab not confirmed; refusing to click");
    return { ok: false, reason: "not-found" };
  }

  if (opts.search) {
    setCardSearch(want);
    await sleep(1_500);
    // The box can lag a render behind: re-assert once if it did not take.
    if (searchValue(document) !== want) {
      setCardSearch(want);
      await sleep(1_500);
    }
    // Safety: never click on an unfiltered grid (it is the full recommendation
    // set); the card lookup below is by ASIN anyway, but a filter that never
    // applied means the page is not in the state we think it is.
    if (searchValue(document) !== want) return { ok: false, reason: "not-found" };
  }

  const card = await waitFor(
    () => {
      const c = findSpccCard(want);
      return c && cardAcceptButton(c) ? c : null;
    },
    CARD_TIMEOUT_MS,
    CARD_TICK_MS,
  );
  const button = card ? cardAcceptButton(card) : null;
  if (!card || !button) return { ok: false, reason: "not-found" };

  const outcome = await clickAcceptAndConfirm(
    { region: card.el, button, testid: null },
    spccKey(want),
  );
  if (!outcome.ok) return outcome;

  // A re-render can swap the card's nodes while it is still open, which the
  // click-and-confirm read would take for "the button vanished". Verify against
  // the live grid: this ASIN must no longer have an Accept button.
  const gone = await waitFor(
    () => {
      const again = findSpccCard(want);
      return !again || !cardAcceptButton(again) ? true : null;
    },
    VERIFY_TIMEOUT_MS,
    CARD_TICK_MS,
  );
  return gone ? outcome : { ok: false, reason: "no-change" };
}
