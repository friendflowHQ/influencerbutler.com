// Findings are the one currency of the extension: tools emit them, the
// background queues them, and transports deliver them (website API today,
// desktop HUD local bridge later). Field names mirror the
// /api/extension/* payload contracts exactly so transports serialize once.

export type VideoCounts = {
  total: number;
  influencer: number;
  brand: number;
  customer: number;
  unknown: number;
};

export type ProductScanFinding = {
  type: "product_scan";
  asin: string;
  marketplace: string;
  title?: string;
  priceCents?: number | null;
  currency?: string;
  counts: VideoCounts;
  approved: boolean;
  approvedCriteria?: Record<string, boolean>;
  scannedAt: string;
};

export type ContentGapFinding = {
  type: "content_gap";
  asin: string;
  marketplace: string;
  title?: string;
  gapType: "no_influencer_video" | "low_influencer_video";
  influencerVideoCount: number;
  orderDate?: string | null;
  detectedAt: string;
};

export type StorefrontIssueFinding = {
  type: "storefront_issue";
  storefrontUrl?: string;
  issueType: "untagged" | "over_tagged" | "unavailable_product";
  severity: "info" | "warn" | "error";
  subject?: string;
  detail?: string;
  detectedAt: string;
};

export type Finding = ProductScanFinding | ContentGapFinding | StorefrontIssueFinding;

export interface FindingTransport {
  id: "api" | "local";
  isAvailable(): Promise<boolean>;
  send(batch: Finding[]): Promise<{ ok: boolean; retry: boolean }>;
}

export function findingKey(finding: Finding): string {
  const day = finding.type === "storefront_issue"
    ? finding.detectedAt.slice(0, 10)
    : finding.type === "content_gap"
      ? finding.detectedAt.slice(0, 10)
      : finding.scannedAt.slice(0, 10);
  switch (finding.type) {
    case "product_scan":
      return `${finding.type}:${finding.asin}:${finding.marketplace}:${day}`;
    case "content_gap":
      return `${finding.type}:${finding.asin}:${finding.marketplace}:${finding.gapType}:${day}`;
    case "storefront_issue":
      return `${finding.type}:${finding.subject ?? ""}:${finding.issueType}:${day}`;
  }
}
