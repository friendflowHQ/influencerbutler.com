import { STOREFRONT_SCAN_CAP } from "../../shared/constants";
import { fetchDoc } from "../../amazon/html-fetch";
import { findVideoTiles, parseVideoDetail, type StorefrontVideoTile } from "../../amazon/storefront-dom";
import type { StorefrontIssueFinding } from "../../transport/types";

// Storefront health scan: fetch each video's detail page and look for
// untagged videos, over-tagged videos, and tagged products that have gone
// unavailable. Explicit and rate-limited, same rules as the order scan.

export type StorefrontScanResult = {
  checked: number;
  issues: StorefrontIssueFinding[];
};

export const OVER_TAGGED_THRESHOLD = 10;

export async function scanStorefront(
  doc: Document,
  storefrontUrl: string,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<StorefrontScanResult> {
  const tiles = findVideoTiles(doc).slice(0, STOREFRONT_SCAN_CAP);
  const issues: StorefrontIssueFinding[] = [];
  let checked = 0;

  for (const tile of tiles) {
    if (signal.aborted) break;
    onProgress(checked, tiles.length);
    try {
      const detail = await fetchDoc(tile.url, signal);
      const info = parseVideoDetail(detail);
      issues.push(...evaluateVideo(tile, info, storefrontUrl));
      checked += 1;
    } catch (error) {
      if (signal.aborted) break;
      // one unreadable video must not sink the scan
      checked += 1;
    }
  }
  onProgress(checked, tiles.length);

  return { checked, issues };
}

export function evaluateVideo(
  tile: StorefrontVideoTile,
  info: { taggedProducts: number; unavailableProducts: number },
  storefrontUrl: string,
): StorefrontIssueFinding[] {
  const now = new Date().toISOString();
  const subject = tile.title?.slice(0, 120) || tile.videoId || tile.url;
  const issues: StorefrontIssueFinding[] = [];

  if (info.taggedProducts === 0) {
    issues.push({
      type: "storefront_issue",
      storefrontUrl,
      issueType: "untagged",
      severity: "error",
      subject,
      detail: "Video has no tagged products, so it cannot earn commissions.",
      detectedAt: now,
    });
  } else if (info.taggedProducts > OVER_TAGGED_THRESHOLD) {
    issues.push({
      type: "storefront_issue",
      storefrontUrl,
      issueType: "over_tagged",
      severity: "warn",
      subject,
      detail: `Video tags ${info.taggedProducts} products; heavy tagging dilutes clicks.`,
      detectedAt: now,
    });
  }

  if (info.unavailableProducts > 0) {
    issues.push({
      type: "storefront_issue",
      storefrontUrl,
      issueType: "unavailable_product",
      severity: "warn",
      subject,
      detail: `${info.unavailableProducts} tagged product${info.unavailableProducts === 1 ? " is" : "s are"} unavailable.`,
      detectedAt: now,
    });
  }

  return issues;
}
