/**
 * GET /api/extension/summary - one round-trip for the /dashboard/extension
 * page: stat counts, recent scans, open content gaps, and the latest
 * storefront snapshot. Session cookie (dashboard) or Bearer license key.
 */
import { resolveAuth } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
} from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  const auth = await resolveAuth(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);
  const userId = auth.auth.userId;

  const admin = createAdminClient();

  const [scanCount, approvedCount, recentScans, gaps, issues] = await Promise.all([
    admin
      .from("extension_product_scans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    admin
      .from("extension_product_scans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("approved", true),
    admin
      .from("extension_product_scans")
      .select(
        "asin, marketplace, title, price_cents, currency, brand_video_count, influencer_video_count, customer_video_count, approved, scanned_at",
      )
      .eq("user_id", userId)
      .order("scanned_at", { ascending: false })
      .limit(10),
    admin
      .from("extension_content_gaps")
      .select("asin, marketplace, title, gap_type, influencer_video_count, detected_at")
      .eq("user_id", userId)
      .is("resolved_at", null)
      .order("detected_at", { ascending: false })
      .limit(10),
    admin
      .from("extension_storefront_issues")
      .select("storefront_url, issue_type, severity, subject, detail, detected_at")
      .eq("user_id", userId)
      .order("detected_at", { ascending: false })
      .limit(50),
  ]);

  const firstError =
    scanCount.error ?? approvedCount.error ?? recentScans.error ?? gaps.error ?? issues.error;
  if (firstError) {
    if (isMissingTableError(firstError)) return migrationPendingResponse();
    console.error("extension/summary: query failed", firstError);
    return jsonWithCors({ error: "Could not load summary" }, 500);
  }

  const lastSyncAt =
    recentScans.data?.[0]?.scanned_at ??
    gaps.data?.[0]?.detected_at ??
    issues.data?.[0]?.detected_at ??
    null;

  return jsonWithCors({
    ok: true,
    scanCounts: {
      total: scanCount.count ?? 0,
      approved: approvedCount.count ?? 0,
    },
    openGapCount: gaps.data?.length ?? 0,
    issueCount: issues.data?.length ?? 0,
    recentScans: recentScans.data ?? [],
    topGaps: gaps.data ?? [],
    storefrontIssues: issues.data ?? [],
    lastSyncAt,
  });
}
