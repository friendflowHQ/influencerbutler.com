import { findVideoTiles, type StorefrontVideoTile } from "../../amazon/storefront-dom";
import type { StorefrontIssueFinding } from "../../transport/types";

// Storefront health scan. Tagged products live right in the grid cards, so the
// scan reads the loaded DOM directly: no fetching, instant, and it sees every
// video the user has scrolled into view. Flags untagged videos (no products,
// so no commissions) and over-tagged videos (heavy tagging dilutes clicks).
// Product availability is not exposed in the grid, so that check is left to
// the desktop app.

export type StorefrontScanResult = {
  checked: number;
  issues: StorefrontIssueFinding[];
};

export const OVER_TAGGED_THRESHOLD = 10;

export function scanStorefront(doc: Document, storefrontUrl: string): StorefrontScanResult {
  const tiles = findVideoTiles(doc);
  const issues: StorefrontIssueFinding[] = [];
  for (const tile of tiles) {
    issues.push(...evaluateVideo(tile, storefrontUrl));
  }
  return { checked: tiles.length, issues };
}

export function evaluateVideo(
  tile: StorefrontVideoTile,
  storefrontUrl: string,
): StorefrontIssueFinding[] {
  const now = new Date().toISOString();
  const subject = tile.title ?? tile.videoId ?? "Video";
  const issues: StorefrontIssueFinding[] = [];

  if (tile.taggedProducts === 0) {
    issues.push({
      type: "storefront_issue",
      storefrontUrl,
      issueType: "untagged",
      severity: "error",
      subject,
      detail: "Video has no tagged products, so it cannot earn commissions.",
      detectedAt: now,
    });
  } else if (tile.taggedProducts > OVER_TAGGED_THRESHOLD) {
    issues.push({
      type: "storefront_issue",
      storefrontUrl,
      issueType: "over_tagged",
      severity: "warn",
      subject,
      detail: `Video tags ${tile.taggedProducts} products; heavy tagging dilutes clicks.`,
      detectedAt: now,
    });
  }

  return issues;
}
