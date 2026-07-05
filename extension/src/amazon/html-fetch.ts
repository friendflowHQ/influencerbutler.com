import { FETCH_DELAY_MAX_MS, FETCH_DELAY_MIN_MS } from "../shared/constants";

// Shared fetcher for the explicit, button-triggered scans. Same-origin
// credentialed requests from the content script, strictly sequential with
// jittered delays so scan traffic reads like a person browsing. Nothing in
// the extension fetches Amazon outside this module.

let chain: Promise<unknown> = Promise.resolve();
let lastFetchAt = 0;

export function fetchDoc(url: string, signal?: AbortSignal): Promise<Document> {
  const task = chain.then(async () => {
    signal?.throwIfAborted();
    const wait = lastFetchAt + jitteredDelay() - Date.now();
    if (wait > 0) await sleep(wait, signal);
    signal?.throwIfAborted();
    lastFetchAt = Date.now();
    const response = await fetch(url, { credentials: "include", signal });
    if (!response.ok) throw new Error(`fetch ${url} failed: ${response.status}`);
    const html = await response.text();
    return new DOMParser().parseFromString(html, "text/html");
  });
  chain = task.catch(() => undefined);
  return task;
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
