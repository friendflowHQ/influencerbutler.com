/**
 * /api/extension/deals - Amazon products harvested from third-party daily-deal
 * aggregator sites by the extension's Deal Sites Harvester. One row per
 * (user, asin, marketplace): a re-harvest of the same product updates its row
 * (price and discount move daily), so the write is an idempotent upsert.
 *
 * POST (extension, Bearer license key): upsert a batch keyed on
 * (user_id, asin, marketplace).
 * GET (dashboard or extension): recent harvested deals, newest-first.
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

export async function POST(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }
  const deals = (body as { deals?: unknown })?.deals;
  if (!Array.isArray(deals) || deals.length === 0 || deals.length > EXT_MAX_BATCH) {
    return jsonWithCors({ error: `deals must be an array of 1-${EXT_MAX_BATCH}` }, 400);
  }

  const now = new Date().toISOString();
  const rows = [];
  for (const raw of deals) {
    const deal = raw as Record<string, unknown>;
    const asin = typeof deal.asin === "string" ? deal.asin.toUpperCase() : "";
    const marketplace = typeof deal.marketplace === "string" ? deal.marketplace.toLowerCase() : "";
    const detectedAt = parseTimestamp(deal.detected_at);
    const sourceUrl = cleanString(deal.source_url, 500);
    if (!ASIN_RE.test(asin) || !MARKETPLACE_RE.test(marketplace) || !detectedAt || !sourceUrl) {
      continue;
    }
    rows.push({
      user_id: auth.auth.userId,
      asin,
      marketplace,
      title: cleanString(deal.title, EXT_TITLE_MAX),
      price_cents: clampInt(deal.price_cents, 0, 100_000_000),
      list_price_cents: clampInt(deal.list_price_cents, 0, 100_000_000),
      discount_pct: clampInt(deal.discount_pct, 0, 100),
      commission_rate_pct: clampInt(deal.commission_rate_pct, 0, 100),
      currency: cleanString(deal.currency, 8) ?? "USD",
      image_url: cleanString(deal.image_url, 500),
      source_url: sourceUrl,
      promo_code: cleanString(deal.promo_code, 40),
      detected_at: detectedAt,
      updated_at: now,
    });
  }
  if (rows.length === 0) {
    return jsonWithCors({ error: "No valid deals in batch" }, 400);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("extension_deals")
    .upsert(rows, { onConflict: "user_id,asin,marketplace" });
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/deals: upsert failed", error);
    return jsonWithCors({ error: "Could not save deals" }, 500);
  }

  return jsonWithCors({ ok: true, upserted: rows.length });
}

export async function GET(request: Request) {
  const auth = await resolveAuth(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  const url = new URL(request.url);
  const limit = clampInt(Number(url.searchParams.get("limit") ?? 200), 1, 500) ?? 200;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("extension_deals")
    .select(
      "asin, marketplace, title, price_cents, list_price_cents, discount_pct, commission_rate_pct, currency, image_url, source_url, promo_code, detected_at",
    )
    .eq("user_id", auth.auth.userId)
    .order("detected_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/deals: list failed", error);
    return jsonWithCors({ error: "Could not load deals" }, 500);
  }

  return jsonWithCors({ ok: true, deals: data ?? [] });
}
