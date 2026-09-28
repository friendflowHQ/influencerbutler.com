import { readVideoCountFromHtml, isBlockedHtml } from "../amazon/dp-static";

// Total number of creator videos on a product's Amazon listing (Amazon's own
// #videoCount header), fetched from the BACKGROUND worker. A content script on
// affiliate-program.amazon.com cannot cross-origin fetch www.amazon.com (MV3
// gives the host_permissions CORS bypass to the worker, not content scripts), and
// the worker has no DOMParser, so the count is read from raw HTML with a regex
// (readVideoCountFromHtml). This is the "creator saturation" signal on the
// Creator Connections overlays: how many creators already made a video for this
// product, so a low count reads as an opening and a high one as a crowded niche.
//
// Cookies are omitted so we never carry the user's session into the fetch. Any
// miss (bad ASIN, blocked / not-found page, network error, or an unrenderable
// page with no count marker) returns null so the caller retries next visit rather
// than caching a wrong number. A genuine zero (a product with no video rails)
// comes back as 0 from readVideoCountFromHtml and IS cached.

const ASIN_RE = /^[A-Z0-9]{10}$/;
const NOT_FOUND_RE = /Dogs of Amazon|Sorry! We couldn.t find that page|Page Not Found/i;

export async function fetchVideoCount(asin: string, marketplace: string): Promise<number | null> {
  const id = asin.toUpperCase();
  if (!ASIN_RE.test(id)) return null;
  const host = marketplace.startsWith("www.") ? marketplace : `www.${marketplace}`;
  try {
    const res = await fetch(`https://${host}/dp/${id}`, {
      credentials: "omit",
      headers: { accept: "text/html,*/*" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (isBlockedHtml(html) || NOT_FOUND_RE.test(html)) return null;
    return readVideoCountFromHtml(html);
  } catch {
    return null;
  }
}
