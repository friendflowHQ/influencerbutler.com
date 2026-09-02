// Clean Link handler (background). Expands a short link (if the pasted url is a
// known shortener) by following its redirect, cleans the resolved url with the
// pure cleaner, then re-tags a recognized product with the user's own
// attribution by reusing the same pipeline "Copy my link" uses.
//
// The network fetch lives here because the background is the only place with the
// host_permissions to fetch cross-origin. The popup requests the shortener's
// origin (a user gesture) before sending CLEAN_LINK, so by the time we fetch the
// grant is already in place; a missing grant just surfaces as expandFailed.
import { cleanLink, isShortenerUrl } from "../integrations/clean-link";
import { generateAffiliateLink } from "./integrations";
import type { CleanLinkResult } from "../shared/messages";

// Follow a short link to its final url. Returns the resolved url and the
// original when it actually moved; leaves `expandedFrom` unset (so the caller
// can flag expandFailed) when the fetch could not resolve a different url.
async function expandShortLink(url: string): Promise<{ url: string; expandedFrom?: string }> {
  try {
    // A GET (not HEAD: some redirectors reject HEAD) that follows redirects; the
    // final resolved url is response.url.
    const res = await fetch(url, { redirect: "follow", credentials: "omit" });
    const final = res.url || url;
    return final && final !== url ? { url: final, expandedFrom: url } : { url: final };
  } catch {
    return { url };
  }
}

export async function cleanLinkForRequest(input: string): Promise<CleanLinkResult> {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return { ok: false, error: "Paste a link first." };

  let working = trimmed;
  let expandedFrom: string | undefined;
  let expandFailed = false;
  if (isShortenerUrl(trimmed)) {
    const expanded = await expandShortLink(trimmed);
    working = expanded.url;
    expandedFrom = expanded.expandedFrom;
    // Still the short url: we could not follow it (no host grant / network error).
    if (!expanded.expandedFrom) expandFailed = true;
  }

  const cleaned = cleanLink(working);

  let myLink: string | undefined;
  let myLinkNotice: CleanLinkResult["myLinkNotice"];
  if (cleaned.matched && cleaned.productId && cleaned.marketplace && cleaned.retailer) {
    const built = await generateAffiliateLink(
      cleaned.productId,
      cleaned.marketplace,
      cleaned.cleanUrl,
      cleaned.retailer,
    );
    if (built.ok && built.url) {
      myLink = built.url;
      myLinkNotice = built.notice;
    }
  }

  return {
    ok: true,
    retailer: cleaned.retailer,
    productId: cleaned.productId,
    cleanUrl: cleaned.cleanUrl,
    matched: cleaned.matched,
    myLink,
    myLinkNotice,
    expandedFrom,
    expandFailed,
  };
}
