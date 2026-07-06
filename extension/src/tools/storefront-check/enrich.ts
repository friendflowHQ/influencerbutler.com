import { extractInStock } from "../../amazon/product-signals";
import type { HarvestedItem } from "./harvest";

// Opt-in deep passes for the storefront checkup. All are OFF by default and
// only run when the user ticks them, because each fetches pages one at a time
// (the fast getItems feed does not carry this data). Same idea as the desktop
// retag butler's per-item checks, paced and capped so it cannot become an
// unbounded crawl.

const MIN_MS = 1000;
const MAX_MS = 1800;
export const DETAIL_CAP = 500;

const DP_RE = /\/dp\/([A-Z0-9]{10})/;
const CSA_ASIN_RE = /amzn1\.asin\.([A-Z0-9]{10})/i;
const PARENT_RE = /"parentAsin"\s*:\s*"([A-Z0-9]{10})"/;

export type ProductDetail = { available: boolean; parentAsin: string | null };

async function fetchHtml(url: string, signal: AbortSignal): Promise<string | null> {
  signal.throwIfAborted();
  try {
    const res = await fetch(url, { credentials: "include", signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function sleep(signal: AbortSignal): Promise<void> {
  const ms = MIN_MS + Math.random() * (MAX_MS - MIN_MS);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason ?? new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function asinsFromDoc(doc: Document): string[] {
  const set = new Set<string>();
  for (const a of Array.from(doc.querySelectorAll("a[href*='/dp/']"))) {
    const m = (a.getAttribute("href") ?? "").match(DP_RE);
    if (m && m[1]) set.add(m[1]);
  }
  for (const e of Array.from(doc.querySelectorAll("[data-csa-c-item-id]"))) {
    const m = (e.getAttribute("data-csa-c-item-id") ?? "").match(CSA_ASIN_RE);
    if (m && m[1]) set.add(m[1]);
  }
  return [...set];
}

// Fill in tagged products for photo / idea-list / media-list items by opening
// each one's detail page. Mutates the items in place.
export async function enrichContentProducts(
  items: HarvestedItem[],
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const targets = items.filter((i) => !i.productsKnown && i.url).slice(0, DETAIL_CAP);
  let done = 0;
  for (const item of targets) {
    if (signal.aborted) break;
    const html = await fetchHtml(item.url, signal);
    if (html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      item.taggedAsins = asinsFromDoc(doc);
      item.productsKnown = true;
    }
    onProgress(++done, targets.length);
    await sleep(signal);
  }
}

// Open each unique tagged product once and read its availability and parent
// ASIN (both come from the same page fetch).
export async function enrichProductDetails(
  asins: string[],
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ details: Map<string, ProductDetail>; capped: boolean }> {
  const details = new Map<string, ProductDetail>();
  const list = asins.slice(0, DETAIL_CAP);
  const capped = asins.length > DETAIL_CAP;
  let done = 0;
  for (const asin of list) {
    if (signal.aborted) break;
    const html = await fetchHtml(`${location.origin}/dp/${asin}`, signal);
    if (html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const parentAsin = html.match(PARENT_RE)?.[1] ?? null;
      details.set(asin, { available: extractInStock(doc), parentAsin });
    }
    onProgress(++done, list.length);
    await sleep(signal);
  }
  return { details, capped };
}
