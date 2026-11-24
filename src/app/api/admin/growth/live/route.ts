/**
 * GET /api/admin/growth/live
 *
 * Just the realtime active-user count, for the sidebar badge next to Growth.
 * Much lighter than /api/admin/growth/ga (no summary, no cache write).
 * Returns { live: number | null }; null when GA is not configured or fails.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { isGaConfigured, fetchGaRealtime } from "@/lib/ga4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isGaConfigured()) return NextResponse.json({ live: null });
  const live = await fetchGaRealtime();
  return NextResponse.json({ live });
}
