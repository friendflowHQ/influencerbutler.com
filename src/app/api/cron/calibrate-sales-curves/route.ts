/**
 * Cron: refit the per-category BSR -> monthly-sales curves from our own
 * co-captured data. On products where the extension saw BOTH a best-seller
 * rank and Amazon's real "bought in past month" figure, we regress one against
 * the other (in log-log space) to fit sales = a * rank^(-b) per BSR category.
 *
 * This is what lets us estimate sales without licensing Keepa's model: the
 * curves are calibrated to our own real observations and improve as the pool
 * grows. Seed curves in market-estimate.ts cover categories not yet fit.
 *
 * Scheduled in vercel.json. Guarded by CRON_SECRET like the other crons.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError } from "@/lib/extension-api";
import { fitSalesCurve } from "@/lib/market-estimate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Only fit categories with enough signal, and keep the query bounded.
const MIN_SAMPLES = 8;
const MAX_ROWS = 50_000;
const MIN_R_SQUARED = 0.2;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Pull recent observations that carry both signals. The partial index
  // product_market_history_calibration_idx keeps this cheap.
  const { data, error } = await admin
    .from("product_market_history")
    .select("bsr_category, bsr_rank, bought_past_month")
    .not("bsr_rank", "is", null)
    .not("bought_past_month", "is", null)
    .not("bsr_category", "is", null)
    .order("captured_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ ok: false, migrationPending: true });
    }
    console.error("calibrate-sales-curves: read failed", error);
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }

  // Group (rank, sales) observations by BSR category.
  const byCategory = new Map<string, Array<{ rank: number; sales: number }>>();
  for (const row of data ?? []) {
    const category = row.bsr_category as string;
    const rank = row.bsr_rank as number;
    const sales = row.bought_past_month as number;
    const list = byCategory.get(category) ?? [];
    list.push({ rank, sales });
    byCategory.set(category, list);
  }

  const now = new Date().toISOString();
  const curves: Array<{
    bsr_category: string;
    coef_a: number;
    coef_b: number;
    sample_size: number;
    r_squared: number;
    fit_at: string;
  }> = [];
  const skipped: Record<string, string> = {};

  for (const [category, points] of byCategory) {
    if (points.length < MIN_SAMPLES) {
      skipped[category] = `too few samples (${points.length})`;
      continue;
    }
    const fit = fitSalesCurve(points);
    if (!fit) {
      skipped[category] = "no usable fit";
      continue;
    }
    if (fit.rSquared < MIN_R_SQUARED) {
      skipped[category] = `low fit (r2=${fit.rSquared.toFixed(2)})`;
      continue;
    }
    curves.push({
      bsr_category: category,
      coef_a: fit.curve.coefA,
      coef_b: fit.curve.coefB,
      sample_size: fit.sampleSize,
      r_squared: fit.rSquared,
      fit_at: now,
    });
  }

  if (curves.length > 0) {
    const { error: upErr } = await admin
      .from("product_sales_curves")
      .upsert(curves, { onConflict: "bsr_category" });
    if (upErr) {
      console.error("calibrate-sales-curves: upsert failed", upErr);
      return NextResponse.json({ error: "upsert failed" }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    fitted: curves.map((c) => ({ category: c.bsr_category, n: c.sample_size, r2: c.r_squared })),
    skipped,
  });
}
