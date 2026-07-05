/**
 * /api/extension/scans - product video-count scans from the Chrome extension.
 *
 * POST (extension, Bearer license key): upsert a batch of scans keyed on
 * (user_id, asin, marketplace).
 * GET (dashboard session cookie or extension Bearer): newest-first list,
 * optional ?approved=1 filter.
 */
import { resolveAuth, resolveLicenseOnly } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ASIN_RE,
  EXT_MAX_BATCH,
  EXT_TITLE_MAX,
  MARKETPLACE_RE,
  cleanString,
  clampInt,
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
  parseTimestamp,
} from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

type ScanRow = {
  user_id: string;
  asin: string;
  marketplace: string;
  title: string | null;
  price_cents: number | null;
  currency: string;
  brand_video_count: number;
  influencer_video_count: number;
  customer_video_count: number;
  approved: boolean;
  approved_criteria: Record<string, boolean> | null;
  scanned_at: string;
  updated_at: string;
};

export async function POST(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }
  const scans = (body as { scans?: unknown })?.scans;
  if (!Array.isArray(scans) || scans.length === 0 || scans.length > EXT_MAX_BATCH) {
    return jsonWithCors({ error: `scans must be an array of 1-${EXT_MAX_BATCH}` }, 400);
  }

  const now = new Date().toISOString();
  const rows: ScanRow[] = [];
  for (const raw of scans) {
    const scan = raw as Record<string, unknown>;
    const asin = typeof scan.asin === "string" ? scan.asin.toUpperCase() : "";
    const marketplace = typeof scan.marketplace === "string" ? scan.marketplace.toLowerCase() : "";
    const scannedAt = parseTimestamp(scan.scanned_at);
    if (!ASIN_RE.test(asin) || !MARKETPLACE_RE.test(marketplace) || !scannedAt) continue;
    rows.push({
      user_id: auth.auth.userId,
      asin,
      marketplace,
      title: cleanString(scan.title, EXT_TITLE_MAX),
      price_cents: clampInt(scan.price_cents, 0, 100_000_000),
      currency: cleanString(scan.currency, 3) ?? "USD",
      brand_video_count: clampInt(scan.brand_video_count, 0, 10_000) ?? 0,
      influencer_video_count: clampInt(scan.influencer_video_count, 0, 10_000) ?? 0,
      customer_video_count: clampInt(scan.customer_video_count, 0, 10_000) ?? 0,
      approved: scan.approved === true,
      approved_criteria:
        scan.approved_criteria && typeof scan.approved_criteria === "object"
          ? (scan.approved_criteria as Record<string, boolean>)
          : null,
      scanned_at: scannedAt,
      updated_at: now,
    });
  }
  if (rows.length === 0) {
    return jsonWithCors({ error: "No valid scans in batch" }, 400);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("extension_product_scans")
    .upsert(rows, { onConflict: "user_id,asin,marketplace" });
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/scans: upsert failed", error);
    return jsonWithCors({ error: "Could not save scans" }, 500);
  }

  return jsonWithCors({ ok: true, upserted: rows.length });
}

export async function GET(request: Request) {
  const auth = await resolveAuth(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  const url = new URL(request.url);
  const limit = clampInt(Number(url.searchParams.get("limit") ?? 50), 1, 200) ?? 50;
  const approvedOnly = url.searchParams.get("approved") === "1";

  const admin = createAdminClient();
  let query = admin
    .from("extension_product_scans")
    .select(
      "asin, marketplace, title, price_cents, currency, brand_video_count, influencer_video_count, customer_video_count, approved, approved_criteria, scanned_at",
    )
    .eq("user_id", auth.auth.userId)
    .order("scanned_at", { ascending: false })
    .limit(limit);
  if (approvedOnly) query = query.eq("approved", true);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/scans: list failed", error);
    return jsonWithCors({ error: "Could not load scans" }, 500);
  }

  return jsonWithCors({ ok: true, scans: data ?? [] });
}
