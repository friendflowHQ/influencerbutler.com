/**
 * GET /api/admin/catalogue-harvest/status
 *
 * Admin-only. Returns the latest harvest result for CC, SPCC, and Deals from
 * catalogue_harvest_status. Powers the in-dashboard "Catalogue harvest"
 * panel: shows last successful run, current freshness, and (if stale)
 * an action chip prompting the admin to trigger a fresh run.
 *
 * Response:
 *   200 { ok: true, cc: Row | null, spcc: Row | null, deals: Row | null }
 *   403 { error: "Forbidden" }
 *   500 { error: ... }
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusRow = {
  kind: string;
  status: string;
  message: string | null;
  version: string | null;
  snapshot_at: string | null;
  campaign_count: number;
  duration_ms: number;
  reported_at: string;
};

type ReadClient = {
  from: (table: string) => {
    select: (cols: string) => Promise<{
      data: StatusRow[] | null;
      error: unknown;
    }>;
  };
};

export async function GET(request: Request) {
  const actor = await requirePermission("catalogue.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as ReadClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("catalogue_harvest_status")
    .select("kind,status,message,version,snapshot_at,campaign_count,duration_ms,reported_at");

  if (error) {
    console.error("catalogue-harvest status read failed", error);
    return NextResponse.json({ error: "Read failed" }, { status: 500 });
  }

  const rows = data ?? [];
  const cc = rows.find((r) => r.kind === "cc") ?? null;
  const spcc = rows.find((r) => r.kind === "spcc") ?? null;
  const deals = rows.find((r) => r.kind === "deals") ?? null;

  return NextResponse.json({
    ok: true,
    admin: { email: actor.email },
    cc,
    spcc,
    deals,
  });
}
