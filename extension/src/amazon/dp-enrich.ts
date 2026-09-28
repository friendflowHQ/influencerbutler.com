import { fetchText } from "./html-fetch";
import { extractDpStatic, isBlockedHtml, type DpStaticSignals } from "./dp-static";
import { setCachedDp } from "./dp-cache";

// One tier-1 enrichment fetch: pull an ASIN's product page as static HTML
// through the shared serialized fetcher, parse the video-slot and demand
// signals off it, and cache the result. Shared by the store and search
// overlays so both ride the same cache and the same captcha cooldown.

// After Amazon serves a robot-check page, every further fetch would see the
// same block and extend it. Both overlays pause automatic enrichment for this
// long once either of them trips the check. Content-script module state, so
// the cooldown is per-tab; two tabs enriching in parallel each learn about a
// block on their own first tripped fetch.
const BLOCK_COOLDOWN_MS = 10 * 60 * 1000;

let blockedUntil = 0;

export function markBlocked(): void {
  blockedUntil = Date.now() + BLOCK_COOLDOWN_MS;
}

export function isCoolingDown(): boolean {
  return Date.now() < blockedUntil;
}

export type EnrichOneResult = {
  signals: DpStaticSignals | null;
  // Amazon served a robot-check page: the caller should stop its run and the
  // shared cooldown is already armed.
  blocked: boolean;
  // The fetch itself failed (network / throttle); the caller decides how many
  // failures to tolerate.
  failed: boolean;
};

export async function enrichOne(opts: {
  asin: string;
  origin: string;
  marketplace: string;
  signal: AbortSignal;
}): Promise<EnrichOneResult> {
  let html: string;
  try {
    html = await fetchText(`${opts.origin}/dp/${opts.asin}`, opts.signal);
  } catch {
    return { signals: null, blocked: false, failed: true };
  }
  if (isBlockedHtml(html)) {
    markBlocked();
    return { signals: null, blocked: true, failed: false };
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const signals = extractDpStatic(doc, html);
  void setCachedDp(`${opts.marketplace}:${opts.asin}`, signals);
  return { signals, blocked: false, failed: false };
}
