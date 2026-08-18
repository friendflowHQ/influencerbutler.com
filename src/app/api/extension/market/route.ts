/**
 * /api/extension/market - the shared product catalogue ("internal Keepa").
 *
 * POST (extension, Bearer license key): a signed-in creator who has turned ON
 * the "contribute to catalogue" setting sends product observations (ASIN,
 * price, best-seller rank, "bought in past month", category, brand). We APPEND
 * one product_market_history row per observation (so price/rank accumulate a
 * real history) and upsert product_market_latest for fast "now" reads. This is
 * a de-identified pool: contributor_user_id is kept for audit only and is never
 * returned on read. Contribution is opt-in and gated client-side; the payload
 * only ever carries these fields when the user has consented.
 *
 * GET (dashboard session cookie or extension Bearer): pooled data for a batch
 * of ASINs - latest snapshot, recent price/BSR trend, real bought-past-month,
 * and a modeled monthly-sales estimate. Available to every signed-in user so
 * the whole community benefits from the pool.
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
import { estMonthlySales, seedCurveFor, type SalesCurve } from "@/lib/market-estimate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How many recent history points to return per ASIN on read.
const TREND_POINTS = 60;
// Allowed contribution sources, so a bad payload cannot invent arbitrary tags.
const SOURCES = new Set(["browse", "search", "discovery", "watchlist", "desktop"]);

export async function OPTIONS() {
  return optionsResponse();
}

type HistoryRow = {
  asin: string;
  marketplace: string;
  captured_at: string;
  price_cents: number | null;
  currency: string;
  bsr_rank: number | null;
  bsr_category: string | null;
  bought_past_month: number | null;
  category_label: string | null;
  brand: string | null;
  source: string;
  contributor_user_id: string;
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
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > EXT_MAX_BATCH) {
    return jsonWithCors({ error: `items must be an array of 1-${EXT_MAX_BATCH}` }, 400);
  }

  const rows: HistoryRow[] = [];
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const asin = typeof item.asin === "string" ? item.asin.toUpperCase() : "";
    const marketplace = typeof item.marketplace === "string" ? item.marketplace.toLowerCase() : "";
    const capturedAt = parseTimestamp(item.captured_at);
    if (!ASIN_RE.test(asin) || !MARKETPLACE_RE.test(marketplace) || !capturedAt) continue;
    const source =
      typeof item.source === "string" && SOURCES.has(item.source) ? item.source : "browse";
    rows.push({
      asin,
      marketplace,
      captured_at: capturedAt,
      price_cents: clampInt(item.price_cents, 0, 100_000_000),
      currency: cleanString(item.currency, 3) ?? "USD",
      bsr_rank: clampInt(item.bsr_rank, 1, 100_000_000),
      bsr_category: cleanString(item.bsr_category, EXT_TITLE_MAX),
      bought_past_month: clampInt(item.bought_past_month, 0, 100_000_000),
      category_label: cleanString(item.category_label, EXT_TITLE_MAX),
      brand: cleanString(item.brand, EXT_TITLE_MAX),
      source,
      contributor_user_id: auth.auth.userId,
    });
  }
  if (rows.length === 0) {
    return jsonWithCors({ error: "No valid items in batch" }, 400);
  }

  const admin = createAdminClient();
  const { error: histError } = await admin.from("product_market_history").insert(rows);
  if (histError) {
    if (isMissingTableError(histError)) return migrationPendingResponse();
    console.error("extension/market: history insert failed", histError);
    return jsonWithCors({ error: "Could not save observations" }, 500);
  }

  // Upsert the current snapshot. Keep the newest observation per (asin,
  // marketplace) within this batch so we do not thrash the row order.
  const latestByKey = new Map<string, HistoryRow>();
  for (const row of rows) {
    const key = `${row.asin}:${row.marketplace}`;
    const prev = latestByKey.get(key);
    if (!prev || row.captured_at > prev.captured_at) latestByKey.set(key, row);
  }
  const now = new Date().toISOString();
  const snapshots = Array.from(latestByKey.values()).map((row) => ({
    asin: row.asin,
    marketplace: row.marketplace,
    price_cents: row.price_cents,
    currency: row.currency,
    bsr_rank: row.bsr_rank,
    bsr_category: row.bsr_category,
    bought_past_month: row.bought_past_month,
    category_label: row.category_label,
    brand: row.brand,
    captured_at: row.captured_at,
    updated_at: now,
  }));
  const { error: latestError } = await admin
    .from("product_market_latest")
    .upsert(snapshots, { onConflict: "asin,marketplace" });
  if (latestError) {
    // History already landed; a snapshot failure is non-fatal (reads fall back
    // to the history log), so log and still report success for the append.
    console.error("extension/market: latest upsert failed", latestError);
  }

  return jsonWithCors({ ok: true, recorded: rows.length });
}

export async function GET(request: Request) {
  const auth = await resolveAuth(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  const url = new URL(request.url);
  const marketplace = (url.searchParams.get("marketplace") ?? "amazon.com").toLowerCase();
  if (!MARKETPLACE_RE.test(marketplace)) {
    return jsonWithCors({ error: "Invalid marketplace" }, 400);
  }
  const asins = (url.searchParams.get("asins") ?? "")
    .split(",")
    .map((a) => a.trim().toUpperCase())
    .filter((a) => ASIN_RE.test(a));
  const uniqueAsins = Array.from(new Set(asins)).slice(0, EXT_MAX_BATCH);
  if (uniqueAsins.length === 0) {
    return jsonWithCors({ error: "asins must be a comma-separated list of 1-50 ASINs" }, 400);
  }

  const admin = createAdminClient();

  const { data: latestRows, error: latestError } = await admin
    .from("product_market_latest")
    .select(
      "asin, marketplace, price_cents, currency, bsr_rank, bsr_category, bought_past_month, category_label, brand, captured_at",
    )
    .eq("marketplace", marketplace)
    .in("asin", uniqueAsins);
  if (latestError) {
    if (isMissingTableError(latestError)) return migrationPendingResponse();
    console.error("extension/market: latest read failed", latestError);
    return jsonWithCors({ error: "Could not load market data" }, 500);
  }

  const { data: historyRows, error: historyError } = await admin
    .from("product_market_history")
    .select("asin, captured_at, price_cents, bsr_rank")
    .eq("marketplace", marketplace)
    .in("asin", uniqueAsins)
    .order("captured_at", { ascending: false })
    .limit(uniqueAsins.length * TREND_POINTS);
  if (historyError) {
    console.error("extension/market: history read failed", historyError);
  }

  // Fitted curves for the categories in play, seed-curve fallback otherwise.
  const categories = Array.from(
    new Set((latestRows ?? []).map((r) => r.bsr_category).filter((c): c is string => !!c)),
  );
  const fittedCurves = new Map<string, SalesCurve>();
  if (categories.length > 0) {
    const { data: curveRows } = await admin
      .from("product_sales_curves")
      .select("bsr_category, coef_a, coef_b")
      .in("bsr_category", categories);
    for (const c of curveRows ?? []) {
      fittedCurves.set(c.bsr_category, { coefA: c.coef_a, coefB: c.coef_b });
    }
  }

  const trendByAsin = new Map<string, Array<{ capturedAt: string; priceCents: number | null; bsrRank: number | null }>>();
  for (const row of historyRows ?? []) {
    const list = trendByAsin.get(row.asin) ?? [];
    if (list.length < TREND_POINTS) {
      list.push({ capturedAt: row.captured_at, priceCents: row.price_cents, bsrRank: row.bsr_rank });
      trendByAsin.set(row.asin, list);
    }
  }

  const products = (latestRows ?? []).map((row) => {
    const curve = (row.bsr_category ? fittedCurves.get(row.bsr_category) : null) ?? seedCurveFor(row.bsr_category);
    // History came back newest-first; reverse to oldest-first for charting.
    const trend = (trendByAsin.get(row.asin) ?? []).slice().reverse();
    return {
      asin: row.asin,
      marketplace: row.marketplace,
      priceCents: row.price_cents,
      currency: row.currency,
      bsrRank: row.bsr_rank,
      bsrCategory: row.bsr_category,
      boughtPastMonth: row.bought_past_month,
      categoryLabel: row.category_label,
      brand: row.brand,
      capturedAt: row.captured_at,
      estMonthlySales: estMonthlySales(row.bsr_rank, curve),
      estimateCalibrated: row.bsr_category ? fittedCurves.has(row.bsr_category) : false,
      trend,
    };
  });

  // Pooled catalogue data carries no per-user content, so it is safe to cache
  // at the edge by URL (same pattern as the catalogue route).
  return jsonWithCors({ ok: true, products }, 200);
}
