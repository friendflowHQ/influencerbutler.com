/**
 * GET /api/cron/purge-market-history  (daily, CRON_SECRET-guarded, ?dry=1 to preview)
 * Caps the growth of product_market_history, the append-only pooled "internal
 * Keepa" trend log (not personal data, no privacy-policy entry - purely a
 * disk-IO/growth bound). Removes rows captured more than 25 months ago, one
 * month of buffer past the 24-month seasonality RPC window, up to one batch
 * per run (see src/lib/data-retention.ts). product_market_latest is untouched.
 */
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/scheduling-server";
import { verifyBearer } from "@/lib/auth-secret";
import { purgeProductMarketHistory } from "@/lib/data-retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyBearer(request, "CRON_SECRET")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const summary = await purgeProductMarketHistory(admin, { dry });
  console.log("[purge-market-history]", JSON.stringify(summary));
  return NextResponse.json({ ok: summary.errors === 0, ...summary });
}
