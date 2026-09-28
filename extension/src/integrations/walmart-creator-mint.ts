import { LinkNoticeError } from "./link-notice";

// Mints a real walmrt.us short link by driving the signed-in creator.walmart.com
// portal in a background tab. Ported from the desktop app's
// integrations/walmart/walmartCreatorLink.js (and its walmart-link-mint.js
// wrapper): same input discovery, same controlled-React-input value trick, same
// snapshot-then-poll for the new short link, same 6h per-url cache.
//
// The portal sometimes shows a press-and-hold bot check. When it does, the poll
// times out and the caller falls back to the plain walmart.com url via
// routing.ts, so a mint attempt can be slow but never blocks copying a link.

const HOME_URL = "https://creator.walmart.com/";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // desktop parity: 6h per product url
const CACHE_MAX = 200;
const TAB_LOAD_TIMEOUT_MS = 20_000;
const MINT_TIMEOUT_MS = 25_000;

// A creator.walmart.com navigation that got bounced to a sign-in surface.
// Shared with the adapter's Test button, which checks the final url of a fetch.
export function looksSignedOutUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("identity.walmart.com") ||
    u.includes("/account/login") ||
    /\/(login|signin|sign-in)([/?#]|$)/.test(u)
  );
}

type MintOutcome = { ok: boolean; link?: string; reason?: string };

const cache = new Map<string, { link: string; at: number }>();
const inFlight = new Map<string, Promise<string>>();

export async function mintWalmartCreatorLink(productUrl: string): Promise<string> {
  const cached = cache.get(productUrl);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.link;
  const pending = inFlight.get(productUrl);
  if (pending) return pending;
  const run = mintUncached(productUrl).finally(() => inFlight.delete(productUrl));
  inFlight.set(productUrl, run);
  return run;
}

async function mintUncached(productUrl: string): Promise<string> {
  const tab = await chrome.tabs.create({ url: HOME_URL, active: false });
  const tabId = tab.id;
  if (tabId === undefined) throw new Error("could not open a Walmart Creator tab");
  try {
    await waitForTabComplete(tabId, TAB_LOAD_TIMEOUT_MS);
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      func: runCreatorMint,
      args: [productUrl, MINT_TIMEOUT_MS],
    });
    const outcome = (injected[0]?.result ?? { ok: false }) as MintOutcome;
    if (!outcome.ok || !outcome.link) {
      if (outcome.reason === "signInRequired") {
        throw new LinkNoticeError(
          "signInRequired",
          "Sign in to Walmart Creator at creator.walmart.com, then copy again.",
        );
      }
      throw new Error(outcome.reason || "Walmart Creator did not produce a link.");
    }
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(productUrl, { link: outcome.link, at: Date.now() });
    return outcome.link;
  } finally {
    chrome.tabs.remove(tabId).catch(() => undefined);
  }
}

async function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  const existing = await chrome.tabs.get(tabId);
  if (existing.status === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("The Walmart Creator page did not finish loading."));
    }, timeoutMs);
    function onUpdated(id: number, info: chrome.tabs.TabChangeInfo): void {
      if (id !== tabId || info.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

// Runs inside the creator.walmart.com tab via chrome.scripting.executeScript.
// It is serialized by the browser, so it must be fully self-contained: no
// references to anything in this module's scope.
//
// The link form's url input has no placeholder; its only handle is the
// associated <label for=...> reading "Paste item's product URL", so candidates
// are scored by label/aria/name text, never by hashed class names. The input is
// a controlled React field: assigning .value directly is ignored, so the value
// goes in through the native prototype setter followed by bubbling input/change
// events (see the desktop repo's docs/developer/walmart-creator-portal-selectors.md).
export async function runCreatorMint(
  productUrl: string,
  timeoutMs: number,
): Promise<{ ok: boolean; link?: string; reason?: string }> {
  const SHORTLINK_RE = /https?:\/\/walmrt\.us\/[A-Za-z0-9]+/gi;
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const deadline = Date.now() + Math.max(5_000, timeoutMs);

  const signedOutUrl = (u: string): boolean => {
    const lower = u.toLowerCase();
    return (
      lower.includes("identity.walmart.com") ||
      lower.includes("/account/login") ||
      /\/(login|signin|sign-in)([/?#]|$)/.test(lower)
    );
  };
  const looksLikeSignInPage = (): boolean => {
    if (document.querySelector('input[type="password"]')) return true;
    const text = (document.body?.innerText || "").slice(0, 4_000).toLowerCase();
    return /sign in to your account|create your walmart account/.test(text);
  };
  const signedOut = (): boolean => signedOutUrl(location.href) || looksLikeSignInPage();

  const collectLinks = (): Set<string> => {
    const found = new Set<string>();
    const scan = (text: string): void => {
      for (const match of text.match(SHORTLINK_RE) ?? []) found.add(match);
    };
    const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    );
    for (const el of Array.from(fields)) scan(el.value || "");
    for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
      scan(a.href || "");
    }
    scan(document.body?.innerText || "");
    return found;
  };

  const findUrlInput = (): HTMLInputElement | HTMLTextAreaElement | null => {
    let best: HTMLInputElement | HTMLTextAreaElement | null = null;
    let bestScore = 0;
    const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    );
    for (const el of Array.from(fields)) {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "hidden" || type === "password" || type === "checkbox" || type === "radio") {
        continue;
      }
      if (el.disabled) continue;
      const id = el.getAttribute("id") || "";
      let labelText = "";
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        labelText = label?.textContent || "";
      }
      const bits = [
        el.getAttribute("placeholder") || "",
        el.getAttribute("aria-label") || "",
        el.getAttribute("name") || "",
        id,
        labelText,
      ]
        .join(" ")
        .toLowerCase();
      let score = 0;
      if (bits.includes("paste")) score += 2;
      if (bits.includes("product")) score += 2;
      if (bits.includes("item")) score += 1;
      if (/\burl\b|\blink\b/.test(bits)) score += 2;
      if (bits.includes("search")) score -= 3;
      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }
    return bestScore >= 3 ? best : null;
  };

  const setControlledValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
    const proto =
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(el, value);
    else (el as { value: string }).value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const clickCreate = (): boolean => {
    const wantedTexts = ["create link", "get link", "generate", "create"];
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('button, [role="button"], input[type="submit"]'),
    );
    for (const wanted of wantedTexts) {
      for (const control of controls) {
        const text = (control.textContent || (control as HTMLInputElement).value || "")
          .trim()
          .toLowerCase();
        if (!text || text.length > 40) continue;
        if (text.includes("account")) continue;
        if (!text.includes(wanted)) continue;
        if (control.getAttribute("disabled") !== null) continue;
        if (control.getAttribute("aria-disabled") === "true") continue;
        control.click();
        return true;
      }
    }
    return false;
  };

  if (signedOut()) return { ok: false, reason: "signInRequired" };

  // The portal is a SPA; wait for the url input to render.
  let input = findUrlInput();
  const inputDeadline = Math.min(deadline, Date.now() + 10_000);
  while (!input && Date.now() < inputDeadline) {
    await sleep(400);
    if (signedOut()) return { ok: false, reason: "signInRequired" };
    input = findUrlInput();
  }
  if (!input) return { ok: false, reason: "linkFormNotFound" };

  const before = collectLinks();
  setControlledValue(input, productUrl);
  await sleep(300);
  if (!clickCreate()) {
    for (const type of ["keydown", "keyup"]) {
      input.dispatchEvent(
        new KeyboardEvent(type, { key: "Enter", code: "Enter", bubbles: true }),
      );
    }
  }

  while (Date.now() < deadline) {
    await sleep(600);
    if (signedOut()) return { ok: false, reason: "signInRequired" };
    for (const link of collectLinks()) {
      if (!before.has(link)) return { ok: true, link };
    }
  }
  return { ok: false, reason: "timeout" };
}
