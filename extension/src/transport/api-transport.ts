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
    const orders = batch.filter((f) => f.type === "order");
    const deals = batch.filter((f) => f.type === "deal");
    const creators = batch.filter((f) => f.type === "instagram_creator");

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
    // Shared product-catalogue contribution (opt-in, OFF by default). Only when
    // the user has turned it on do the research signals (best-seller rank,
    // bought-past-month, category, brand) leave the machine for the pool; with
    // it off, nothing here is transmitted. Only send observations that carry a
    // real market signal, so we never write empty rows.
    if (state.settings.contributeCatalogue && scans.length > 0) {
      const items = scans
        .filter((f) => f.bestsellerRank != null || f.boughtPastMonth != null || f.priceCents != null)
        .map((f) => ({
          asin: f.asin,
          marketplace: f.marketplace,
          captured_at: f.scannedAt,
          price_cents: f.priceCents ?? null,
          currency: f.currency ?? "USD",
          bsr_rank: f.bestsellerRank?.rank ?? null,
          bsr_category: f.bestsellerRank?.category ?? null,
          bought_past_month: f.boughtPastMonth ?? null,
          category_label: f.category ?? null,
          brand: f.brand ?? null,
          source: "browse",
        }));
      if (items.length > 0) {
        posts.push(post(ENDPOINTS.market, key, { items }));
      }
    }
    // Shared video-placement contribution (same opt-in as the market pool). One
    // item per scanned product carrying the creator videos in its carousel, so
    // the pool can track placement over days. Only scans that actually captured
    // videos are sent; with the opt-in off, nothing here is transmitted.
    if (state.settings.contributeCatalogue && scans.length > 0) {
      const videoItems = scans
        .filter((f) => f.videos && f.videos.length > 0)
        .map((f) => ({
          asin: f.asin,
          marketplace: f.marketplace,
          observed_at: f.scannedAt,
          videos: (f.videos ?? []).map((v) => ({
            video_id: v.videoId,
            creator_id: v.creatorId,
            creator_name: v.creatorName,
            creator_type: v.creatorType,
            carousel: v.carousel,
            position: v.position,
            title: v.title,
            video_url: v.url,
          })),
        }));
      if (videoItems.length > 0) {
        posts.push(post(ENDPOINTS.videoIntel, key, { items: videoItems }));
      }
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
    if (orders.length > 0) {
      posts.push(
        post(ENDPOINTS.orders, key, {
          orders: orders.map((f) => ({
            order_id: f.orderId,
            order_date: f.orderDate ?? null,
            asin: f.asin,
            marketplace: f.marketplace,
            title: f.title ?? null,
            price_cents: f.priceCents ?? null,
            currency: f.currency ?? "USD",
            detected_at: f.detectedAt,
          })),
        }),
      );
    }

    if (deals.length > 0) {
      posts.push(
        post(ENDPOINTS.deals, key, {
          deals: deals.map((f) => ({
            asin: f.asin,
            marketplace: f.marketplace,
            title: f.title ?? null,
            price_cents: f.priceCents ?? null,
            list_price_cents: f.listPriceCents ?? null,
            discount_pct: f.discountPct ?? null,
            commission_rate_pct: f.commissionRatePct ?? null,
            currency: f.currency ?? "USD",
            image_url: f.imageUrl ?? null,
            source_url: f.sourceUrl,
            promo_code: f.promoCode ?? null,
            detected_at: f.detectedAt,
          })),
        }),
      );
    }

    if (creators.length > 0) {
      posts.push(
        post(ENDPOINTS.instagramCreators, key, {
          creators: creators.map((f) => ({
            username: f.username,
            email: f.email,
            source_hashtag: f.sourceHashtag,
            full_name: f.fullName ?? null,
            follower_count: f.followerCount ?? null,
            engagement_rate_pct: f.engagementRatePct ?? null,
            bio_link_url: f.bioLinkUrl ?? null,
            post_url: f.postUrl ?? null,
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
