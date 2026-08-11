import { FETCH_DELAY_MAX_MS, FETCH_DELAY_MIN_MS } from "../shared/constants";

// Shared fetcher for on-page scans: the explicit button-triggered ones plus
// the store overlay's automatic (but cache-first, grid-capped, bail-on-block)
// enrichment. Same-origin credentialed requests from the content script,
// strictly sequential with jittered delays so scan traffic reads like a
// person browsing. The one chain also serializes overlapping scans against
// each other. Nothing in the extension fetches Amazon outside this module.

let chain: Promise<unknown> = Promise.resolve();
let lastFetchAt = 0;

// Raw-HTML variant for callers that regex the string before (or instead of)
// parsing: robot-check detection, carousel markers.
export function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const task = chain.then(async () => {
    signal?.throwIfAborted();
    const wait = lastFetchAt + jitteredDelay() - Date.now();
    if (wait > 0) await sleep(wait, signal);
    signal?.throwIfAborted();
    lastFetchAt = Date.now();
    const response = await fetch(url, { credentials: "include", signal });
    if (!response.ok) throw new Error(`fetch ${url} failed: ${response.status}`);
    return response.text();
  });
  chain = task.catch(() => undefined);
  return task;
}

export async function fetchDoc(url: string, signal?: AbortSignal): Promise<Document> {
  const html = await fetchText(url, signal);
  return new DOMParser().parseFromString(html, "text/html");
}

function jitteredDelay(): number {
  return FETCH_DELAY_MIN_MS + Math.random() * (FETCH_DELAY_MAX_MS - FETCH_DELAY_MIN_MS);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
