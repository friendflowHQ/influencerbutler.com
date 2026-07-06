import { extractInStock } from "../../amazon/product-signals";
import type { HarvestedItem } from "./harvest";

// Opt-in deep passes for the storefront checkup. All are OFF by default and
// only run when the user ticks them, because each fetches pages one at a time
// (the fast getItems feed does not carry this data). Same idea as the desktop
// retag butler's per-item checks, paced and capped so it cannot become an
// unbounded crawl.

const MIN_MS = 1000;
const MAX_MS = 1800;
// A high safety valve, not a real limit for normal storefronts. Big creators
// have thousands of posts (one live storefront had 3,500+), so 500 cut them
// off; this covers those while still capping a runaway crawl.
export const DETAIL_CAP = 6000;
// Open a few pages at once so a multi-thousand-product storefront finishes in
// tens of minutes instead of hours. Kept small so we stay gentle on Amazon and
// do not trip its bot checks. Each lane still jitter-sleeps between requests.
const POOL = 3;
// If Amazon starts serving robot-check pages we back off entirely rather than
// hammer it (and rather than misread the block page as "out of stock").
const BLOCK_GIVE_UP = 8;

const DP_RE = /\/dp\/([A-Z0-9]{10})/;
const CSA_ASIN_RE = /amzn1\.asin\.([A-Z0-9]{10})/i;
const PARENT_RE = /"parentAsin"\s*:\s*"([A-Z0-9]{10})"/;
// Amazon's automated-access / captcha interstitials. If we parsed these as
// product pages, extractInStock would read "not available" and we would flag
// every product as unavailable, which is wrong.
const BLOCKED_RE =
  /validateCaptcha|Enter the characters you see|Type the characters you see|Robot Check|To discuss automated access/i;

export type ProductDetail = { available: boolean; parentAsin: string | null };

class BlockedError extends Error {
  constructor() {
    super("blocked");
    this.name = "BlockedError";
  }
}

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

// Run `worker` over `items` with a small fixed pool of concurrent lanes. Each
// lane jitter-sleeps between its own requests, so effective throughput is
// roughly POOL requests per pace interval. Progress is reported per completed
// item (order is not guaranteed). Stops early if the abort signal fires or too
// many robot-check pages come back.
async function runPool<T>(
  items: T[],
  signal: AbortSignal,
  worker: (item: T) => Promise<void>,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const total = items.length;
  let next = 0;
  let done = 0;
  let blocked = 0;
  let giveUp = false;

  async function lane(): Promise<void> {
    for (;;) {
      if (signal.aborted || giveUp) return;
      const index = next++;
      if (index >= total) return;
      const item = items[index];
      if (item === undefined) return;
      try {
        await worker(item);
      } catch (err) {
        if (err instanceof BlockedError) {
          blocked += 1;
          if (blocked >= BLOCK_GIVE_UP) giveUp = true;
        } else {
          throw err;
        }
      }
      onProgress(++done, total);
      if (signal.aborted || giveUp) return;
      await sleep(signal);
    }
  }

  await Promise.all(Array.from({ length: Math.min(POOL, total) }, () => lane()));
}

async function fetchDetailHtml(url: string, signal: AbortSignal): Promise<string | null> {
  const html = await fetchHtml(url, signal);
  if (html && BLOCKED_RE.test(html)) throw new BlockedError();
  return html;
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
  await runPool(
    targets,
    signal,
    async (item) => {
      const html = await fetchDetailHtml(item.url, signal);
      if (html) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        item.taggedAsins = asinsFromDoc(doc);
        item.productsKnown = true;
      }
    },
    onProgress,
  );
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
  await runPool(
    list,
    signal,
    async (asin) => {
      const html = await fetchDetailHtml(`${location.origin}/dp/${asin}`, signal);
      if (html) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const parentAsin = html.match(PARENT_RE)?.[1] ?? null;
        details.set(asin, { available: extractInStock(doc), parentAsin });
      }
    },
    onProgress,
  );
  return { details, capped };
}
