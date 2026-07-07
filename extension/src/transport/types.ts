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
  // Availability read off the page, used by the watchlist restock check. The
  // server ignores it; it rides along so the background tab-scan can surface it.
  inStock?: boolean;
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

// One row per line item harvested from Amazon order history by the Orders
// Butler tool. Mirrors the desktop runner's order pull: an order can contain
// several ASINs, so we emit one finding per (order, asin) pair.
export type OrderFinding = {
  type: "order";
  orderId: string;
  orderDate: string | null; // YYYY-MM-DD as shown by Amazon, or null if unread
  marketplace: string;
  asin: string;
  title?: string;
  priceCents?: number | null;
  currency?: string;
  detectedAt: string;
};

// One product harvested from a third-party daily-deals aggregator page by the
// Deal Sites Harvester. The aggregator only reliably yields the Amazon ASIN and
// the page it came from; everything else (title, price, discount, commission)
// is best-effort, filled by Creator API enrichment when it is configured. This
// is the browser counterpart to pasting a list of deal sites into the app: one
// finding per (aggregator page, asin) product.
export type DealFinding = {
  type: "deal";
  asin: string;
  marketplace: string;
  title?: string;
  priceCents?: number | null;
  listPriceCents?: number | null;
  discountPct?: number | null;
  commissionRatePct?: number | null;
  currency?: string;
  imageUrl?: string;
  sourceUrl: string; // the aggregator page the ASIN was found on
  promoCode?: string | null;
  detectedAt: string;
};

export type Finding =
  | ProductScanFinding
  | ContentGapFinding
  | StorefrontIssueFinding
  | OrderFinding
  | DealFinding;

export interface FindingTransport {
  id: "api" | "local";
  isAvailable(): Promise<boolean>;
  send(batch: Finding[]): Promise<{ ok: boolean; retry: boolean }>;
}

export function findingKey(finding: Finding): string {
  const day =
    finding.type === "product_scan"
      ? finding.scannedAt.slice(0, 10)
      : finding.detectedAt.slice(0, 10);
  switch (finding.type) {
    case "product_scan":
      return `${finding.type}:${finding.asin}:${finding.marketplace}:${day}`;
    case "content_gap":
      return `${finding.type}:${finding.asin}:${finding.marketplace}:${finding.gapType}:${day}`;
    case "storefront_issue":
      return `${finding.type}:${finding.subject ?? ""}:${finding.issueType}:${day}`;
    // An order line item is immutable history: key on (order, asin) with no
    // day component so the same purchase records once, not once per sync day.
    case "order":
      return `${finding.type}:${finding.orderId}:${finding.asin}:${finding.marketplace}`;
    // A harvested deal keys on (asin, marketplace, day): a re-harvest of the
    // same product on the same day updates its row rather than duplicating it,
    // while a fresh day records the deal again (price and discount move daily).
    case "deal":
      return `${finding.type}:${finding.asin}:${finding.marketplace}:${day}`;
  }
}
