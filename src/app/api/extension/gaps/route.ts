/**
 * /api/extension/gaps - order-history content gaps from the Chrome extension:
 * products the user bought that have few or zero influencer videos.
 *
 * POST (extension, Bearer license key): upsert a batch keyed on
 * (user_id, asin, marketplace). Sending resolved: true stamps resolved_at.
 * GET (dashboard or extension): open gaps newest-first; ?open=0 includes
 * resolved ones.
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

const GAP_TYPES = new Set(["no_influencer_video", "low_influencer_video"]);

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }
  const gaps = (body as { gaps?: unknown })?.gaps;
  if (!Array.isArray(gaps) || gaps.length === 0 || gaps.length > EXT_MAX_BATCH) {
    return jsonWithCors({ error: `gaps must be an array of 1-${EXT_MAX_BATCH}` }, 400);
  }

  const now = new Date().toISOString();
  const rows = [];
  for (const raw of gaps) {
    const gap = raw as Record<string, unknown>;
    const asin = typeof gap.asin === "string" ? gap.asin.toUpperCase() : "";
    const marketplace = typeof gap.marketplace === "string" ? gap.marketplace.toLowerCase() : "";
    const gapType = typeof gap.gap_type === "string" ? gap.gap_type : "";
    const detectedAt = parseTimestamp(gap.detected_at);
    if (!ASIN_RE.test(asin) || !MARKETPLACE_RE.test(marketplace) || !GAP_TYPES.has(gapType) || !detectedAt) {
      continue;
    }
    const orderDate = typeof gap.order_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(gap.order_date)
      ? gap.order_date.slice(0, 10)
      : null;
    rows.push({
      user_id: auth.auth.userId,
      asin,
      marketplace,
      title: cleanString(gap.title, EXT_TITLE_MAX),
      gap_type: gapType,
      influencer_video_count: clampInt(gap.influencer_video_count, 0, 10_000) ?? 0,
      order_date: orderDate,
      detected_at: detectedAt,
      resolved_at: gap.resolved === true ? now : null,
      updated_at: now,
    });
  }
  if (rows.length === 0) {
    return jsonWithCors({ error: "No valid gaps in batch" }, 400);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("extension_content_gaps")
    .upsert(rows, { onConflict: "user_id,asin,marketplace" });
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/gaps: upsert failed", error);
    return jsonWithCors({ error: "Could not save gaps" }, 500);
  }

  return jsonWithCors({ ok: true, upserted: rows.length });
}

export async function GET(request: Request) {
  const auth = await resolveAuth(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  const url = new URL(request.url);
  const limit = clampInt(Number(url.searchParams.get("limit") ?? 100), 1, 500) ?? 100;
  const openOnly = url.searchParams.get("open") !== "0";

  const admin = createAdminClient();
  let query = admin
    .from("extension_content_gaps")
    .select("asin, marketplace, title, gap_type, influencer_video_count, order_date, detected_at, resolved_at")
    .eq("user_id", auth.auth.userId)
    .order("detected_at", { ascending: false })
    .limit(limit);
  if (openOnly) query = query.is("resolved_at", null);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/gaps: list failed", error);
    return jsonWithCors({ error: "Could not load gaps" }, 500);
  }

  return jsonWithCors({ ok: true, gaps: data ?? [] });
}
