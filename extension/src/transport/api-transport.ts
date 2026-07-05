import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import type { Finding, FindingTransport } from "./types";

// Website API transport. Groups a mixed batch by finding type and posts each
// group to its /api/extension/* endpoint with the license key as a Bearer
// token. Field names translate camelCase -> snake_case at this boundary only.

export const apiTransport: FindingTransport = {
  id: "api",

  async isAvailable(): Promise<boolean> {
    const state = await getState();
    return Boolean(state.auth.licenseKey && state.settings.syncEnabled);
  },

  async send(batch: Finding[]): Promise<{ ok: boolean; retry: boolean }> {
    const state = await getState();
    const key = state.auth.licenseKey;
    if (!key) return { ok: false, retry: false };

    const scans = batch.filter((f) => f.type === "product_scan");
    const gaps = batch.filter((f) => f.type === "content_gap");
    const issues = batch.filter((f) => f.type === "storefront_issue");

    const posts: Array<Promise<Response>> = [];
    if (scans.length > 0) {
      posts.push(
        post(ENDPOINTS.scans, key, {
          scans: scans.map((f) => ({
            asin: f.asin,
            marketplace: f.marketplace,
            title: f.title ?? null,
            price_cents: f.priceCents ?? null,
            currency: f.currency ?? "USD",
            brand_video_count: f.counts.brand,
            influencer_video_count: f.counts.influencer,
            customer_video_count: f.counts.customer + f.counts.unknown,
            approved: f.approved,
            approved_criteria: f.approvedCriteria ?? null,
            scanned_at: f.scannedAt,
          })),
        }),
      );
    }
    if (gaps.length > 0) {
      posts.push(
        post(ENDPOINTS.gaps, key, {
          gaps: gaps.map((f) => ({
            asin: f.asin,
            marketplace: f.marketplace,
            title: f.title ?? null,
            gap_type: f.gapType,
            influencer_video_count: f.influencerVideoCount,
            order_date: f.orderDate ?? null,
            detected_at: f.detectedAt,
          })),
        }),
      );
    }
    if (issues.length > 0) {
      posts.push(
        post(ENDPOINTS.storefrontIssues, key, {
          storefront_url: issues[0]?.storefrontUrl ?? null,
          issues: issues.map((f) => ({
            issue_type: f.issueType,
            severity: f.severity,
            subject: f.subject ?? null,
            detail: f.detail ?? null,
            detected_at: f.detectedAt,
          })),
        }),
      );
    }

    try {
      const responses = await Promise.all(posts);
      if (responses.every((r) => r.ok)) return { ok: true, retry: false };
      // 401 means the key was revoked: do not spin on the batch forever.
      const authFailed = responses.some((r) => r.status === 401);
      return { ok: false, retry: !authFailed };
    } catch {
      return { ok: false, retry: true }; // network trouble, keep the batch
    }
  },
};

function post(url: string, licenseKey: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${licenseKey}`,
    },
    body: JSON.stringify(body),
  });
}
