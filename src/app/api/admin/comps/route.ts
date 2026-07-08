/**
 * GET /api/admin/comps
 *
 * Every subscription started with a free-comp discount code, with the code, the
 * computed expiry (issue date + duration parsed from the code, or a manual
 * override), days remaining, and subscription/license status. Powers the admin
 * Comps page. Gated on licenses.view.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { loadComps } from "@/lib/comps-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("licenses.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await loadComps();
  if (!result) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  return NextResponse.json({
    admin: { email: actor.email },
    rows: result.rows,
    migrationPending: result.migrationPending,
  });
}
