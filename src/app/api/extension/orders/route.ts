/**
 * /api/extension/orders - Amazon order history harvested by the extension's
 * Orders Butler tool: one row per (order, asin) line item. This is the browser
 * counterpart to the desktop Orders Butler runner, syncing the signed-in
 * account's purchase history to the caller's Influencer Butler workspace.
 *
 * POST (extension, Bearer license key): upsert a batch keyed on
 * (user_id, order_id, asin). An order line item is immutable history, so a
 * repeat sync of the same purchase is idempotent.
 * GET (dashboard or extension): recent line items newest-first.
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

const ORDER_ID_RE = /^\d{3}-\d{7}-\d{7}$/;

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
  const orders = (body as { orders?: unknown })?.orders;
  if (!Array.isArray(orders) || orders.length === 0 || orders.length > EXT_MAX_BATCH) {
    return jsonWithCors({ error: `orders must be an array of 1-${EXT_MAX_BATCH}` }, 400);
  }

  const now = new Date().toISOString();
  const rows = [];
  for (const raw of orders) {
    const order = raw as Record<string, unknown>;
    const orderId = typeof order.order_id === "string" ? order.order_id.trim() : "";
    const asin = typeof order.asin === "string" ? order.asin.toUpperCase() : "";
    const marketplace = typeof order.marketplace === "string" ? order.marketplace.toLowerCase() : "";
    const detectedAt = parseTimestamp(order.detected_at);
    if (
      !ORDER_ID_RE.test(orderId) ||
      !ASIN_RE.test(asin) ||
      !MARKETPLACE_RE.test(marketplace) ||
      !detectedAt
    ) {
      continue;
    }
    const orderDate = typeof order.order_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(order.order_date)
      ? order.order_date.slice(0, 10)
      : null;
    rows.push({
      user_id: auth.auth.userId,
      order_id: orderId,
      asin,
      marketplace,
      title: cleanString(order.title, EXT_TITLE_MAX),
      price_cents: clampInt(order.price_cents, 0, 100_000_000),
      currency: cleanString(order.currency, 8) ?? "USD",
      order_date: orderDate,
      detected_at: detectedAt,
      updated_at: now,
    });
  }
  if (rows.length === 0) {
    return jsonWithCors({ error: "No valid orders in batch" }, 400);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("extension_orders")
    .upsert(rows, { onConflict: "user_id,order_id,asin" });
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/orders: upsert failed", error);
    return jsonWithCors({ error: "Could not save orders" }, 500);
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
    .from("extension_orders")
    .select("order_id, asin, marketplace, title, price_cents, currency, order_date, detected_at")
    .eq("user_id", auth.auth.userId)
    .order("order_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/orders: list failed", error);
    return jsonWithCors({ error: "Could not load orders" }, 500);
  }

  const orders = data ?? [];
  const withCounts = await mergeVideoCounts(admin, auth.auth.userId, orders);
  return jsonWithCors({ ok: true, orders: withCounts });
}

type OrderRow = {
  order_id: string;
  asin: string;
  marketplace: string;
  title: string | null;
  price_cents: number | null;
  currency: string;
  order_date: string | null;
  detected_at: string;
};

// Video counts are a property of the product (ASIN), stored per scan in
// extension_product_scans, not of the order. So we look up the latest known
// breakdown for each ordered ASIN and attach it. Products never scanned come
// back with null counts, which the dashboard renders as "not scanned yet".
async function mergeVideoCounts(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  orders: OrderRow[],
) {
  const asins = [...new Set(orders.map((o) => o.asin))];
  if (asins.length === 0) return orders.map(withNullCounts);

  const { data, error } = await admin
    .from("extension_product_scans")
    .select(
      "asin, marketplace, influencer_video_count, brand_video_count, customer_video_count, scanned_at",
    )
    .eq("user_id", userId)
    .in("asin", asins);
  if (error) {
    // A missing scans table just means no counts yet; never fail the orders list
    // over it. Return orders with null counts so the view still renders.
    if (!isMissingTableError(error)) {
      console.error("extension/orders: scan-count merge failed", error);
    }
    return orders.map(withNullCounts);
  }

  const byKey = new Map<string, (typeof data)[number]>();
  for (const scan of data ?? []) {
    byKey.set(`${scan.marketplace}:${scan.asin}`, scan);
  }
  return orders.map((o) => {
    const scan = byKey.get(`${o.marketplace}:${o.asin}`);
    if (!scan) return withNullCounts(o);
    return {
      ...o,
      influencer_video_count: scan.influencer_video_count,
      brand_video_count: scan.brand_video_count,
      customer_video_count: scan.customer_video_count,
      total_video_count:
        scan.influencer_video_count + scan.brand_video_count + scan.customer_video_count,
      scanned_at: scan.scanned_at,
    };
  });
}

function withNullCounts(o: OrderRow) {
  return {
    ...o,
    influencer_video_count: null,
    brand_video_count: null,
    customer_video_count: null,
    total_video_count: null,
    scanned_at: null,
  };
}
