// Content script injected on influencerbutler.com pages. Its only job is to
// notice the affiliate code the site set (the ib_aff_src cookie, or a ?code=
// param on the current URL) and hand it to the background worker, which stores
// it first-touch. The extension never runs a content script on Amazon/Walmart
// with any knowledge of this - attribution lives entirely on our own domain.
//
// Why a content script and not chrome.cookies: ib_aff_src is a non-HttpOnly
// cookie (src/lib/promo.ts sets it httpOnly:false precisely so the client can
// read it), so document.cookie is enough and the extension needs no "cookies"
// permission. The site's host permission already covers the fetch/messaging.
//
// This captures on ANY influencerbutler.com visit within the cookie's 30-day
// life (the install page, sign-in, tutorials, the download page), so a code
// clicked before the extension was installed is still picked up on a later
// visit. Fire-and-forget: nothing on the page waits for or sees the result.

import type { RuntimeMessage } from "../shared/messages";

const COOKIE_NAME = "ib_aff_src";
const CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function readCode(): { code: string; source: string } | null {
  // Prefer the URL param: it is present immediately, whereas the cookie is only
  // set once the page's /api/promo/touch call returns.
  try {
    const param = new URLSearchParams(window.location.search).get("code");
    if (param && CODE_RE.test(param.trim())) {
      return { code: param.trim(), source: "param" };
    }
  } catch {
    // malformed query string: fall through to the cookie
  }
  const cookie = readCookie(COOKIE_NAME);
  if (cookie && CODE_RE.test(cookie)) {
    return { code: cookie, source: "cookie" };
  }
  return null;
}

(() => {
  const w = window as typeof window & { __ibSiteReferralDone?: boolean };
  if (w.__ibSiteReferralDone) return;
  w.__ibSiteReferralDone = true;

  const found = readCode();
  if (!found) return;

  const message: RuntimeMessage = {
    kind: "CAPTURE_AFFILIATE_CODE",
    code: found.code,
    source: found.source,
  };
  try {
    // Fire-and-forget. Swallow the "receiving end does not exist" rejection that
    // can happen if the worker is mid-restart; the next visit retries anyway.
    void chrome.runtime.sendMessage(message).catch(() => undefined);
  } catch {
    // Extension context invalidated (e.g. just updated): ignore.
  }
})();
