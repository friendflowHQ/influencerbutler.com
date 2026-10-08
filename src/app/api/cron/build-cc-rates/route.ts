/**
 * RETIRED. This cron used to rebuild the per-ASIN Creator Connections rate
 * table (extension_cc_rates, ~17M rows / 2.9 GB) from the R2 catalogue. Its
 * constant upserts consumed about two thirds of all Supabase database time and
 * exhausted the Disk IO budget (2026-10-08). /api/extension/cc-rates now reads
 * the same data from the asin-lookup Worker (src/lib/asin-lookup.ts), so there
 * is nothing left to build.
 *
 * The route stays as a no-op so the existing vercel.json schedule keeps
 * returning 200 until its entry is removed; then this file can be deleted.
 */
import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!verifyBearer(request, "CRON_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, skipped: "retired: rates are served by the asin-lookup Worker" });
}
