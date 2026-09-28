// Clean Link: strip another person's tracking / affiliate attribution off a
// pasted product url so nobody else gets the credit. For a recognized Amazon or
// Walmart product url the cleanest result is a freshly rebuilt canonical url
// (`/dp/<ASIN>` or `/ip/<id>`), which drops EVERY query param by construction;
// for anything else we fall back to deleting known tracking params.
//
// This module is pure (no network, no chrome apis) so it unit-tests directly.
// Short-link expansion (which needs a network round-trip) lives in the
// background; see background/clean-link.ts.
import type { Retailer } from "../shared/retailer";
import { retailerModule } from "../retailers/module";

export type CleanResult = {
  // The retailer the url belongs to, or null when the host is not a known
  // retailer (the fallback strip path).
  retailer: Retailer | null;
  // The product id, present only when one was extracted (the canonical path).
  productId: string | null;
  // The marketplace host (e.g. "amazon.com"), present with a product id.
  marketplace: string | null;
  // The cleaned url: a canonical product url when matched, else the input with
  // known tracking params removed.
  cleanUrl: string;
  // True when we produced a canonical product url (all foreign tracking gone).
  matched: boolean;
};

// Exact-match tracking / attribution params to delete on the fallback path.
// Amazon affiliate + browse noise, Walmart affiliate noise, and generic
// ad-network click ids. Compared case-insensitively. Extend this list as new
// trackers show up; the prefix sweep below catches the `utm_` / `pd_rd_` /
// `pf_rd_` families without listing every suffix.
export const TRACKING_PARAMS: ReadonlySet<string> = new Set([
  // Amazon
  "tag",
  "ref",
  "ref_",
  "_encoding",
  "smid",
  "psc",
  "th",
  "linkcode",
  "linkid",
  "creativeasin",
  "creative",
  "camp",
  "ascsubtag",
  "colid",
  "coliid",
  "qid",
  "sr",
  "keywords",
  "content-id",
  "spia",
  "spprefix",
  // Walmart
  "athbdg",
  "athcpid",
  "athpgid",
  "athznid",
  "athieid",
  "athstid",
  "athguid",
  "athancid",
  "athena",
  "sourceid",
  "veh",
  "wmlspartner",
  "affiliates_ad_id",
  "campaign_id",
  // Generic ad-network click ids
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "dclid",
  "yclid",
  "twclid",
  "ttclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "irgwc",
  "irclickid",
  "clickid",
  "cjevent",
  "epik",
]);

// Param name prefixes whose whole family is tracking.
const TRACKING_PREFIXES = ["utm_", "pd_rd_", "pf_rd_"];

// Host suffixes of link shorteners / redirectors we expand before cleaning. The
// resolved target is a retailer domain we already hold host access to, so the
// popup only ever asks for one of these origins.
const SHORTENER_HOSTS = [
  "a.co",
  "amzn.to",
  "amzn.eu",
  "amzn.com",
  "geni.us",
  "s.walmart.com",
  "goto.walmart.com",
  "r.walmart.com",
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// The retailer for a url, or null when the host is not a known retailer. Unlike
// retailerFromUrl (which defaults to Amazon) this returns null for a stranger
// host, so the cleaner knows when it cannot build a canonical product url.
function detectRetailer(url: string): Retailer | null {
  const host = hostOf(url);
  if (!host) return null;
  if (host === "walmart.com" || host.endsWith(".walmart.com")) return "walmart";
  if (host === "amazon.com" || /(^|\.)amazon\.[a-z.]+$/.test(host)) return "amazon";
  return null;
}

/** Whether `url` is a link shortener we should expand before cleaning. */
export function isShortenerUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return SHORTENER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * The origin-match pattern to request host permission for before expanding a
 * short link, or null when `url` is not a shortener. Example: "https://a.co/*".
 */
export function shortenerOriginPattern(url: string): string | null {
  if (!isShortenerUrl(url)) return null;
  try {
    return `${new URL(url).origin}/*`;
  } catch {
    return null;
  }
}

// Delete every tracking param (exact match or tracked prefix) from a URL's query
// in place. Keys are collected first so we never mutate while iterating.
function stripTrackingParams(u: URL): void {
  const drop: string[] = [];
  for (const key of u.searchParams.keys()) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower) || TRACKING_PREFIXES.some((p) => lower.startsWith(p))) {
      drop.push(key);
    }
  }
  for (const key of drop) u.searchParams.delete(key);
}

/**
 * Clean a pasted product url. For a recognized Amazon/Walmart product url this
 * returns a canonical `/dp/` or `/ip/` url (all foreign tracking dropped); for
 * any other url it returns the input with known tracking params removed.
 */
export function cleanLink(input: string): CleanResult {
  const url = (input ?? "").trim();
  const retailer = detectRetailer(url);

  if (retailer) {
    const mod = retailerModule(retailer);
    const id = mod.extractProductId(url);
    if (id && mod.productIdValid(id)) {
      const marketplace = mod.marketplaceFor(url);
      return {
        retailer,
        productId: id,
        marketplace,
        cleanUrl: mod.canonicalProductUrl(id, marketplace),
        matched: true,
      };
    }
  }

  // Fallback: a retailer page with no product id (a search / browse url), or a
  // stranger host. Strip known trackers so the user still gets a tidier link.
  try {
    const u = new URL(url);
    stripTrackingParams(u);
    return { retailer, productId: null, marketplace: null, cleanUrl: u.toString(), matched: false };
  } catch {
    // Not a parseable absolute url: hand it back untouched.
    return { retailer, productId: null, marketplace: null, cleanUrl: url, matched: false };
  }
}
