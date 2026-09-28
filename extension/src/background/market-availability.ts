// Per-country availability for a tagged product, run from the BACKGROUND worker
// because a content script cannot fetch amazon.ca / amazon.co.uk cross-origin
// (MV3 gives the host_permissions CORS bypass to the worker, not content
// scripts). The worker has no DOMParser, so availability is read from the raw
// HTML with regexes: best-effort, matching the competitor's own heuristic
// CA/UK/US indicators. Cookies are omitted so we never carry the user's session
// into another marketplace.

export type Availability = "available" | "unavailable" | "unknown";

// Market code -> host. Only markets the extension holds a host permission for
// can be fetched: US/CA/UK are in the manifest's required host_permissions; AU
// is granted at runtime (chrome.permissions.request from the popup's market
// picker, covered by the optional_host_permissions https://*/* pattern). An
// ungranted host simply fetch-fails and reads as "unknown".
const MARKET_HOSTS: Record<string, string> = {
  US: "www.amazon.com",
  CA: "www.amazon.ca",
  UK: "www.amazon.co.uk",
  AU: "www.amazon.com.au",
};

// The markets the availability picker offers, in display order.
export const AVAILABILITY_MARKETS = ["US", "CA", "UK", "AU"] as const;

// Hosts that need a runtime permission grant before they can be fetched (the
// rest ride the manifest's required host_permissions).
export const OPTIONAL_MARKET_ORIGINS: Record<string, string> = {
  AU: "https://www.amazon.com.au/*",
};

const ASIN_RE = /^[A-Z0-9]{10}$/;
const NOT_FOUND_RE = /Dogs of Amazon|Sorry! We couldn.t find that page|Page Not Found/i;
const UNAVAILABLE_RE = /currently unavailable|no est. disponible|non disponible|derzeit nicht verf/i;
const BUYABLE_RE = /id="add-to-cart-button"|id="buy-now-button"|name="submit.add-to-cart"/i;
const BLOCKED_RE = /validateCaptcha|Enter the characters you see|Type the characters you see|Robot Check/i;

export async function fetchMarketAvailability(
  asin: string,
  markets: string[],
): Promise<Record<string, Availability>> {
  const out: Record<string, Availability> = {};
  if (!ASIN_RE.test(asin)) {
    for (const code of markets) out[code] = "unknown";
    return out;
  }
  for (const code of markets) {
    const host = MARKET_HOSTS[code];
    out[code] = host ? await checkOne(host, asin) : "unknown";
    await sleep(300 + Math.random() * 400);
  }
  return out;
}

async function checkOne(host: string, asin: string): Promise<Availability> {
  try {
    const res = await fetch(`https://${host}/dp/${asin}`, {
      credentials: "omit",
      headers: { accept: "text/html,*/*" },
    });
    if (res.status === 404) return "unavailable";
    if (!res.ok) return "unknown";
    const html = await res.text();
    if (BLOCKED_RE.test(html)) return "unknown";
    if (NOT_FOUND_RE.test(html)) return "unavailable";
    // Check the buy button FIRST: "currently unavailable" text also appears in
    // unrelated sections (other sellers, recommendations) of a huge in-stock
    // page, so a live add-to-cart button is the reliable in-stock signal.
    // Only when there is no buy button do we trust the unavailable text.
    if (BUYABLE_RE.test(html)) return "available";
    if (UNAVAILABLE_RE.test(html)) return "unavailable";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
