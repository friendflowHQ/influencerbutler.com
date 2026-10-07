import { isBlockedHtml } from "../../amazon/dp-static";
import type { CampaignFill } from "../../amazon/creator-campaigns";
import { log } from "../../shared/log";
import { findButton, isVisible, sleep, waitFor } from "./accept-runner";
import {
  CONTENT_SUBMITTED_RE,
  pickBestCampaign,
  submittedUrlMatches,
  type ActiveCardMeta,
  type ContentType,
} from "./content-link";
import { setCardSearch } from "./spcc-runner";

// In-page runner for "submit my storefront content link" on a Creator
// Connections campaign. Two steps, because Amazon splits them across two pages:
//
//  1. findBestActiveCampaign(asin), on the ACTIVE tab of the requests grid
//     (?status=active&type=affiliate-plus&keyword=<ASIN>): confirm the grid is
//     filtered to this ASIN, pick the best active campaign (content-link.ts
//     pickBestCampaign) and hand its "View Details" URL back to the worker;
//  2. submitContentLinkOnPage(url, type), on that campaign's detail page: pick the
//     content type in Amazon's dropdown, type the URL, press Submit, and read
//     Amazon's own confirmation.
//
// The worker (background/content-link.ts) navigates the tab between the two.
// Selectors are the desktop app's verified ones (workspaces/cc-check/
// cc-check-runner.js); note Amazon's own typo in "submmit". Like every other
// runner here this clicks Amazon's own controls in a real page and never replays
// Amazon's API.

const CARD_SEL = "[data-testid='campaign-card-container']";
const VIEW_DETAILS_SEL = "[data-testid='campaign-card-view-details-link']";
const DATE_SEL = "[data-testid='campaign-card-campaign-date-range']";
const TYPE_DROPDOWN_SEL = "[data-testid='campaign-details-upload-content-type-dropdown']";
const TYPE_OPTION_SEL = "[data-testid='campaign-details-upload-content-type-dropdown-option']";
const URL_INPUT_SEL = "[data-testid='campaign-details-upload-content-url-input']";
const SUBMIT_BTN_SEL = "[data-testid='campaign-details-upload-content-submmit-btn']"; // Amazon's typo
const SEARCH_INPUT_SEL = "#request-card-search-input, input[type='search'], input[placeholder*='ASIN' i]";

const BLOCKED_SCAN_CHARS = 300_000;
const ACTIVE_TAB_TIMEOUT_MS = 10_000;
const CARDS_TIMEOUT_MS = 15_000;
const FORM_TIMEOUT_MS = 15_000;
const SUBMIT_ENABLE_TIMEOUT_MS = 5_000;
const CONFIRM_TIMEOUT_MS = 8_000;
const TICK_MS = 400;

export type FindActiveResult =
  | { ok: true; href: string; campaignId: string; count: number }
  | { ok: false; reason: "blocked" | "not-found" | "no-campaign" | "error" };

export type SubmitLinkOutcome =
  | { ok: true; state: "submitted" | "already" }
  | { ok: false; reason: "blocked" | "not-found" | "form" | "no-confirm" | "error" };

const isBlocked = (): boolean =>
  isBlockedHtml(document.documentElement.outerHTML.slice(0, BLOCKED_SCAN_CHARS));

// ---- Step 1: the active grid ---------------------------------------------------

// The Affiliate+ tabs (New Opportunities / Active / Completed) are client-side
// React buttons; the status= URL param does NOT select them (verified live by the
// desktop app), so click Active unless it is already pressed.
async function ensureActiveTab(): Promise<boolean> {
  const find = (): HTMLElement | null => {
    const candidates = [
      document.querySelector<HTMLElement>("[data-testid='affiliate-plus-active'] button"),
      document.querySelector<HTMLElement>("#opportunity-active button"),
      ...Array.from(
        document.querySelectorAll<HTMLElement>("button[title='Active'], button[aria-label='Active']"),
      ),
    ].filter((b): b is HTMLElement => !!b);
    return candidates.find((b) => isVisible(b)) ?? null;
  };
  const tab = await waitFor(find, ACTIVE_TAB_TIMEOUT_MS, TICK_MS);
  if (!tab) return false;
  if (tab.getAttribute("aria-pressed") !== "true") {
    tab.click();
    await sleep(1_500);
  }
  return true;
}

function scrapeActiveCards(fills: Record<string, CampaignFill>): ActiveCardMeta[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>(VIEW_DETAILS_SEL)).map((a, index) => {
    const card = a.closest<HTMLElement>(CARD_SEL);
    const href = a.getAttribute("href") ?? "";
    const campaignId = /amzn1\.campaign\.[A-Za-z0-9]+/.exec(href)?.[0] ?? "";
    return {
      index,
      href,
      campaignId,
      dateRange: card?.querySelector(DATE_SEL)?.textContent?.trim() ?? "",
      cardText: (card?.innerText ?? "").trim(),
      full: campaignId ? fills[campaignId]?.fullyClaimed === true : false,
    };
  });
}

// Pure-ish: only a Creator Connections page on Amazon is ever navigated to.
function safeDetailHref(href: string): string | null {
  try {
    const u = new URL(href, location.href);
    if (u.protocol !== "https:") return null;
    if (!/^affiliate-program\.amazon\.[a-z.]+$/i.test(u.hostname)) return null;
    if (!u.pathname.startsWith("/p/connect/")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function findBestActiveCampaign(
  asin: string,
  fills: Record<string, CampaignFill> = {},
): Promise<FindActiveResult> {
  const want = asin.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(want)) return { ok: false, reason: "error" };
  if (isBlocked()) return { ok: false, reason: "blocked" };

  if (!(await ensureActiveTab())) return { ok: false, reason: "not-found" };

  // Safety: the grid must be filtered to THIS ASIN, or "the best campaign" would
  // be some other product's and the creator's link would land on the wrong
  // campaign. The keyword URL param usually does it; if the box disagrees, type it.
  const boxValue = (): string =>
    (document.querySelector<HTMLInputElement>(SEARCH_INPUT_SEL)?.value ?? "").trim().toUpperCase();
  if (boxValue() !== want) {
    setCardSearch(want);
    await sleep(1_500);
  }
  if (boxValue() !== want) return { ok: false, reason: "not-found" };

  const hasCards = await waitFor(
    () => (document.querySelector(VIEW_DETAILS_SEL) ? true : null),
    CARDS_TIMEOUT_MS,
    TICK_MS,
  );
  if (!hasCards) return { ok: false, reason: "no-campaign" };
  // Let the filtered list settle (the unfiltered list can flash first).
  await sleep(1_000);

  // Only cards whose View Details link stays on the Creator Connections pages are
  // candidates: an unexpected off-site link must never be navigated to, and must
  // not stop a good campaign from being picked either.
  const cards = scrapeActiveCards(fills).filter((c) => safeDetailHref(c.href) !== null);
  const best = pickBestCampaign(cards);
  if (!best) return { ok: false, reason: "no-campaign" };
  const href = safeDetailHref(best.href);
  if (!href) return { ok: false, reason: "not-found" };
  log("content-link", `best of ${cards.length} active campaign(s) for ${want}: ${best.campaignId || best.index}`);
  return { ok: true, href, campaignId: best.campaignId, count: cards.length };
}

// ---- Step 2: the detail page form ----------------------------------------------

// Is this URL already listed as submitted on the details panel?
function urlAlreadySubmitted(url: string): boolean {
  const body = document.body?.innerText ?? "";
  const bare = url.replace(/\/+$/, "");
  if (body.includes(url) || body.includes(bare)) return true;
  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("table a, div[class*='content'] a, [class*='Manage'] a"),
  );
  return anchors.some(
    (a) => submittedUrlMatches(a.href, url) || submittedUrlMatches(a.textContent ?? "", url),
  );
}

// How many times Amazon's "Link was successfully submitted" confirmation is on
// the page right now.
function countBanners(): number {
  const text = document.body?.innerText ?? "";
  return text.match(new RegExp(CONTENT_SUBMITTED_RE.source, "gi"))?.length ?? 0;
}

// Drive React's controlled input the way a user typing would.
function setInputValue(input: HTMLInputElement, value: string): void {
  const proto = Object.getPrototypeOf(input) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  try {
    input.focus();
  } catch {
    // focus is best-effort
  }
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export async function submitContentLinkOnPage(
  url: string,
  type: ContentType,
): Promise<SubmitLinkOutcome> {
  if (isBlocked()) return { ok: false, reason: "blocked" };
  if (!/^https:\/\//i.test(url)) return { ok: false, reason: "error" };

  const dropdown = await waitFor(
    () => document.querySelector<HTMLElement>(TYPE_DROPDOWN_SEL),
    FORM_TIMEOUT_MS,
    TICK_MS,
  );
  if (!dropdown) return { ok: false, reason: "not-found" };

  // Never post the same link twice to the same campaign.
  if (urlAlreadySubmitted(url)) return { ok: true, state: "already" };

  dropdown.click();
  await sleep(500);
  const options = Array.from(document.querySelectorAll<HTMLElement>(TYPE_OPTION_SEL));
  const option =
    options.find((o) => (o.textContent ?? "").trim().toLowerCase() === type) ??
    (options.length === 1 ? options[0] : undefined);
  if (!option) return { ok: false, reason: "form" };
  option.click();
  await sleep(300);

  const input = document.querySelector<HTMLInputElement>(URL_INPUT_SEL);
  if (!input) return { ok: false, reason: "form" };
  setInputValue(input, url);
  await sleep(300);

  // The Submit button stays React-disabled until the typed URL validates; the
  // enable can lag a frame or two, so poll instead of reading it once.
  const submit = await waitFor(
    () => {
      const btn = document.querySelector<HTMLElement>(SUBMIT_BTN_SEL) ?? findButton(document, /^submit$/i);
      if (!btn) return null;
      const disabled =
        (btn as HTMLButtonElement).disabled === true || btn.getAttribute("aria-disabled") === "true";
      return disabled ? null : btn;
    },
    SUBMIT_ENABLE_TIMEOUT_MS,
    300,
  );
  if (!submit) return { ok: false, reason: "form" };
  // A confirmation banner from an EARLIER submit can still be on the page, so only
  // a banner that is new since this click counts (the same baseline idea as the
  // accept runner's classifier).
  const bannersBefore = countBanners();
  submit.click();

  // The post is asynchronous (an in-place banner, or a navigation back to the
  // campaign view). Wait for Amazon's own confirmation, give the request a
  // moment to settle, then trust what is actually on the page.
  const banner = await waitFor(
    () => (countBanners() > bannersBefore ? true : null),
    CONFIRM_TIMEOUT_MS,
    300,
  );
  await sleep(1_200);
  if (banner || urlAlreadySubmitted(url)) return { ok: true, state: "submitted" };
  return { ok: false, reason: "no-confirm" };
}
