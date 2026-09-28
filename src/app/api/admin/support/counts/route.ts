/**
 * GET /api/admin/support/counts
 * Ticket counts grouped by status, for the dashboard queue tiles. Proxies the
 * feedback Worker's /agent/counts behind the support.view permission.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { callSupportWorker } from "@/lib/support-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("support.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await callSupportWorker<{ counts: Record<string, number> }>("/agent/counts");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ counts: result.data.counts ?? {} });
}
